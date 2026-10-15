import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import { setup } from './helpers.ts';

describe('ノート（design 3-6e）', () => {
  it('作る: items があればチェックリスト・空は作らない・ラベルは重ねない', () => {
    const { notes } = setup();
    const list = notes.create({ title: '買い物', items: [{ text: '牛乳', done: false }], labels: ['買い物', ' 買い物 ', '日用品'] });
    expect([list.code, list.kind, list.labels]).toEqual(['N-001', 'list', ['買い物', '日用品']]);
    expect(notes.create({ body: 'ふと思った' }).kind).toBe('text');
    expect(() => notes.create({ title: ' ', body: '', items: [{ text: '', done: false }] })).toThrow('空のノート');
  });

  it('並び: 固定が先・あとは新しい順。アーカイブは別。探す・ラベルで絞る', () => {
    const { notes } = setup();
    const a = notes.create({ title: 'Wi-Fi', body: 'ルーターは棚の上', labels: ['家'] });
    const b = notes.create({ title: '買い物', items: [{ text: '卵', done: false }], labels: ['買い物'] });
    const c = notes.create({ title: 'アイデア', body: '時間割アプリ' });
    notes.update(a.id, { pinned: true });
    notes.update(c.id, { archived: true });
    expect(notes.list().map((n) => n.title)).toEqual(['Wi-Fi', '買い物']);
    expect(notes.list({ archived: true }).map((n) => n.title)).toEqual(['アイデア']);
    expect(notes.list({ q: '卵' }).map((n) => n.id)).toEqual([b.id]);
    expect(notes.list({ q: '棚' }).map((n) => n.id)).toEqual([a.id]);
    expect(notes.list({ label: '買い物' }).map((n) => n.id)).toEqual([b.id]);
    expect(notes.labels()).toEqual([
      { label: '家', count: 1 },
      { label: '買い物', count: 1 },
    ]);
  });

  it('書き足す: チェックリストは未チェックの項目として・文章は末尾の行として（既にある中身は変えない）', () => {
    const { notes } = setup();
    const list = notes.create({ title: '買い物', items: [{ text: '牛乳', done: true }] });
    expect(notes.append(list.id, { text: '卵\nパン', items: ['バター'] }).items).toEqual([
      { text: '牛乳', done: true },
      { text: '卵', done: false },
      { text: 'パン', done: false },
      { text: 'バター', done: false },
    ]);
    const text = notes.create({ body: '1行目\n' });
    expect(notes.append(text.id, { text: '2行目' }).body).toBe('1行目\n2行目');
    expect(() => notes.append(text.id, { text: '  ' })).toThrow('足すものが無い');
  });

  it('API と MCP: 読む・作る・書き足すだけで、消す・書き換える道具は無い', async () => {
    const s = setup();
    const app = createApp(s, { allowedHosts: ['localhost'] });
    const H = { host: 'localhost', 'content-type': 'application/json' };
    const created = await app.request('/api/notes', { method: 'POST', headers: H, body: JSON.stringify({ title: '買い物', items: [{ text: '牛乳', done: false }] }) });
    expect(created.status).toBe(201);
    const patched = await app.request('/api/notes/N-001', { method: 'PATCH', headers: H, body: JSON.stringify({ color: 'yellow', pinned: true }) });
    expect(((await patched.json()) as { color: string }).color).toBe('yellow');

    const call = async (method: string, params: unknown) =>
      (await (
        await app.request('/mcp', {
          method: 'POST',
          headers: { ...H, accept: 'application/json, text/event-stream' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        })
      ).json()) as { result: any };
    const tools = (await call('tools/list', {})).result.tools.map((t: { name: string }) => t.name) as string[];
    expect(tools).toEqual(expect.arrayContaining(['list_notes', 'add_note', 'append_to_note']));
    expect(tools.filter((n) => n.includes('note') && /delete|update|remove/.test(n))).toEqual([]);

    const appended = await call('tools/call', { name: 'append_to_note', arguments: { id: 'N-001', items: ['卵'] } });
    expect(appended.result.content[0].text).toContain('☐ 卵');
    const listed = await call('tools/call', { name: 'list_notes', arguments: { query: '牛乳' } });
    expect(listed.result.content[0].text).toContain('N-001 📌 買い物');
    const added = await call('tools/call', { name: 'add_note', arguments: { title: '持ち物', items: ['パスポート'], labels: ['旅行'] } });
    expect(added.result.content[0].text).toContain('N-002 [旅行] 持ち物');
  });
});
