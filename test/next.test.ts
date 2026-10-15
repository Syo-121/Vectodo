import { describe, expect, it } from 'vitest';
import { needDays, nextReason, rankNext, waitingSoon } from '../src/shared/next.ts';
import type { Task } from '../src/shared/types.ts';
import { setup } from './helpers.ts';

const TODAY = '2026-10-14';
let seq = 100;
function task(p: Partial<Task> = {}): Task {
  const id = p.id ?? ++seq;
  return {
    id,
    code: `T-${id}`,
    parentId: null,
    parentTitle: null,
    position: 0,
    title: `t${id}`,
    status: 'todo',
    categoryId: null,
    priority: null,
    dueDate: null,
    dueTime: null,
    estimateMin: null,
    notes: '',
    recurrence: null,
    legacyId: null,
    actualMin: null,
    createdAt: `${TODAY}T09:00:00+09:00`,
    updatedAt: `${TODAY}T09:00:00+09:00`,
    completedAt: null,
    doDates: [],
    dependsOn: [],
    blocked: false,
    children: { total: 0, done: 0 },
    ...p,
  };
}
const day = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('次にやること（design 4-10）', () => {
  it('段の順: 期限切れ → 今日締切（時刻順）→ 進行中 → 今日やる日 → 締切が迫る → 7日以内 → 急がないけど高', () => {
    const list = [
      task({ title: '高だけ', priority: 1 }),
      task({ title: '5日後', dueDate: day(5), estimateMin: 60 }),
      task({ title: '迫る', dueDate: day(2), estimateMin: 60 }),
      task({ title: '今日やる', doDates: [{ date: TODAY, minutes: 60 }] }),
      task({ title: '進行中', status: 'doing' }),
      task({ title: '今日18時', dueDate: TODAY, dueTime: '18:00' }),
      task({ title: '今日9時', dueDate: TODAY, dueTime: '09:00' }),
      task({ title: '過ぎた', dueDate: day(-1) }),
    ];
    expect(rankNext(list, TODAY).map((n) => [n.task.title, n.kind])).toEqual([
      ['過ぎた', 'overdue'],
      ['今日9時', 'dueToday'],
      ['今日18時', 'dueToday'],
      ['進行中', 'doing'],
      ['今日やる', 'doToday'],
      ['迫る', 'atRisk'],
      ['5日後', 'dueSoon'],
      ['高だけ', 'important'],
    ]);
  });

  it('着手できないもの（待ち・依存待ち）と、候補にならないもの（先の締切・日付も優先度も無い）は入れない', () => {
    const list = [
      task({ title: '待ち', status: 'waiting', dueDate: TODAY }),
      task({ title: '依存待ち', blocked: true, dueDate: TODAY }),
      task({ title: '10日後', dueDate: day(10), priority: 1 }),
      task({ title: 'なにもなし' }),
      task({ title: '済', status: 'done', dueDate: TODAY }),
    ];
    expect(rankNext(list, TODAY)).toEqual([]);
    expect(waitingSoon(list, TODAY).map((t) => t.title)).toEqual(['待ち', '依存待ち']);
  });

  it('締切が迫る＝締切までの日数 − 必要な日数（見積÷2h 切り上げ・なしは2h 扱いで1日）≦ 2', () => {
    expect([needDays(null), needDays(60), needDays(120), needDays(240), needDays(480)]).toEqual([1, 1, 1, 2, 4]);
    const kinds = rankNext(
      [
        task({ title: '3日後1h', dueDate: day(3), estimateMin: 60 }),
        task({ title: '4日後1h', dueDate: day(4), estimateMin: 60 }),
        task({ title: '6日後1日+', dueDate: day(6), estimateMin: 480 }),
      ],
      TODAY,
    ).map((n) => [n.task.title, n.kind]);
    expect(kinds).toEqual([
      // 余裕はどちらも 2（3−1・6−4）。余裕が同じなら優先度、次に締切が早い順
      ['3日後1h', 'atRisk'],
      ['6日後1日+', 'atRisk'],
      ['4日後1h', 'dueSoon'],
    ]);
  });

  it('見積 30m 以下の小さいタスクは、締切の前日から「締切が迫る」', () => {
    const kinds = rankNext(
      [
        task({ title: '明後日5m', dueDate: day(2), estimateMin: 5 }),
        task({ title: '明日5m', dueDate: day(1), estimateMin: 5 }),
        task({ title: '明後日見積なし', dueDate: day(2) }),
      ],
      TODAY,
    ).map((n) => [n.task.title, n.kind]);
    expect(kinds).toEqual([
      ['明日5m', 'atRisk'],
      ['明後日見積なし', 'atRisk'],
      ['明後日5m', 'dueSoon'],
    ]);
  });

  it('子が残っている親は出さず、着手できる子に段を受け継ぐ（子自身の段が上ならそちら）', () => {
    const parent = task({ id: 10, title: '10/18 ブログ', doDates: [{ date: TODAY, minutes: null }], children: { total: 3, done: 1 } });
    const done = task({ id: 11, parentId: 10, title: 'ネタ', status: 'done' });
    const next = task({ id: 12, parentId: 10, title: '執筆' });
    const later = task({ id: 13, parentId: 10, title: '公開', blocked: true });
    const doing = task({ id: 14, parentId: 10, title: '画像', status: 'doing' });
    const ranked = rankNext([parent, done, next, later, doing], TODAY);
    expect(ranked.map((n) => [n.task.title, n.kind, n.via?.title ?? null])).toEqual([
      ['画像', 'doing', null],
      ['執筆', 'doToday', '10/18 ブログ'],
    ]);
    expect(nextReason(ranked[1]!)).toBe('「10/18 ブログ」の次の工程（今日やると決めた）');
  });

  it('理由の一言', () => {
    const r = (p: Partial<Task>) => nextReason(rankNext([task(p)], TODAY)[0]!);
    expect(r({ dueDate: day(-2) })).toBe('締切を2日過ぎている');
    expect(r({ dueDate: TODAY, dueTime: '14:55' })).toBe('今日 14:55 が締切');
    // 時刻を渡すと、過ぎた今日締切はそう言う（ちょうどの時刻はまだ過ぎていない）
    const due = rankNext([task({ dueDate: TODAY, dueTime: '14:55' })], TODAY)[0]!;
    expect([nextReason(due, '14:55'), nextReason(due, '14:56')]).toEqual(['今日 14:55 が締切', '今日 14:55 の締切を過ぎた']);
    expect(r({ dueDate: TODAY })).toBe('今日が締切');
    expect(r({ status: 'doing' })).toBe('手を付けている途中');
    expect(r({ doDates: [{ date: day(-1), minutes: null }] })).toBe('やる日を過ぎて持ち越し');
    expect(r({ dueDate: day(2), estimateMin: 240 })).toBe('締切まであと2日・見積半日');
    expect(r({ dueDate: day(2) })).toBe('締切まであと2日');
    expect(r({ dueDate: day(6) })).toBe('締切まであと6日');
    expect(r({ priority: 1 })).toBe('急がないけど優先度「高」');
  });

  it('今日の画面（サーバ）に ranked と waiting が入る', () => {
    const { tasks } = setup(TODAY);
    const a = tasks.create({ title: '予習', dueDate: TODAY, dueTime: '14:55', estimateMin: 60, priority: 1 });
    tasks.create({ title: '後', dependsOn: [a.id], dueDate: day(1) });
    tasks.create({ title: '進行中', status: 'doing' });
    const v = tasks.today();
    expect(v.ranked.map((n) => n.task.title)).toEqual(['予習', '進行中']);
    expect(v.waiting.map((t) => t.title)).toEqual(['後']);
    // 今日の流れの締切の印: 今日が締切で時刻のあるものだけ
    expect(v.deadlines.map((t) => t.title)).toEqual(['予習']);
    // 空きに置いたもの: 今日のやる日に時刻があるものだけ（時刻順）
    tasks.setDoDates(a.id, [{ date: TODAY, minutes: 60, start: '12:00' }]);
    const b = tasks.create({ title: '朝', doDates: [{ date: TODAY, minutes: null, start: '09:30' }] });
    tasks.create({ title: '明日', doDates: [{ date: day(1), minutes: null, start: '09:00' }] });
    expect(tasks.today().placed.map((t) => t.title)).toEqual(['朝', '予習']);
    // かかった時間は完了のあとに残せる
    tasks.update(b.id, { status: 'done' });
    expect(tasks.update(b.id, { actualMin: 20 }).actualMin).toBe(20);
    expect(tasks.today().placed.map((t) => t.title)).toEqual(['予習']);
  });
});
