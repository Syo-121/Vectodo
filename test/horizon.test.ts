import { describe, expect, it } from 'vitest';
import type { Category, Task } from '../src/shared/types.ts';
import { hiddenFromPlan, isFar, splitFar } from '../src/web/horizon.ts';
import { setup } from './helpers.ts';

const TODAY = '2026-10-14';
const cat = (p: Partial<Category> & { id: number }): Category => ({
  name: `c${p.id}`,
  color: '#000000',
  position: p.id,
  archived: false,
  gcalCalendarId: null,
  hideAfterDays: null,
  hideFromPlan: false,
  ...p,
});
const CATS = new Map([
  [1, cat({ id: 1, name: 'バイト', hideAfterDays: 14, hideFromPlan: true })],
  [2, cat({ id: 2, name: '生活' })],
]);
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
    categoryId: 1,
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

describe('先の分を隠す（design 4-9）', () => {
  it('締切（無ければ最初のやる日）が今日＋日数より先の、未着手・待ちだけを隠す', () => {
    expect(isFar(task({ dueDate: '2026-10-28' }), CATS, TODAY)).toBe(false); // ちょうど14日後は出す
    expect(isFar(task({ dueDate: '2026-10-29' }), CATS, TODAY)).toBe(true);
    expect(isFar(task({ doDates: [{ date: '2026-11-30', minutes: null }] }), CATS, TODAY)).toBe(true);
    expect(isFar(task({}), CATS, TODAY)).toBe(false); // 日付なしは隠さない
    expect(isFar(task({ dueDate: '2026-12-01', status: 'waiting' }), CATS, TODAY)).toBe(true);
    expect(isFar(task({ dueDate: '2026-12-01', status: 'doing' }), CATS, TODAY)).toBe(false); // 手を付けているものは出す
    expect(isFar(task({ dueDate: '2026-12-01', status: 'done' }), CATS, TODAY)).toBe(false);
    expect(isFar(task({ dueDate: '2026-12-01', categoryId: 2 }), CATS, TODAY)).toBe(false); // 設定なしのカテゴリ
    expect(isFar(task({ dueDate: '2026-12-01', categoryId: null }), CATS, TODAY)).toBe(false);
  });

  it('隠したものはカテゴリごとに件数といちばん先の日付をまとめる', () => {
    const tasks = [
      task({ dueDate: '2026-10-20' }),
      task({ dueDate: '2026-11-05' }),
      task({ dueDate: '2027-01-29' }),
      task({ dueDate: '2026-12-01', categoryId: 2 }),
    ];
    const { near, far } = splitFar(tasks, CATS, TODAY);
    expect(near.map((t) => t.dueDate)).toEqual(['2026-10-20', '2026-12-01']);
    expect(far.map((g) => [g.category.name, g.count, g.last])).toEqual([['バイト', 2, '2027-01-29']]);
  });

  it('計画待ちに出さないカテゴリ', () => {
    expect(hiddenFromPlan(task({}), CATS)).toBe(true);
    expect(hiddenFromPlan(task({ categoryId: 2 }), CATS)).toBe(false);
    expect(hiddenFromPlan(task({ categoryId: null }), CATS)).toBe(false);
  });

  it('カテゴリに保存できる（既定は隠さない・計画待ちに出す）', () => {
    const { categories } = setup();
    const c = categories.create({ name: 'バイト' });
    expect([c.hideAfterDays, c.hideFromPlan]).toEqual([null, false]);
    const u = categories.update(c.id, { hideAfterDays: 14, hideFromPlan: true });
    expect([u.hideAfterDays, u.hideFromPlan]).toEqual([14, true]);
    expect(categories.update(c.id, { hideAfterDays: null }).hideAfterDays).toBeNull();
  });
});
