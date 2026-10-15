// 一覧・ボードの絞り込み（design 7-10）。項目どうしは AND、同じ項目の中の複数選択は OR。
// 画面に依存しない純粋関数だけを置く（test/filter.test.ts）。

import { STATUS_LABEL, type Status } from '../shared/constants.ts';
import { addDays, maxDate } from '../shared/dates.ts';
import type { Category, Task } from '../shared/types.ts';

export type DueFilter = 'any' | 'overdue' | 'today' | 'week' | 'month' | 'has' | 'none';
export type DoFilter = 'any' | 'today' | 'week' | 'none';

export interface TaskFilter {
  /** カテゴリ番号（0 = カテゴリなし）。空なら全部 */
  categories: number[];
  due: DueFilter;
  doDate: DoFilter;
  /** 1=高 2=中 3=低 0=未設定。空なら全部 */
  priorities: number[];
  /** 空なら全部 */
  statuses: Status[];
}

export const EMPTY_FILTER: TaskFilter = { categories: [], due: 'any', doDate: 'any', priorities: [], statuses: [] };

export const DUE_OPTIONS: [DueFilter, string][] = [
  ['overdue', '期限切れ'],
  ['today', '今日まで'],
  ['week', '7日以内'],
  ['month', '30日以内'],
  ['has', '締切あり'],
  ['none', '締切なし'],
];

export const DO_OPTIONS: [DoFilter, string][] = [
  ['today', '今日（持ち越し含む）'],
  ['week', '7日以内'],
  ['none', '未定'],
];

export const PRIORITY_OPTIONS: [number, string][] = [
  [1, '高'],
  [2, '中'],
  [3, '低'],
  [0, '未設定'],
];

/** 保存してあった古い形・壊れた値でも使える形にそろえる */
export function normalizeFilter(f: unknown): TaskFilter {
  const o = (f && typeof f === 'object' ? f : {}) as Partial<TaskFilter>;
  return {
    categories: Array.isArray(o.categories) ? o.categories : [],
    due: DUE_OPTIONS.some(([v]) => v === o.due) ? o.due! : 'any',
    doDate: DO_OPTIONS.some(([v]) => v === o.doDate) ? o.doDate! : 'any',
    priorities: Array.isArray(o.priorities) ? o.priorities : [],
    statuses: Array.isArray(o.statuses) ? o.statuses : [],
  };
}

export function matchesFilter(t: Task, f: TaskFilter, today: string): boolean {
  if (f.categories.length && !f.categories.includes(t.categoryId ?? 0)) return false;
  if (f.priorities.length && !f.priorities.includes(t.priority ?? 0)) return false;
  if (f.statuses.length && !f.statuses.includes(t.status)) return false;

  const due = t.dueDate;
  switch (f.due) {
    case 'overdue':
      if (!due || due >= today) return false;
      break;
    case 'today':
      if (!due || due > today) return false;
      break;
    case 'week':
      if (!due || due > addDays(today, 7)) return false;
      break;
    case 'month':
      if (!due || due > addDays(today, 30)) return false;
      break;
    case 'has':
      if (!due) return false;
      break;
    case 'none':
      if (due) return false;
      break;
  }

  const dates = t.doDates.map((d) => d.date);
  switch (f.doDate) {
    case 'today': {
      // 「今日」画面と同じ: 今日がやる日、またはやる日が全部過ぎた（持ち越し）
      const carried = dates.length > 0 && maxDate(dates)! < today;
      if (!dates.includes(today) && !carried) return false;
      break;
    }
    case 'week':
      if (!dates.some((d) => d <= addDays(today, 7))) return false;
      break;
    case 'none':
      if (dates.length) return false;
      break;
  }
  return true;
}

export function applyFilter(tasks: Task[], f: TaskFilter, today: string): Task[] {
  return isFilterActive(f) ? tasks.filter((t) => matchesFilter(t, f, today)) : tasks;
}

/** 効いている項目の数 */
export function countActive(f: TaskFilter): number {
  return (
    Number(f.categories.length > 0) +
    Number(f.due !== 'any') +
    Number(f.doDate !== 'any') +
    Number(f.priorities.length > 0) +
    Number(f.statuses.length > 0)
  );
}

export const isFilterActive = (f: TaskFilter) => countActive(f) > 0;

/** 効いている条件を、外せるチップとして並べる */
export function activeChips(
  f: TaskFilter,
  categories: Map<number, Category>,
): { key: string; label: string; remove: (f: TaskFilter) => TaskFilter }[] {
  const chips: { key: string; label: string; remove: (f: TaskFilter) => TaskFilter }[] = [];
  for (const id of f.categories) {
    chips.push({
      key: `c${id}`,
      label: id === 0 ? 'カテゴリなし' : (categories.get(id)?.name ?? `#${id}`),
      remove: (x) => ({ ...x, categories: x.categories.filter((c) => c !== id) }),
    });
  }
  if (f.due !== 'any') {
    chips.push({
      key: 'due',
      label: `締切: ${DUE_OPTIONS.find(([v]) => v === f.due)![1]}`,
      remove: (x) => ({ ...x, due: 'any' }),
    });
  }
  if (f.doDate !== 'any') {
    chips.push({
      key: 'do',
      label: `やる日: ${DO_OPTIONS.find(([v]) => v === f.doDate)![1]}`,
      remove: (x) => ({ ...x, doDate: 'any' }),
    });
  }
  for (const p of f.priorities) {
    chips.push({
      key: `p${p}`,
      label: `優先度 ${PRIORITY_OPTIONS.find(([v]) => v === p)?.[1] ?? p}`,
      remove: (x) => ({ ...x, priorities: x.priorities.filter((v) => v !== p) }),
    });
  }
  for (const s of f.statuses) {
    chips.push({
      key: `s${s}`,
      label: STATUS_LABEL[s],
      remove: (x) => ({ ...x, statuses: x.statuses.filter((v) => v !== s) }),
    });
  }
  return chips;
}

/** 複数選択のトグル */
export function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}
