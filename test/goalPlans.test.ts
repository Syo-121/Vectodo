import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { goalDetailText } from '../src/server/format.ts';
import { setup } from './helpers.ts';

// 2026-10-20 は火曜
const T = '2026-10-20';

describe('目標をやる時間（design 3-6f・4-14）', () => {
  it('置く・動かす・外す。数え始める前とアーカイブした目標には置けない', () => {
    const { goals } = setup(T);
    const g = goals.create({ title: '回路の本', kind: 'rate', period: 'day', target: 10, unit: 'ページ' });
    const p = goals.addPlan(g.id, { date: '2026-10-21', start: '21:00', minutes: 30, amount: 10 });
    expect(p).toMatchObject({ goalCode: 'G-001', title: '回路の本', unit: 'ページ', rule: '1日に10ページ', start: '21:00', done: false });
    expect(goals.updatePlan(p.id, { date: '2026-10-22', start: null })).toMatchObject({ date: '2026-10-22', start: null, minutes: 30 });
    expect(() => goals.addPlan(g.id, { date: '2026-10-19' })).toThrow('数え始める日');
    expect(() => goals.updatePlan(p.id, { date: '2026-10-19' })).toThrow('数え始める日');
    goals.deletePlan(p.id);
    expect(goals.plans()).toEqual([]);
    goals.update(g.id, { archived: true });
    expect(() => goals.addPlan(g.id, { date: T })).toThrow('アーカイブ');
  });

  it('並び: 日付→時刻（時刻なしは後）。期間で絞る・アーカイブした目標のものは出さない', () => {
    const { goals } = setup(T);
    const a = goals.create({ title: '本', kind: 'rate', period: 'day', target: 10, unit: 'ページ' });
    const b = goals.create({ title: 'プール', kind: 'rate', period: 'week', target: 2 });
    goals.addPlan(a.id, { date: '2026-10-21' });
    goals.addPlan(b.id, { date: '2026-10-21', start: '09:00' });
    goals.addPlan(a.id, { date: T, start: '21:00' });
    goals.addPlan(a.id, { date: '2026-11-30', start: '07:00' });
    expect(goals.plans({ from: T, to: '2026-10-31' }).map((p) => `${p.date} ${p.start ?? '-'} ${p.title}`)).toEqual([
      '2026-10-20 21:00 本',
      '2026-10-21 09:00 プール',
      '2026-10-21 - 本',
    ]);
    goals.update(b.id, { archived: true });
    expect(goals.plans().map((p) => p.title)).toEqual(['本', '本', '本']);
    expect(goals.get(a.id).plans).toHaveLength(3);
  });

  it('記録と結ぶ: 予定から記録したらその予定・そうでなければその日の最初のまだの予定。記録を消すと元に戻る', () => {
    const { goals } = setup(T);
    const g = goals.create({ title: '本', kind: 'rate', period: 'day', target: 10, unit: 'ページ', startDate: '2026-10-01' });
    const morning = goals.addPlan(g.id, { date: T, start: '07:00', amount: 5 });
    const night = goals.addPlan(g.id, { date: T, start: '21:00', amount: 5 });
    // 予定を指して記録
    let d = goals.addLog(g.id, { amount: 5, planId: night.id });
    expect(d.plans.map((p) => p.done)).toEqual([false, true]);
    // 指さなければ、その日のまだの予定のうち最初のもの
    d = goals.addLog(g.id, { amount: 5 });
    expect(d.plans.map((p) => p.done)).toEqual([true, true]);
    // もう済んだ予定は結ばない（記録だけ残る）
    d = goals.addLog(g.id, { amount: 3 });
    expect(d.logs).toHaveLength(3);
    // 別の日の記録は結ばない
    d = goals.addLog(g.id, { date: '2026-10-19', amount: 3 });
    // 記録を消すと予定はまだに戻る
    d = goals.deleteLog(goals.plan(morning.id).logId!);
    expect(d.plans.map((p) => p.done)).toEqual([false, true]);
    // 予定を外しても記録は残る
    goals.deletePlan(night.id);
    expect(goals.get(g.id).logs).toHaveLength(3);
  });

  it('MCP の詳細にまだの予定を出す', () => {
    const { goals } = setup(T);
    const g = goals.create({ title: '本', kind: 'rate', period: 'day', target: 10, unit: 'ページ' });
    goals.addPlan(g.id, { date: '2026-10-21', start: '21:00', minutes: 30, amount: 10 });
    goals.addPlan(g.id, { date: '2026-10-22' });
    expect(goalDetailText(goals.get(g.id)).split('\n').slice(-3)).toEqual([
      'やる時間（まだのもの 2件）:',
      '- #1 2026-10-21 21:00〜(30m) 10ページ',
      '- #2 2026-10-22（時刻なし）',
    ]);
  });

  it('API と MCP: 置く・読む・動かす・外す（MCP は置くだけ）', async () => {
    const s = setup(T);
    const app = createApp(s, { allowedHosts: ['localhost'] });
    const H = { host: 'localhost', 'content-type': 'application/json' };
    s.goals.create({ title: '本', kind: 'rate', period: 'day', target: 10, unit: 'ページ' });
    const created = await app.request('/api/goals/G-001/plans', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ date: T, start: '21:00', minutes: 30, amount: 10 }),
    });
    expect(created.status).toBe(201);
    const plan = (await created.json()) as { id: number };
    const list = await app.request(`/api/goal-plans?from=${T}&to=2026-10-26`, { headers: { host: 'localhost' } });
    expect(((await list.json()) as unknown[]).length).toBe(1);
    const moved = await app.request(`/api/goal-plans/${plan.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ start: '22:00' }) });
    expect(((await moved.json()) as { start: string }).start).toBe('22:00');
    expect((await app.request('/api/goal-plans?from=2026-10-01&to=2026-12-31', { headers: { host: 'localhost' } })).status).toBe(400);
    await app.request(`/api/goal-plans/${plan.id}`, { method: 'DELETE', headers: { host: 'localhost' } });
    expect(s.goals.plans()).toEqual([]);

    const mcp = (body: unknown) =>
      app.request('/mcp', { method: 'POST', headers: { ...H, accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) });
    const tools = (await (await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })).json()) as {
      result: { tools: { name: string }[] };
    };
    expect(tools.result.tools.map((t) => t.name).filter((n) => n.includes('plan'))).toEqual(['plan_goal']);
    const call = (await (
      await mcp({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'plan_goal', arguments: { goal: '本', date: '2026-10-21', start: '21:00', amount: 10 } },
      })
    ).json()) as { result: { content: { text: string }[] } };
    expect(call.result.content[0]!.text).toContain('2026-10-21 21:00〜(30m) 10ページ');
  });
});
