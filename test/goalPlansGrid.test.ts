import { describe, expect, it } from 'vitest';
import { goalProgress } from '../src/shared/goals.ts';
import type { Goal, GoalPlan } from '../src/shared/types.ts';
import { planAmount, planLabel, planOf, planPatch, planTask } from '../src/web/goalPlans.ts';
import { placeOn, unplaceTo } from '../src/web/grid.ts';

const plan: GoalPlan = {
  id: 7,
  goalId: 2,
  goalCode: 'G-002',
  title: '回路の本',
  unit: 'ページ',
  rule: '1日に10ページ',
  date: '2026-10-21',
  start: '21:00',
  minutes: 30,
  amount: 10,
  done: false,
  logId: null,
};

describe('やる時間を時間割に載せる（design 4-14）', () => {
  it('やる日1日だけのタスクの形に写す（番号は負・済んだら完了）', () => {
    const t = planTask(plan);
    expect([t.id, t.title, t.status, t.doDates]).toEqual([-7, '🎯 回路の本 10ページ', 'todo', [{ date: '2026-10-21', minutes: 30, start: '21:00' }]]);
    expect(planOf(t)).toBe(plan);
    expect(planTask({ ...plan, done: true }).status).toBe('done');
    expect(planLabel({ ...plan, amount: null })).toBe('🎯 回路の本');
  });

  it('時間割で動かした結果を予定の書き換えに戻す（別の日・別の時刻へ・終日へ）', () => {
    const t = planTask(plan);
    expect(planPatch(placeOn(t.doDates, '2026-10-21', '2026-10-23', '07:30', 30))).toEqual({ date: '2026-10-23', start: '07:30', minutes: 30 });
    expect(planPatch(unplaceTo(t.doDates, '2026-10-21', '2026-10-22'))).toMatchObject({ date: '2026-10-22', start: null });
  });

  it('置くときの量の既定', () => {
    const goal = (r: Partial<Goal>): Goal => {
      const rule = { kind: 'rate' as const, period: 'day' as const, target: 10, unit: 'ページ', startDate: '2026-10-01', endDate: null, ...r };
      return { id: 1, code: 'G-001', title: 'x', notes: '', position: 1, archived: false, createdAt: '', updatedAt: '', ...rule, progress: goalProgress(rule, [], '2026-10-20') };
    };
    expect(planAmount(goal({ unit: '回', period: 'week', target: 2 }))).toBe(1);
    expect(planAmount(goal({}))).toBe(10);
    // 残り11日で 300 → 1日 27.3 を切り上げて 28（1日の目安）
    expect(planAmount(goal({ kind: 'total', period: null, target: 300, endDate: '2026-10-30' }))).toBe(28);
    expect(planAmount(goal({ period: 'week', unit: '分', target: 120 }))).toBeNull();
  });
});
