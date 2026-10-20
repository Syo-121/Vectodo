// 目標をやる時間を時間割に載せる（design 4-14・7-15）。時間割（components/TimeGrid.tsx）はタスクのやる日で動くので、
// 予定1件を「やる日が1日だけのタスク」の形に写して渡し、動かした結果（やる日の書き換え）を予定の書き換えに戻す。
// 写したものの番号は負（−予定の番号）にして、タスクとぶつからないようにする。純粋関数だけを置く。

import { fmtAmount } from '../shared/goals.ts';
import type { GoalPlanPatchInput } from '../shared/schemas.ts';
import type { Goal, GoalPlan, Task } from '../shared/types.ts';

/** 時間割に渡す形（予定を写したものには goalPlan が付く） */
export type GridTask = Task & { goalPlan?: GoalPlan };

/** 予定の見出し: 🎯 回路の本 10ページ */
export function planLabel(p: GoalPlan): string {
  return `🎯 ${p.title}${p.amount !== null ? ` ${fmtAmount(p.amount, p.unit)}` : ''}`;
}

/** 予定1件を、やる日が1日だけのタスクの形に写す（済んだ予定は完了として薄く・動かせない） */
export function planTask(p: GoalPlan): GridTask {
  return {
    id: -p.id,
    code: p.goalCode,
    parentId: null,
    parentTitle: null,
    position: 0,
    title: planLabel(p),
    status: p.done ? 'done' : 'todo',
    categoryId: null,
    priority: null,
    dueDate: null,
    dueTime: null,
    estimateMin: p.minutes,
    actualMin: null,
    notes: '',
    recurrence: null,
    legacyId: null,
    createdAt: '',
    updatedAt: '',
    completedAt: null,
    doDates: [{ date: p.date, minutes: p.minutes, start: p.start }],
    dependsOn: [],
    blocked: false,
    children: { total: 0, done: 0 },
    goalPlan: p,
  };
}

/** 時間割のタスクが予定を写したものなら、その予定 */
export function planOf(t: Task | undefined): GoalPlan | undefined {
  return (t as GridTask | undefined)?.goalPlan;
}

/** 時間割で動かした結果（やる日1日分）を、予定の書き換えにする */
export function planPatch(dates: Task['doDates']): GoalPlanPatchInput {
  const d = dates[0];
  if (!d) return {};
  return { date: d.date, start: d.start ?? null, minutes: d.minutes };
}

/** 置くときの量の既定: 「回」は 1、1日ごとは1日の目標の量、期限までは1日の目安、それ以外は決めない */
export function planAmount(g: Goal): number | null {
  if (g.unit === '回') return 1;
  if (g.kind === 'rate' && g.period === 'day') return g.target;
  if (g.kind === 'total') return g.progress.perDay;
  return null;
}
