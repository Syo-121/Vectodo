import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { goalLine } from '../src/server/format.ts';
import { goalProgress, goalRuleText, periodEnd, periodStart, progressText } from '../src/shared/goals.ts';
import { setup } from './helpers.ts';

describe('目標の期間（design 4-13）', () => {
  it('週は月曜はじまり・月は1日から末日まで', () => {
    // 2026-10-20 は火曜
    expect([periodStart('week', '2026-10-20'), periodEnd('week', '2026-10-20')]).toEqual(['2026-10-19', '2026-10-25']);
    expect([periodStart('week', '2026-10-25'), periodEnd('week', '2026-10-19')]).toEqual(['2026-10-19', '2026-10-25']);
    expect([periodStart('month', '2024-02-10'), periodEnd('month', '2024-02-10')]).toEqual(['2024-02-01', '2024-02-29']);
    expect([periodStart('day', '2026-10-20'), periodEnd('day', '2026-10-20')]).toEqual(['2026-10-20', '2026-10-20']);
  });
});

describe('進み具合（期間ごと）', () => {
  const pool = { kind: 'rate' as const, period: 'week' as const, target: 2, unit: '回', startDate: '2026-09-28', endDate: null };

  it('今の期間の合計・連続達成・終わった期間のうち達成した数・累計', () => {
    const logs = [
      { date: '2026-09-29', amount: 1 },
      { date: '2026-10-02', amount: 1 }, // 9/28 の週 2回 ✓
      { date: '2026-10-06', amount: 1 }, // 10/5 の週 1回
      { date: '2026-10-13', amount: 1 },
      { date: '2026-10-15', amount: 1 }, // 10/12 の週 2回 ✓
      { date: '2026-10-20', amount: 1 }, // 今週 1回
    ];
    const p = goalProgress(pool, logs, '2026-10-20');
    expect(p.current).toEqual({ from: '2026-10-19', to: '2026-10-25', sum: 1, achieved: false });
    expect(p.history.map((h) => h.sum)).toEqual([2, 1, 2, 1]);
    // 今週はまだ途中なので飛ばし、先週から数える
    expect(p.streak).toBe(1);
    expect(p.record).toEqual({ achieved: 2, total: 3 });
    expect([p.sum, p.todaySum]).toEqual([6, 1]);
    expect(progressText(pool, p)).toBe('今週 1/2回');
    // 今週も達成すれば今週も数える
    const done = goalProgress(pool, [...logs, { date: '2026-10-20', amount: 1 }], '2026-10-20');
    expect([done.streak, progressText(pool, done)]).toEqual([2, '今週 2/2回 ✓']);
  });

  it('1日ごと: 量を足し合わせる・最近は28日ぶん', () => {
    const book = { kind: 'rate' as const, period: 'day' as const, target: 10, unit: 'ページ', startDate: '2026-09-01', endDate: null };
    const p = goalProgress(
      book,
      [
        { date: '2026-10-19', amount: 6 },
        { date: '2026-10-19', amount: 5 },
        { date: '2026-10-20', amount: 4 },
      ],
      '2026-10-20',
    );
    expect(p.history).toHaveLength(28);
    expect(p.history.at(-2)).toMatchObject({ from: '2026-10-19', sum: 11, achieved: true });
    expect([p.streak, progressText(book, p)]).toEqual([1, '今日 4/10ページ']);
    expect(goalRuleText(book)).toBe('1日に10ページ');
  });

  it('始まっていない・終わった目標', () => {
    const later = { ...pool, startDate: '2026-11-02' };
    expect(goalProgress(later, [], '2026-10-20')).toMatchObject({ notStarted: true, current: null, history: [] });
    const over = { ...pool, endDate: '2026-10-11' };
    const p = goalProgress(over, [{ date: '2026-10-01', amount: 2 }], '2026-10-20');
    expect([p.ended, p.current, p.record]).toEqual([true, null, { achieved: 1, total: 2 }]);
    expect(progressText(over, p)).toBe('終わった（達成 1/2週）');
  });
});

describe('進み具合（期限までの総量）', () => {
  const book = { kind: 'total' as const, period: null, target: 300, unit: 'ページ', startDate: '2026-10-01', endDate: '2026-10-30' };

  it('日割りの予定と比べたペース・残りを1日あたりに', () => {
    // 10/1〜10/30 の30日で 300 → 10/20 までに 200 済んでいたい
    const p = goalProgress(book, [{ date: '2026-10-05', amount: 150 }, { date: '2026-09-30', amount: 99 }], '2026-10-20');
    expect([p.sum, p.expected, p.daysLeft, p.perDay]).toEqual([150, 200, 11, 13.64]);
    expect(progressText(book, p)).toBe('150/300ページ（予定より 50 遅れ）');
    expect(goalRuleText(book)).toBe('10/30 までに 300ページ');
    const done = goalProgress(book, [{ date: '2026-10-05', amount: 300 }], '2026-10-20');
    expect([progressText(book, done), done.perDay]).toEqual(['300/300ページ ✓', null]);
    expect(progressText(book, goalProgress(book, [], '2026-11-01'))).toBe('0/300ページ（期限を過ぎた）');
  });
});

describe('目標のサービスと API・MCP', () => {
  it('作る: 期間ごとは今の期間の頭から数える・形の決まりを守る', () => {
    const { goals } = setup('2026-10-20');
    const g = goals.create({ title: 'プール', kind: 'rate', period: 'week', target: 2 });
    expect([g.code, g.startDate, g.unit, g.endDate]).toEqual(['G-001', '2026-10-19', '回', null]);
    const t = goals.create({ title: '本', kind: 'total', target: 300, unit: 'ページ', endDate: '2026-12-31' });
    expect([t.startDate, t.period]).toEqual(['2026-10-20', null]);
    expect(() => goals.create({ title: 'x', kind: 'rate', target: 1 })).toThrow('期間');
    expect(() => goals.create({ title: 'x', kind: 'total', target: 1 })).toThrow('期限');
    expect(() => goals.create({ title: 'x', kind: 'total', target: 1, endDate: '2026-10-01' })).toThrow('より前');
    expect(() => goals.update(g.id, { kind: 'total' })).toThrow('期限');
  });

  it('記録: 既定は今日・1。先の日付と数え始める日より前は断る。消すと戻る', () => {
    const { goals, clock } = setup('2026-10-20');
    const g = goals.create({ title: 'プール', kind: 'rate', period: 'week', target: 2, startDate: '2026-10-21' });
    clock.current = '2026-10-22';
    // 週の途中から始めても、その週の頭（10/19）からは入れられる
    let d = goals.addLog(g.id, { date: '2026-10-19', note: '90分' });
    d = goals.addLog(g.id, {});
    expect(d.logs.map((l) => [l.date, l.amount, l.note])).toEqual([
      ['2026-10-22', 1, ''],
      ['2026-10-19', 1, '90分'],
    ]);
    expect(d.progress.current?.achieved).toBe(true);
    expect(() => goals.addLog(g.id, { date: '2026-10-23' })).toThrow('先の日付');
    expect(() => goals.addLog(g.id, { date: '2026-10-18' })).toThrow('より前');
    expect(goals.deleteLog(d.logs[0]!.id).progress.current?.sum).toBe(1);
  });

  it('名前でも探せる（MCP 用）・アーカイブは別に並ぶ', () => {
    const { goals } = setup('2026-10-20');
    const a = goals.create({ title: 'プール', kind: 'rate', period: 'week', target: 2 });
    const b = goals.create({ title: '回路の本を読む', kind: 'rate', period: 'day', target: 10, unit: 'ページ' });
    expect([goals.resolve('G-1'), goals.resolve('プール'), goals.resolve('回路')]).toEqual([a.id, a.id, b.id]);
    expect(() => goals.resolve('ジム')).toThrow('見つからない');
    goals.update(a.id, { archived: true });
    expect(goals.list().map((g) => g.id)).toEqual([b.id]);
    expect(goals.list({ archived: true }).map((g) => g.id)).toEqual([a.id]);
  });

  it('MCP の1行', () => {
    const { goals } = setup('2026-10-20');
    const g = goals.create({ title: 'プール', kind: 'rate', period: 'week', target: 2, startDate: '2026-10-12' });
    goals.addLog(g.id, { date: '2026-10-13' });
    goals.addLog(g.id, { date: '2026-10-15' });
    expect(goalLine(goals.addLog(g.id, {}))).toBe(
      'G-001 プール（週に2回・2026-10-12 から） 今週 1/2回 連続1週 達成 1/1週 累計 3回 今日 1回',
    );
  });

  it('API と MCP: 記録を足せるが、消す・書き換える道具は MCP に無い', async () => {
    const s = setup('2026-10-20');
    const app = createApp(s, { allowedHosts: ['localhost'] });
    const H = { host: 'localhost', 'content-type': 'application/json' };
    const res = await app.request('/api/goals', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ title: 'プール', kind: 'rate', period: 'week', target: 2 }),
    });
    expect(res.status).toBe(201);
    const logged = await app.request('/api/goals/G-001/logs', { method: 'POST', headers: H, body: JSON.stringify({ amount: 1 }) });
    const detail = (await logged.json()) as { logs: { id: number }[]; progress: { current: { sum: number } } };
    expect(detail.progress.current.sum).toBe(1);
    const del = await app.request(`/api/goals/1/logs/${detail.logs[0]!.id}`, { method: 'DELETE', headers: { host: 'localhost' } });
    expect(((await del.json()) as { logs: unknown[] }).logs).toEqual([]);

    const mcp = (body: unknown) =>
      app.request('/mcp', {
        method: 'POST',
        headers: { ...H, accept: 'application/json, text/event-stream' },
        body: JSON.stringify(body),
      });
    const list = (await (await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })).json()) as {
      result: { tools: { name: string }[] };
    };
    const names = list.result.tools.map((t) => t.name).filter((n) => n.includes('goal'));
    expect(names.sort()).toEqual(['add_goal', 'get_goal', 'list_goals', 'log_goal']);
    const call = (await (
      await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'log_goal', arguments: { goal: 'プール', note: '90分' } } })
    ).json()) as { result: { content: { text: string }[] } };
    expect(call.result.content[0]!.text).toContain('今週 1/2回');
  });
});
