import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { setup } from './helpers.ts';

function app() {
  const s = setup('2026-10-13');
  return { ...s, app: createApp(s, { allowedHosts: ['localhost'] }) };
}

const H = { host: 'localhost:5180', 'content-type': 'application/json' };

async function mcp(a: ReturnType<typeof app>['app'], method: string, params: unknown) {
  const res = await a.request('/mcp', {
    method: 'POST',
    headers: { ...H, accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { result: any; error?: unknown };
}

describe('入口の守り', () => {
  it('許可していない Host は 403', async () => {
    const res = await app().app.request('/api/health', { headers: { host: 'evil.example:5180' } });
    expect(res.status).toBe(403);
  });
  it('JSON 以外の書き込みは 415（ブラウザの単純リクエスト対策）', async () => {
    const res = await app().app.request('/api/tasks', {
      method: 'POST',
      headers: { host: 'localhost', 'content-type': 'text/plain' },
      body: JSON.stringify({ title: 'x' }),
    });
    expect(res.status).toBe(415);
  });
});

describe('API', () => {
  it('作成 → 番号の揺れで取得 → 更新 → 今日の画面', async () => {
    const { app: a } = app();
    const created = await a.request('/api/tasks', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ title: 'レポート', doDates: [{ date: '2026-10-13', minutes: 60 }] }),
    });
    expect(created.status).toBe(201);
    expect(((await created.json()) as { code: string }).code).toBe('T-001');

    const got = await a.request('/api/tasks/t1', { headers: H });
    expect(((await got.json()) as { title: string }).title).toBe('レポート');

    const patched = await a.request('/api/tasks/T-001', {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ priority: 1 }),
    });
    expect(((await patched.json()) as { priority: number }).priority).toBe(1);

    const today = (await (await a.request('/api/tasks?view=today', { headers: H })).json()) as {
      todo: { id: number }[];
    };
    expect(today.todo.map((t) => t.id)).toEqual([1]);
  });
  it('入力の誤りは 400、無い番号は 404、循環は 409', async () => {
    const { app: a, tasks } = app();
    const bad = await a.request('/api/tasks', { method: 'POST', headers: H, body: JSON.stringify({ title: '' }) });
    expect(bad.status).toBe(400);
    expect((await a.request('/api/tasks/T-999', { headers: H })).status).toBe(404);
    const x = tasks.create({ title: 'A' });
    const y = tasks.create({ title: 'B', dependsOn: [x.id] });
    const cyc = await a.request(`/api/tasks/${x.id}/dependencies`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ dependsOnId: y.code }),
    });
    expect(cyc.status).toBe(409);
  });
});

describe('MCP', () => {
  it('ツール一覧に削除が無い', async () => {
    const { app: a } = app();
    const r = await mcp(a, 'tools/list', {});
    const names = (r.result.tools as { name: string }[]).map((t) => t.name);
    expect(names).toContain('add_task');
    expect(names.some((n) => n.includes('delete'))).toBe(false);
  });
  it('カテゴリ名で追加でき、1行表記で返る', async () => {
    const { app: a, categories } = app();
    categories.create({ name: '研究' });
    const r = await mcp(a, 'tools/call', {
      name: 'add_task',
      arguments: { title: '中間報告', category: '研究', due_date: '2026-10-20', priority: 1 },
    });
    expect(r.result.content[0].text).toContain('T-001 [研究] 中間報告 締切 2026-10-20 優先:高 未着手');
  });
  it('存在しないカテゴリはエラー文で候補を返す', async () => {
    const { app: a, categories } = app();
    categories.create({ name: '研究' });
    const r = await mcp(a, 'tools/call', { name: 'add_task', arguments: { title: 'x', category: '試験' } });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toContain('いまあるのは: 研究');
  });
  it('today ビュー', async () => {
    const { app: a, tasks } = app();
    tasks.create({ title: '今日の分', doDates: [{ date: '2026-10-13' }] });
    const r = await mcp(a, 'tools/call', { name: 'list_tasks', arguments: { view: 'today' } });
    expect(r.result.content[0].text).toContain('## 今日やる（1）');
  });
  it('archive_category: 未完了が残っていればエラー、cancel_open で中止してアーカイブ', async () => {
    const { app: a, tasks, categories } = app();
    const c = categories.create({ name: 'サークル' });
    tasks.create({ title: '会計の締め', categoryId: c.id });
    const ng = await mcp(a, 'tools/call', { name: 'archive_category', arguments: { category: 'サークル' } });
    expect(ng.result.isError).toBe(true);
    expect(ng.result.content[0].text).toContain('未完了のタスクが 1 件');
    const ok = await mcp(a, 'tools/call', {
      name: 'archive_category',
      arguments: { category: 'サークル', cancel_open: true },
    });
    expect(ok.result.content[0].text).toContain('アーカイブした: サークル（未完了 1 件を中止）');
  });
});

describe('カテゴリのアーカイブ（API）', () => {
  it('PATCH archived=true は未完了があると 409、cancelOpen=true で通る', async () => {
    const { app: a, tasks, categories } = app();
    const c = categories.create({ name: 'サークル' });
    tasks.create({ title: '会計の締め', categoryId: c.id });
    const patch = (body: unknown) =>
      a.request(`/api/categories/${c.id}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
    expect((await patch({ archived: true })).status).toBe(409);
    const res = await patch({ archived: true, cancelOpen: true });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { archived: boolean }).archived).toBe(true);
    const list = await a.request('/api/tasks?view=all&includeDone=true', { headers: H });
    expect(await list.json()).toEqual([]);
  });
});
