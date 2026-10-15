import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { splitMemo } from '../src/server/memos.ts';
import { formatMemoCode, parseMemoRef } from '../src/shared/ids.ts';
import { setup } from './helpers.ts';

describe('メモの番号', () => {
  it('M-001 から・表記の揺れを吸収', () => {
    expect(formatMemoCode(12)).toBe('M-012');
    for (const s of ['M-12', 'm012', '12']) expect(parseMemoRef(s)).toBe(12);
    expect(parseMemoRef('T-12')).toBeNull();
  });
});

describe('メモ', () => {
  it('作成・未処理は新しい順・済で振り分け先と処理日時が残る・戻すと消える', () => {
    const { memos, clock } = setup('2026-10-13');
    const a = memos.create('  牛乳が安かった  ');
    clock.current = '2026-10-14';
    const b = memos.create('研究のアイデア\nアンテナを2枚にする');
    expect(a.code).toBe('M-001');
    expect(a.body).toBe('牛乳が安かった');
    expect(memos.list().map((m) => m.id)).toEqual([b.id, a.id]);

    const done = memos.update(a.id, { status: 'done', destination: '/log 支出' });
    expect([done.status, done.destination, done.processedAt?.slice(0, 10)]).toEqual(['done', '/log 支出', '2026-10-14']);
    expect(memos.list().map((m) => m.id)).toEqual([b.id]);
    expect(memos.list({ status: 'done' }).map((m) => m.id)).toEqual([a.id]);
    expect(memos.openCount()).toBe(1);

    expect(memos.update(a.id, { status: 'open' }).processedAt).toBeNull();
  });
  it('検索は本文と振り分け先', () => {
    const { memos } = setup();
    const a = memos.create('アンテナの件');
    memos.create('買い物');
    const c = memos.create('別件');
    memos.update(c.id, { status: 'done', destination: 'アンテナ メモ' });
    expect(memos.list({ status: 'all', q: 'アンテナ' }).map((m) => m.id).sort()).toEqual([a.id, c.id].sort());
  });
  it('タスクにする: 1行目がタイトル・残りがメモ欄・メモは済でタスク番号が残る', () => {
    const { memos, tasks } = setup();
    const m = memos.create('ゼミの発表練習\n先輩に見てもらう\n15分で');
    const { memo, task } = memos.toTask(m.id, { priority: 1 });
    expect([task.title, task.notes, task.priority]).toEqual(['ゼミの発表練習', '先輩に見てもらう\n15分で', 1]);
    expect([memo.status, memo.destination, memo.taskId]).toEqual(['done', `タスク ${task.code}`, task.id]);
    // タスクを消してもメモは残る（紐づけだけ外れる）
    tasks.delete(task.id);
    expect(memos.get(m.id).taskId).toBeNull();
  });
  it('1行目が長すぎるときは短くして、全文をメモ欄に', () => {
    const long = 'あ'.repeat(600);
    const r = splitMemo(long);
    expect(r.title.length).toBeLessThanOrEqual(81);
    expect(r.notes).toBe(long);
  });
});

describe('メモの API と MCP', () => {
  const H = { host: 'localhost', 'content-type': 'application/json' };
  it('API で作成・一覧・タスク化', async () => {
    const s = setup();
    const app = createApp(s, { allowedHosts: ['localhost'] });
    const created = await app.request('/api/memos', { method: 'POST', headers: H, body: JSON.stringify({ body: '思いつき' }) });
    expect(created.status).toBe(201);
    const list = (await (await app.request('/api/memos', { headers: H })).json()) as { code: string }[];
    expect(list.map((m) => m.code)).toEqual(['M-001']);
    const conv = await app.request('/api/memos/M-001/to-task', { method: 'POST', headers: H, body: '{}' });
    expect(((await conv.json()) as { task: { title: string } }).task.title).toBe('思いつき');
    expect(await (await app.request('/api/memos', { headers: H })).json()).toEqual([]);
  });
  it('MCP: 振り分け先なしでは済にできない・削除の道具は無い', async () => {
    const s = setup();
    s.memos.create('明日の昼はカレー');
    const app = createApp(s, { allowedHosts: ['localhost'] });
    const call = async (method: string, params: unknown) =>
      (await (
        await app.request('/mcp', {
          method: 'POST',
          headers: { ...H, accept: 'application/json, text/event-stream' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        })
      ).json()) as { result: any };
    const tools = (await call('tools/list', {})).result.tools.map((t: { name: string }) => t.name);
    expect(tools).toEqual(expect.arrayContaining(['list_memos', 'add_memo', 'complete_memo', 'memo_to_task']));
    expect(tools.some((n: string) => n.includes('delete'))).toBe(false);

    const listed = await call('tools/call', { name: 'list_memos', arguments: {} });
    expect(listed.result.content[0].text).toContain('M-001');
    expect(listed.result.content[0].text).toContain('明日の昼はカレー');

    const noDest = await call('tools/call', { name: 'complete_memo', arguments: { id: 'M-001' } });
    expect(noDest.result?.isError ?? true).toBe(true);
    const ok = await call('tools/call', { name: 'complete_memo', arguments: { id: 'M-001', destination: '/meal 献立' } });
    expect(ok.result.content[0].text).toContain('→ /meal 献立');
  });
});
