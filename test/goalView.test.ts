import { describe, expect, it } from 'vitest';
import { goalProgress, logFrom, type GoalRule } from '../src/shared/goals.ts';
import type { Goal } from '../src/shared/types.ts';
import {
  amountChips,
  canLogOn,
  goalCalendar,
  groupLogs,
  minMonthOffset,
  previewLog,
  spanLabel,
  spanText,
  statusText,
} from '../src/web/goalView.ts';

// 2026-10-20 は火曜
const T = '2026-10-20';
const pool: GoalRule = { kind: 'rate', period: 'week', target: 2, unit: '回', startDate: '2026-09-28', endDate: null };
const words: GoalRule = { kind: 'rate', period: 'day', target: 30, unit: '語', startDate: '2026-10-14', endDate: null };
const book: GoalRule = { kind: 'total', period: null, target: 300, unit: 'ページ', startDate: '2026-10-01', endDate: '2026-10-30' };
const asGoal = (r: GoalRule, logs: { date: string; amount: number }[]): Goal => ({
  id: 1,
  code: 'G-001',
  title: 'x',
  notes: '',
  position: 1,
  archived: false,
  createdAt: '',
  updatedAt: '',
  ...r,
  progress: goalProgress(r, logs, T),
});

describe('目標の見せ方（design 7-15）', () => {
  it('期間の呼び方: 今週・先週・範囲／今日・昨日／今月・先月・月', () => {
    expect([spanLabel('week', '2026-10-19', T), spanLabel('week', '2026-10-12', T), spanLabel('week', '2026-10-05', T)]).toEqual([
      '今週',
      '先週',
      '10/5〜10/11',
    ]);
    expect([spanLabel('day', T, T), spanLabel('day', '2026-10-19', T)]).toEqual(['今日', '昨日']);
    expect([spanLabel('month', '2026-10-01', T), spanLabel('month', '2026-09-01', T), spanLabel('month', '2026-07-01', T)]).toEqual([
      '今月',
      '先月',
      '7月',
    ]);
    expect(spanLabel('month', '2025-12-01', T)).toBe('2025年12月');
  });

  it('記録できる日: 週の途中から始めてもその週の頭から・先の日は不可', () => {
    const mid = { ...pool, startDate: '2026-10-22' };
    expect(logFrom(mid)).toBe('2026-10-19');
    expect([canLogOn(mid, '2026-10-19', T), canLogOn(mid, '2026-10-18', T), canLogOn(mid, '2026-10-21', T)]).toEqual([true, false, false]);
  });

  it('記録したらどうなるか: 過去の週に足せばその週で数える・ちょうど達成なら印', () => {
    const logs = [
      { date: '2026-10-13', amount: 1 },
      { date: '2026-10-20', amount: 1 },
    ];
    expect(previewLog(pool, logs, T, { date: T, amount: 1 })).toEqual({ text: '今週 2/2回 ✓ 達成', achieved: true, justAchieved: true });
    expect(previewLog(pool, logs, T, { date: '2026-10-15', amount: 1 }).text).toBe('先週 2/2回 ✓ 達成');
    expect(previewLog(pool, [], T, { date: T, amount: 1 }).text).toBe('今週 1/2回・あと 1回');
    expect(previewLog(book, [{ date: '2026-10-05', amount: 150 }], T, { date: T, amount: 30 }).text).toBe('180/300ページ（予定より 20 遅れ）');
  });

  it('状態の一言とお知らせの文', () => {
    expect(statusText(asGoal(pool, [{ date: T, amount: 1 }]), T)).toBe('あと 1回（残り6日）');
    expect(statusText(asGoal(pool, [{ date: T, amount: 2 }]), T)).toBe('達成 ✓');
    expect(statusText(asGoal(words, [{ date: T, amount: 12 }]), T)).toBe('あと 18語');
    expect(statusText(asGoal(book, [{ date: '2026-10-05', amount: 150 }]), T)).toBe('予定より 50 遅れ・1日 14ページ で間に合う');
    expect(statusText(asGoal({ ...pool, startDate: '2026-10-26' }, []), T)).toBe('10/26(月) から数える');
    expect(spanText(pool, [{ date: '2026-10-13', amount: 2 }], '2026-10-13', T)).toBe('先週 2/2回 ✓');
  });

  it('量のチップ: あと N で達成・前回と同じ（同じ量は1つ）', () => {
    const logs = [
      { date: '2026-10-19', amount: 12 },
      { date: '2026-10-18', amount: 30 },
    ];
    expect(amountChips(asGoal(words, logs), logs, T)).toEqual([
      { label: 'あと 30 で達成', value: 30 },
      { label: '前回と同じ 12', value: 12 },
    ]);
    expect(amountChips(asGoal(words, logs), logs, '2026-10-19')).toEqual([
      { label: 'あと 18 で達成', value: 18 },
      { label: '前回と同じ 12', value: 12 },
    ]);
    const b = asGoal(book, [{ date: '2026-10-05', amount: 150 }]);
    expect(amountChips(b, [{ date: '2026-10-05', amount: 150 }], T).map((c) => c.label)).toEqual(['1日の目安 14', '前回と同じ 150']);
  });

  it('カレンダー: 月曜はじまり・日ごとの量・週の合計（数える範囲の週だけ）・押せる日', () => {
    const logs = [
      { date: '2026-09-29', amount: 1 },
      { date: '2026-10-02', amount: 1 },
      { date: '2026-10-07', amount: 1 },
      { date: '2026-10-20', amount: 1 },
      { date: '2026-10-20', amount: 1 },
    ];
    const cal = goalCalendar(pool, logs, T, 0);
    expect(cal.title).toBe('2026年10月');
    expect(cal.weeks[0]!.days[0]!.date).toBe('2026-09-28');
    // 先の週（10/26〜）は数えない（合計を出さない・押せない）
    expect(cal.weeks.map((w) => w.sum)).toEqual([2, 1, 0, 2, null]);
    expect(cal.weeks.map((w) => w.achieved)).toEqual([true, false, false, true, false]);
    expect(cal.weeks[4]!.days.every((d) => !d.loggable)).toBe(true);
    const tue = cal.weeks[3]!.days[1]!;
    expect([tue.date, tue.sum, tue.isToday, tue.loggable]).toEqual([T, 2, true, true]);
    expect(cal.monthSum).toBe(4);
    expect(minMonthOffset(pool, T)).toBe(-1);
    expect(goalCalendar(pool, logs, T, -1).title).toBe('2026年9月');
    // 1日ごと: 届いた日に印
    const w = goalCalendar(words, [{ date: '2026-10-19', amount: 30 }, { date: T, amount: 5 }], T, 0);
    const mon = w.weeks[3]!.days[0]!;
    expect([mon.achieved, w.weeks[3]!.days[1]!.achieved, w.weeks[3]!.sum]).toEqual([true, false, null]);
  });

  it('記録の一覧: 週ごと（今の週は記録が無くても出す）・日ごとに合計して一言を並べる', () => {
    const logs = [
      { date: '2026-10-14', amount: 1, note: '90分' },
      { date: '2026-10-14', amount: 1, note: '' },
      { date: '2026-10-07', amount: 1, note: '5km' },
    ];
    const groups = groupLogs(pool, logs, T);
    expect(groups.map((g) => [g.label, g.range, g.summary, g.days.length])).toEqual([
      ['今週', '10/19〜10/25', '0/2回', 0],
      ['先週', '10/12〜10/18', '2/2回 ✓', 1],
      ['10/5〜10/11', null, '1/2回', 1],
    ]);
    expect(groups[1]!.days[0]).toMatchObject({ date: '2026-10-14', sum: 2, notes: ['90分'], count: 2 });
    // 1日ごとは週でまとめて、届いた日を数える（10/14〜10/20 のうち、その週に数えた日）
    const w = groupLogs(words, [{ date: '2026-10-19', amount: 30 }, { date: T, amount: 5 }, { date: '2026-10-15', amount: 30 }], T);
    expect(w.map((g) => g.summary)).toEqual(['達成 1/2日', '達成 1/5日']);
    // 期限までは月ごと
    expect(groupLogs(book, [{ date: '2026-10-05', amount: 24 }], T).map((g) => [g.label, g.summary])).toEqual([['今月', '24ページ']]);
  });
});
