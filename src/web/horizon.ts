// カテゴリごとの「先の分を隠す」（design 4-9・2026-10-14 本人要望）。画面側だけで振り分ける純粋関数。
// 例: バイトを 14 日にすると、予習は2週間先までだけが一覧・カンバン・重要×緊急・計画待ちに出る。

import type { Category, Task } from '../shared/types.ts';
import { addDays } from './util.ts';

/** 隠すかどうかを決める日付: 締切、無ければ最初のやる日 */
export function horizonDate(t: Task): string | null {
  return t.dueDate ?? t.doDates[0]?.date ?? null;
}

/** カテゴリの日数より先にある、未着手・待ちのタスク（進行中は手を付けているので隠さない） */
export function isFar(t: Task, categories: Map<number, Category>, today: string): boolean {
  if ((t.status !== 'todo' && t.status !== 'waiting') || t.categoryId === null) return false;
  const days = categories.get(t.categoryId)?.hideAfterDays;
  if (days === null || days === undefined) return false;
  const d = horizonDate(t);
  return d !== null && d > addDays(today, days);
}

export interface FarGroup {
  category: Category;
  count: number;
  /** 隠したものの中でいちばん先の日付 */
  last: string;
}

/** 近いもの（出す）と、隠したもののカテゴリごとの件数に分ける */
export function splitFar(
  tasks: Task[],
  categories: Map<number, Category>,
  today: string,
): { near: Task[]; far: FarGroup[] } {
  const near: Task[] = [];
  const groups = new Map<number, FarGroup>();
  for (const t of tasks) {
    if (!isFar(t, categories, today)) {
      near.push(t);
      continue;
    }
    const d = horizonDate(t)!;
    const g = groups.get(t.categoryId!);
    if (g) {
      g.count++;
      if (d > g.last) g.last = d;
    } else {
      groups.set(t.categoryId!, { category: categories.get(t.categoryId!)!, count: 1, last: d });
    }
  }
  const far = [...groups.values()].sort((a, b) => a.category.position - b.category.position);
  return { near, far };
}

/** ボードの「計画待ち」に出さないカテゴリのタスク */
export function hiddenFromPlan(t: Task, categories: Map<number, Category>): boolean {
  return t.categoryId !== null && Boolean(categories.get(t.categoryId)?.hideFromPlan);
}
