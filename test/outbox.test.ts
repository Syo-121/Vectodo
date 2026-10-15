import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '../src/shared/types.ts';
import { ApiError } from '../src/web/api.ts';
import { enqueue, flushOutbox, sendOrQueue, withPendingChecks, type OutboxEntry } from '../src/web/outbox.ts';

const note = (id: number, items: [string, boolean][]): Note => ({
  id,
  code: `N-${id}`,
  title: '',
  body: '',
  kind: 'list',
  items: items.map(([text, done]) => ({ text, done })),
  color: null,
  labels: [],
  pinned: false,
  archived: false,
  createdAt: '',
  updatedAt: '',
});
const check = (noteId: number, index: number, text: string, done = true): OutboxEntry => ({ id: `${noteId}-${index}`, kind: 'noteCheck', noteId, index, text, done });
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('書き溜めて後で送る（design 7-9）', () => {
  it('溜めているチェックを表示に重ねる（場所がずれていたら同じ文の項目へ・無ければ何もしない）', () => {
    const notes = [note(1, [['パスポート', false], ['財布', false]]), note(2, [['卵', false]])];
    const shown = withPendingChecks(notes, [check(1, 0, 'パスポート'), check(1, 0, '財布'), check(1, 5, '消えた項目')]);
    expect(shown[0]!.items.map((x) => x.done)).toEqual([true, true]);
    // 関係ないノートはそのまま（同じもの）
    expect(shown[1]).toBe(notes[1]);
  });

  it('つながらなければ溜めて null、サーバの失敗はそのまま投げる', async () => {
    const queued = await sendOrQueue({ kind: 'memo', body: 'メモ' }, () => Promise.reject(new ApiError('つながっていない', 0)));
    expect(queued).toBeNull();
    await expect(sendOrQueue({ kind: 'memo', body: 'x' }, () => Promise.reject(new ApiError('入力が違う', 400)))).rejects.toThrow('入力が違う');

    // 送る: まだつながらない → そこで止まって残る
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    expect(await flushOutbox(() => {})).toBe(0);

    // つながった → 送れて空になる
    const sent: unknown[] = [];
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      sent.push([url, init.method, JSON.parse(String(init.body))]);
      return Promise.resolve(json({ id: 1, code: 'M-001' }));
    });
    expect(await flushOutbox(() => {})).toBe(1);
    expect(sent).toEqual([['/api/memos', 'POST', { body: 'メモ' }]]);
    expect(await flushOutbox(() => {})).toBe(0);
  });

  it('チェックは送るときに今のノートを取り直して当てる（その間に足された項目を消さない）', async () => {
    enqueue({ kind: 'noteCheck', noteId: 7, index: 1, text: '充電器', done: true });
    enqueue({ kind: 'noteCheck', noteId: 7, index: 0, text: 'もう無い項目', done: true });
    // 溜めている間に、先頭へ項目が足された
    const now = note(7, [['Claude が足した', false], ['パスポート', false], ['充電器', false]]);
    const patches: unknown[] = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') return Promise.resolve(json(url.includes('archived') ? [] : [now]));
      patches.push(JSON.parse(String(init.body)));
      return Promise.resolve(json(now));
    });
    const failed: string[] = [];
    expect(await flushOutbox((label) => failed.push(label))).toBe(1);
    expect(patches).toEqual([
      { items: [{ text: 'Claude が足した', done: false }, { text: 'パスポート', done: false }, { text: '充電器', done: true }] },
    ]);
    // 見つからない項目は送れないと決めて外す（お知らせする）
    expect(failed).toEqual(['🗒 チェック「もう無い項目」']);
    expect(await flushOutbox(() => {})).toBe(0);
  });
});
