import { describe, expect, it } from 'vitest';
import type { Category, Task } from '../src/shared/types.ts';
import { activeChips, applyFilter, countActive, EMPTY_FILTER, normalizeFilter, type TaskFilter } from '../src/web/filter.ts';

const TODAY = '2026-10-13';
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
const f = (p: Partial<TaskFilter>): TaskFilter => ({ ...EMPTY_FILTER, ...p });
const ids = (ts: Task[]) => ts.map((t) => t.id);

describe('絞り込み（design 7-10）', () => {
  it('条件なしなら全部そのまま', () => {
    const ts = [task(), task()];
    expect(applyFilter(ts, EMPTY_FILTER, TODAY)).toBe(ts);
    expect(countActive(EMPTY_FILTER)).toBe(0);
  });
  it('カテゴリは複数選択で OR（0 はカテゴリなし）', () => {
    const a = task({ categoryId: 1 });
    const b = task({ categoryId: 2 });
    const c = task({ categoryId: null });
    expect(ids(applyFilter([a, b, c], f({ categories: [1, 0] }), TODAY))).toEqual([a.id, c.id]);
  });
  it('締切: 期限切れ・今日まで・7日以内・締切なし', () => {
    const over = task({ dueDate: '2026-10-12' });
    const today = task({ dueDate: TODAY });
    const d7 = task({ dueDate: '2026-10-20' });
    const d8 = task({ dueDate: '2026-10-21' });
    const none = task();
    const all = [over, today, d7, d8, none];
    expect(ids(applyFilter(all, f({ due: 'overdue' }), TODAY))).toEqual([over.id]);
    expect(ids(applyFilter(all, f({ due: 'today' }), TODAY))).toEqual([over.id, today.id]);
    expect(ids(applyFilter(all, f({ due: 'week' }), TODAY))).toEqual([over.id, today.id, d7.id]);
    expect(ids(applyFilter(all, f({ due: 'none' }), TODAY))).toEqual([none.id]);
  });
  it('やる日: 今日（持ち越し含む）・7日以内・未定', () => {
    const today = task({ doDates: [{ date: TODAY, minutes: null }] });
    const carried = task({ doDates: [{ date: '2026-10-10', minutes: null }] });
    const later = task({ doDates: [{ date: '2026-10-10', minutes: null }, { date: '2026-10-25', minutes: null }] });
    const none = task();
    const all = [today, carried, later, none];
    expect(ids(applyFilter(all, f({ doDate: 'today' }), TODAY))).toEqual([today.id, carried.id]);
    expect(ids(applyFilter(all, f({ doDate: 'none' }), TODAY))).toEqual([none.id]);
  });
  it('項目どうしは AND（バイト かつ 7日以内 かつ 優先度高）', () => {
    const hit = task({ categoryId: 2, dueDate: '2026-10-15', priority: 1 });
    const lowPri = task({ categoryId: 2, dueDate: '2026-10-15', priority: 3 });
    const otherCat = task({ categoryId: 1, dueDate: '2026-10-15', priority: 1 });
    const filter = f({ categories: [2], due: 'week', priorities: [1] });
    expect(ids(applyFilter([hit, lowPri, otherCat], filter, TODAY))).toEqual([hit.id]);
    expect(countActive(filter)).toBe(3);
  });
  it('チップは1つずつ外せる', () => {
    const cats = new Map<number, Category>([[2, { id: 2, name: 'バイト' } as Category]]);
    const filter = f({ categories: [2], due: 'week', statuses: ['waiting'] });
    const chips = activeChips(filter, cats);
    expect(chips.map((c) => c.label)).toEqual(['バイト', '締切: 7日以内', '待ち']);
    expect(chips[1]!.remove(filter)).toEqual(f({ categories: [2], statuses: ['waiting'] }));
  });
  it('保存してあった壊れた値でも使える形に戻す', () => {
    expect(normalizeFilter(null)).toEqual(EMPTY_FILTER);
    expect(normalizeFilter({ due: 'yesterday', categories: 'x' })).toEqual(EMPTY_FILTER);
    expect(normalizeFilter({ due: 'week' }).due).toBe('week');
  });
});
