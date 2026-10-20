import { describe, expect, it } from 'vitest';
import type { GoalPlan } from '../src/shared/types.ts';
import { planLabel, planOf, planPatch, planTask } from '../src/web/goalPlans.ts';
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
  done: false,
  logId: null,
};

describe('やる時間を時間割に載せる（design 4-14）', () => {
  it('やる日1日だけのタスクの形に写す（番号は負・済んだら完了）', () => {
    const t = planTask(plan);
    expect([t.id, t.title, t.status, t.doDates]).toEqual([-7, '🎯 回路の本', 'todo', [{ date: '2026-10-21', minutes: 30, start: '21:00' }]]);
    expect(planOf(t)).toBe(plan);
    expect(planTask({ ...plan, done: true }).status).toBe('done');
    expect(planLabel(plan)).toBe('🎯 回路の本');
  });

  it('時間割で動かした結果を予定の書き換えに戻す（別の日・別の時刻へ・終日へ）', () => {
    const t = planTask(plan);
    expect(planPatch(placeOn(t.doDates, '2026-10-21', '2026-10-23', '07:30', 30))).toEqual({ date: '2026-10-23', start: '07:30', minutes: 30 });
    expect(planPatch(unplaceTo(t.doDates, '2026-10-21', '2026-10-22'))).toMatchObject({ date: '2026-10-22', start: null });
  });
});
