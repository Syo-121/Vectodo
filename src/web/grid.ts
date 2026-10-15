// 時間割（design 4-11・7-8）: 重なるブロックを横に並べる列の割り当て、時刻の丸め、ドラッグで落としたときのやる日の書き換え。画面で使う純粋関数。

import { moveDoDate } from './board/logic.ts';
import type { Task } from '../shared/types.ts';

/** ドラッグで選ぶ時間の刻み（分） */
export const SNAP = 15;

export function snap(m: number, how: 'round' | 'floor' = 'round'): number {
  return (how === 'floor' ? Math.floor : Math.round)(m / SNAP) * SNAP;
}

/** タスクを置く先（date の start〜end）。host があれば予定に重ねて置く（ながら）。fixed は時間割でドラッグして選んだ長さ（そのまま使う） */
export interface Slot {
  date: string;
  start: number;
  end: number;
  host?: string;
  fixed?: boolean;
}

/** 置こうとしている時間（パネルで変えると時間割の選んだ時間も動く）。len が null なら「見積どおり」 */
export interface Draft {
  start: number;
  len: number | null;
}

export interface Laid<T> {
  item: T;
  start: number;
  end: number;
  /** 何列目か（0 から）と、重なりの塊の列数 */
  col: number;
  cols: number;
}

/**
 * 重なるもの同士を横に並べる（Google カレンダーの1日表示と同じ考え方）。
 * 早く始まる順に、空いている左の列へ入れる。重なりの塊ごとに列数をそろえる（塊の中は同じ幅）。
 * 長さ0の予定も少しは見せるので、15分あるものとして並べる
 */
export function lanes<T>(items: { item: T; start: number; end: number }[]): Laid<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Laid<T>[] = [];
  let cluster: Laid<T>[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -Infinity;
  const close = () => {
    for (const x of cluster) x.cols = colEnds.length;
    cluster = [];
    colEnds = [];
  };
  for (const it of sorted) {
    const end = Math.max(it.end, it.start + SNAP);
    if (it.start >= clusterEnd) {
      close();
      clusterEnd = -Infinity;
    }
    let col = colEnds.findIndex((e) => e <= it.start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(end);
    } else colEnds[col] = end;
    const laid: Laid<T> = { ...it, col, cols: 0 };
    cluster.push(laid);
    out.push(laid);
    clusterEnd = Math.max(clusterEnd, end);
  }
  close();
  return out;
}

/**
 * 時間割をタップしたところにタスクを置くときの枠: 予定の上ならその予定（ながら）、
 * 空いているところなら次の予定（無ければ寝る時刻・最低15分）まで
 */
export function slotAt(
  date: string,
  at: number,
  events: { start: number; end: number; title: string }[],
  dayEnd: number,
): Slot {
  const host = events.find((e) => e.start <= at && at < e.end);
  if (host) return { date, start: at, end: host.end, host: host.title };
  const next = Math.min(...events.filter((e) => e.start > at).map((e) => e.start), Math.max(dayEnd, at + SNAP));
  return { date, start: at, end: next };
}

type DoDates = Task['doDates'];
const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

/** やる日 from を、to の start から minutes の長さに置く（to に既にあれば置き換える） */
export function placeOn(doDates: DoDates, from: string, to: string, start: string, minutes: number): DoDates {
  return [...doDates.filter((d) => d.date !== from && d.date !== to), { date: to, minutes, start }].sort(byDate);
}

/** やる日 from の時刻を外して、to の終日へ（to に既にあれば時間を足し合わせる＝週の移動と同じ） */
export function unplaceTo(doDates: DoDates, from: string, to: string): DoDates {
  if (from === to) return doDates.map((d) => (d.date === from ? { ...d, start: null } : d));
  return moveDoDate(doDates, from, to).map((d) => (d.date === to ? { ...d, start: null } : d));
}
