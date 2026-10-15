// つながっていないときの印（design 7-9）。sw.js は、つながらないとき端末に残しておいた最後の中身を返し、
// その返事に x-vectodo-saved（保存した時刻）を付ける。印つきの返事が来たら「つながっていない」、印のない返事が来たら「つながった」。

import { useSyncExternalStore } from 'react';
import { TZ } from './util.ts';

/** つながっていないとき: 見せている中身を保存した時刻（ISO・分からなければ null）。つながっていれば null */
export type Offline = { savedAt: string | null } | null;

let state: Offline = null;
const listeners = new Set<() => void>();

function emit(next: Offline) {
  if (next?.savedAt === state?.savedAt && (next === null) === (state === null)) return;
  state = next;
  for (const l of listeners) l();
}

/** 読み取りの返事ごとに呼ぶ */
export function noteResponse(res: Response): void {
  const saved = res.headers.get('x-vectodo-saved');
  emit(saved ? { savedAt: saved } : null);
}

/** 読み取りがつながらず、残しておいた中身も無かった */
export function noteUnreachable(): void {
  emit({ savedAt: state?.savedAt ?? null });
}

export const isOffline = (): boolean => state !== null;

export function useOffline(): Offline {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

const CLOCK = new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 保存した時刻を「10/15 13:20」に */
export const fmtSaved = (iso: string) => CLOCK.format(new Date(iso));
