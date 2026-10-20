import { describe, expect, it } from 'vitest';
import { rankNext } from '../src/shared/next.ts';
import { askToClose, forAction, forCalendar, isContainer, nextSteps } from '../src/shared/series.ts';
import type { Task } from '../src/shared/types.ts';
import { taskLine } from '../src/server/format.ts';
import { setup } from './helpers.ts';

const TODAY = '2026-10-20';
let seq = 500;
function task(p: Partial<Task> = {}): Task {
  const id = p.id ?? ++seq;
  return {
    id,
    code: `T-${id}`,
    parentId: null,
    parentTitle: null,
    position: id,
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

describe('親はまとめ役（design 4-3）', () => {
  it('並べるビュー: 子が残っている親を外し、締切の無い「いま着手できる子」だけが親の締切を受け継ぐ', () => {
    const parent = task({ title: 'ブログ', dueDate: '2026-11-01', children: { total: 3, done: 0 } });
    const first = task({ title: 'ネタ決め', parentId: parent.id });
    const blocked = task({ title: '本文', parentId: parent.id, blocked: true });
    const own = task({ title: '公開', parentId: parent.id, dueDate: '2026-10-30' });
    const list = forAction([parent, first, blocked, own]);
    expect(list.map((t) => t.title)).toEqual(['ネタ決め', '本文', '公開']);
    const byTitle = new Map(list.map((t) => [t.title, t]));
    expect(byTitle.get('ネタ決め')).toMatchObject({ dueDate: '2026-11-01', dueFrom: { id: parent.id, title: 'ブログ' } });
    expect(byTitle.get('本文')!.dueDate).toBeNull();
    expect(byTitle.get('公開')).toMatchObject({ dueDate: '2026-10-30' });
    expect(byTitle.get('公開')!.dueFrom).toBeUndefined();
  });

  it('孫は、祖先の締切のうちいちばん早いものを受け継ぐ・締切の無い親からは何も受け継がない', () => {
    const top = task({ title: '全体', dueDate: '2026-11-30', children: { total: 1, done: 0 } });
    const mid = task({ title: '途中', parentId: top.id, dueDate: '2026-11-10', children: { total: 1, done: 0 } });
    const leaf = task({ title: '工程', parentId: mid.id });
    const project = task({ title: '開発', children: { total: 1, done: 0 } });
    const step = task({ title: '機能', parentId: project.id });
    const list = forAction([top, mid, leaf, project, step]);
    expect(list.map((t) => t.title)).toEqual(['工程', '機能']);
    expect(list[0]).toMatchObject({ dueDate: '2026-11-10', dueFrom: { id: mid.id } });
    expect(list[1]!.dueDate).toBeNull();
  });

  it('子が全部終わった親は並べるビューに残る（閉じるまで）・日付のビューでは親のやる日を消して締切だけ残す', () => {
    const finished = task({ title: '済んだ親', dueDate: '2026-10-25', children: { total: 2, done: 2 } });
    const container = task({
      title: '続く親',
      dueDate: '2026-10-28',
      doDates: [{ date: TODAY, minutes: null }],
      children: { total: 2, done: 1 },
    });
    expect(isContainer(finished)).toBe(false);
    expect(forAction([finished]).map((t) => t.title)).toEqual(['済んだ親']);
    const [cal] = forCalendar([container]);
    expect(cal).toMatchObject({ dueDate: '2026-10-28', doDates: [] });
  });

  it('いま着手できる子: 並び順に、子もまた親ならその子へ下りる', () => {
    const top = task({ title: '全体', children: { total: 3, done: 0 } });
    const b = task({ title: 'B', parentId: top.id, position: 2 });
    const a = task({ title: 'A', parentId: top.id, position: 1, children: { total: 1, done: 0 } });
    const a1 = task({ title: 'A1', parentId: a.id });
    const waiting = task({ title: '待ち', parentId: top.id, position: 3, status: 'waiting' });
    const steps = nextSteps([top, b, a, a1, waiting]);
    expect(steps.get(top.id)!.map((t) => t.title)).toEqual(['A1', 'B']);
    expect(steps.get(a.id)!.map((t) => t.title)).toEqual(['A1']);
  });

  it('「閉じる？」は子が全部終わって、締切かやる日がある親だけ', () => {
    expect(askToClose(task({ dueDate: '2026-10-25', children: { total: 2, done: 2 } }))).toBe(true);
    expect(askToClose(task({ doDates: [{ date: TODAY, minutes: null }], children: { total: 1, done: 1 } }))).toBe(true);
    expect(askToClose(task({ title: '開発', children: { total: 2, done: 2 } }))).toBe(false);
    expect(askToClose(task({ dueDate: '2026-10-25', children: { total: 2, done: 1 } }))).toBe(false);
    expect(askToClose(task({ dueDate: '2026-10-25' }))).toBe(false);
  });

  it('次にやること: 子が全部終わった親は入れない', () => {
    const finished = task({ title: '済んだ親', doDates: [{ date: TODAY, minutes: null }], children: { total: 1, done: 1 } });
    const single = task({ title: 'ふつう', doDates: [{ date: TODAY, minutes: null }] });
    expect(rankNext([finished, single], TODAY).map((n) => n.task.title)).toEqual(['ふつう']);
  });
});

describe('今日の画面と MCP（design 4-3）', () => {
  it('子が残っている親は締切間近から外して「シリーズの締切」へ・子が全部終わった親は「閉じる？」へ', () => {
    const { tasks } = setup(TODAY);
    const blog = tasks.create({ title: 'ブログ', dueDate: '2026-10-25' });
    const idea = tasks.create({ title: 'ネタ決め', parentId: blog.id });
    tasks.create({ title: '本文', parentId: blog.id, dependsOn: [idea.id] });
    const done = tasks.create({ title: '申請', dueDate: '2026-10-24' });
    const step = tasks.create({ title: '書類', parentId: done.id });
    tasks.update(step.id, { status: 'done' });
    const plain = tasks.create({ title: 'ふつう', dueDate: '2026-10-23' });
    const project = tasks.create({ title: '開発' });
    const feature = tasks.create({ title: '機能', parentId: project.id });
    tasks.update(feature.id, { status: 'done' });

    const v = tasks.today();
    expect(v.dueSoon.map((t) => t.id)).toEqual([plain.id]);
    expect(v.seriesDue.map((t) => t.id)).toEqual([blog.id]);
    expect(v.steps[blog.id]).toEqual([idea.code]);
    expect(v.closable.map((t) => t.id)).toEqual([done.id]);
    expect(v.ranked.map((n) => n.task.title)).toEqual(['ふつう', 'ネタ決め']);
    expect(v.ranked[1]!.via).toMatchObject({ id: blog.id });
  });

  it('1行表記: 親は「シリーズ」と次の工程、子が全部終わった親は「全部済」', () => {
    const { tasks } = setup(TODAY);
    const blog = tasks.create({ title: 'ブログ' });
    const idea = tasks.create({ title: 'ネタ決め', parentId: blog.id });
    tasks.create({ title: '本文', parentId: blog.id, dependsOn: [idea.id] });
    const all = tasks.all();
    const steps = new Map([...nextSteps(all)].map(([id, ts]) => [id, ts.map((t) => t.code)]));
    const line = (id: number) => taskLine(all.find((t) => t.id === id)!, new Map(), steps);
    expect(line(blog.id)).toContain(`シリーズ0/2 次:${idea.code}`);
    tasks.update(idea.id, { status: 'done' });
    const [rest] = tasks.all({ q: '本文' });
    tasks.update(rest!.id, { status: 'done' });
    const [closed] = tasks.all({ q: 'ブログ' });
    expect(taskLine(closed!, new Map())).toContain('子2/2 全部済');
  });
});
