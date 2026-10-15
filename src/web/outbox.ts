// 書き溜めて後で送る（design 7-9・要件 2-8 の第2段）。電波がない・PC が止まっているときの
// クイックメモ・タスクの追加・ノートのチェックを端末（localStorage）に溜めて、つながったら順に送る。
// ノートのチェックは「何番目の・どの文の項目を・付ける／外す」で溜め、送るときに今のノートを取り直して当てる
// （溜めている間に Claude が項目を書き足していても上書きしない）。

import { useSyncExternalStore } from 'react';
import type { TaskCreateInput } from '../shared/schemas.ts';
import type { Note } from '../shared/types.ts';
import { ApiError, api, isUnreachable } from './api.ts';
import { isOffline } from './offline.ts';

export type OutboxOp =
  | { kind: 'memo'; body: string }
  | { kind: 'task'; input: TaskCreateInput }
  | { kind: 'noteCheck'; noteId: number; index: number; text: string; done: boolean };

export type OutboxEntry = OutboxOp & { id: string };

const KEY = 'task-app.outbox';

function load(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

let entries: OutboxEntry[] = load();
const listeners = new Set<() => void>();

function commit(next: OutboxEntry[]) {
  entries = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // 保存できなくても、開いている間は溜めておける
  }
  for (const l of listeners) l();
}

export function enqueue(op: OutboxOp): void {
  commit([...entries, { ...op, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }]);
}

export function useOutbox(): OutboxEntry[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entries,
  );
}

/**
 * 送ってみて、つながらなければ溜める（つながっていないと分かっているときは送らずに溜める）。溜めたら null。
 * つながらない以外の失敗（入力の誤りなど）はそのまま投げる
 */
export async function sendOrQueue<R>(op: OutboxOp, send: () => Promise<R>): Promise<R | null> {
  if (isOffline()) {
    enqueue(op);
    return null;
  }
  try {
    return await send();
  } catch (e) {
    if (!isUnreachable(e)) throw e;
    enqueue(op);
    return null;
  }
}

/** 溜めたものの見出し（帯の一覧・送れなかったときのお知らせ） */
export function outboxLabel(e: OutboxOp): string {
  const cut = (s: string) => (s.length > 24 ? `${s.slice(0, 24)}…` : s);
  if (e.kind === 'memo') return `✎ メモ「${cut(e.body.replace(/\s+/g, ' '))}」`;
  if (e.kind === 'task') return `☑ タスク「${cut(e.input.title)}」`;
  return `🗒 ${e.done ? 'チェック' : 'チェックを外す'}「${cut(e.text)}」`;
}

/** ノートの項目を探す（同じ場所に同じ文があればそこ、無ければ同じ文の最初のもの） */
function findItem(n: Note, c: { index: number; text: string }): number {
  return n.items[c.index]?.text === c.text ? c.index : n.items.findIndex((x) => x.text === c.text);
}

/** 溜めているノートのチェックを、表示するノートに重ねる（送るまでは端末の中だけで付いて見える） */
export function withPendingChecks(notes: Note[], pending: OutboxEntry[]): Note[] {
  const checks = pending.filter((e): e is OutboxEntry & { kind: 'noteCheck' } => e.kind === 'noteCheck');
  if (checks.length === 0) return notes;
  return notes.map((n) => {
    const mine = checks.filter((c) => c.noteId === n.id);
    if (mine.length === 0) return n;
    const items = n.items.map((x) => ({ ...x }));
    for (const c of mine) {
      const i = findItem({ ...n, items }, c);
      if (i >= 0) items[i]!.done = c.done;
    }
    return { ...n, items };
  });
}

/** 今のノートを、端末に残した中身ではなくサーバから取る（sw.js は x-vectodo-live の付いた読み取りを素通しする） */
async function liveNotes(archived: boolean): Promise<Note[]> {
  const res = await fetch(`/api/notes${archived ? '?archived=1' : ''}`, { headers: { 'x-vectodo-live': '1' } }).catch(() => null);
  if (!res) throw new ApiError('つながっていない', 0);
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
  return (await res.json()) as Note[];
}

async function send(e: OutboxOp): Promise<void> {
  if (e.kind === 'memo') {
    await api.createMemo(e.body);
  } else if (e.kind === 'task') {
    await api.create(e.input);
  } else {
    const n = (await liveNotes(false)).find((x) => x.id === e.noteId) ?? (await liveNotes(true)).find((x) => x.id === e.noteId);
    if (!n) throw new ApiError('ノートが消されていた', 404);
    const i = findItem(n, e);
    if (i < 0) throw new ApiError('項目が見つからなかった', 404);
    if (n.items[i]!.done === e.done) return;
    await api.updateNote(n.id, { items: n.items.map((x, j) => (j === i ? { ...x, done: e.done } : x)) });
  }
}

let flushing = false;

/** 溜めたものを古い順に送る。つながらなければそこで止める。送れた数を返す */
export async function flushOutbox(onFail: (label: string, message: string) => void): Promise<number> {
  if (flushing || entries.length === 0) return 0;
  flushing = true;
  let sent = 0;
  try {
    while (entries.length > 0) {
      const e = entries[0]!;
      try {
        await send(e);
        sent++;
      } catch (err) {
        if (isUnreachable(err)) break;
        onFail(outboxLabel(e), err instanceof Error ? err.message : String(err));
      }
      // 送れたもの・送れないと決まったものは外す
      commit(entries.filter((x) => x.id !== e.id));
    }
  } finally {
    flushing = false;
  }
  return sent;
}
