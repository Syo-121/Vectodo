// 今日の流れ（design 4-11）: Google の予定（時刻つき）とタスクの締切、空きに置いたタスクを時刻順に1本に並べ、このあとの空き時間を出す。
// 画面で使う純粋関数。時刻はその日の 0:00 からの分で扱う。
// 空き＝起きている時間帯（設定）のうち、いま以降で Google の予定の入っていない時間。15分未満のすき間は数えない。
// 空きに置いたタスクは空きの中に並べる（合計の空きは減らさない＝右上の「今日の分／空き」と同じ物差し）。
// 予定に重ねて置いたタスク（移動中・授業のすき間など＝「ながら」）は予定のすぐ下に並び、その時間は空きとは別に「ながら」として数える。

import { addDays } from './dates.ts';
import type { OverlayEvent, Task } from './types.ts';

/** これより短いすき間は空きに数えない（予定と予定のあいだの10分など） */
export const MIN_FREE = 15;
/** 空きに置いたタスクの長さが分からないとき（その日の配分も見積も無い）。Google に書き出す長さも同じ */
export const PLACE_DEFAULT_MIN = 30;
const DAY = 24 * 60;

export type FlowItem =
  /** now: いま、この予定の最中 */
  | { kind: 'event'; start: number; end: number; event: OverlayEvent; now: boolean }
  /** past: 時刻を過ぎたのに終わっていない */
  | { kind: 'due'; at: number; task: Task; past: boolean }
  /** 置いたタスク（やる日の時刻）。now: いま、その時間の最中。over: 予定と重なる（ながら） */
  | { kind: 'plan'; start: number; end: number; task: Task; now: boolean; over: boolean }
  | { kind: 'free'; start: number; end: number };

export interface TimedEvent {
  start: number;
  end: number;
  event: OverlayEvent;
}

export interface DayFlow {
  /** いま以降（終わっていない締切と、最中の予定も）を時刻順に */
  items: FlowItem[];
  /** 終日の予定（空きの計算には入れない） */
  allDay: OverlayEvent[];
  /** 時刻つきの予定の全部（終わったものも。帯に描く） */
  timed: TimedEvent[];
  /** このあとの空き（分） */
  freeMin: number;
  /** このあとの空きに置いたタスクの時間（分） */
  placedMin: number;
  /** このあと、空きの外（予定と重ねて・寝る時刻の後など）に置いたタスクの時間（分）。空きと足したものが今日使える時間 */
  alongMin: number;
}

export function toMin(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 14:05。24:00 はそのまま */
export function fmtClock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** 置いたタスクの時間（その日の配分、無ければ見積、どちらも無ければ 30m） */
export function placedSpan(t: Task, date: string): { start: number; end: number } | null {
  const d = t.doDates.find((x) => x.date === date);
  if (!d?.start) return null;
  const start = toMin(d.start);
  return { start, end: start + (d.minutes ?? t.estimateMin ?? PLACE_DEFAULT_MIN) };
}

/** その日の終日の予定 */
export function allDayOn(events: OverlayEvent[], date: string): OverlayEvent[] {
  return events.filter((e) => e.start === null && e.date <= date && date < e.endDate);
}

/**
 * その日の時刻つきの予定。日をまたぐ予定（終わりが始まりより前）は、始まる日は 24:00 まで・次の日は 0:00 から。
 * 何日もまたぐ時刻つきの予定は、終わる日が分からないので始まる日だけに出す
 */
export function timedOn(events: OverlayEvent[], date: string): TimedEvent[] {
  const prev = addDays(date, -1);
  return events.flatMap((e): TimedEvent[] => {
    if (e.start === null) return [];
    const start = toMin(e.start);
    const end = e.end ? toMin(e.end) : start;
    if (e.date === date) return [{ start, end: end < start ? DAY : end, event: e }];
    if (e.date === prev && end < start && end > 0) return [{ start: 0, end, event: e }];
    return [];
  });
}

/** 重なる時間をまとめる */
function busyOf(spans: { start: number; end: number }[]): [number, number][] {
  const out: [number, number][] = [];
  for (const { start, end } of [...spans].sort((a, b) => a.start - b.start)) {
    if (end <= start) continue;
    const last = out.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

/** 同じ時刻なら 締切 → 予定（早く終わるほうから）→ 置いたタスク → 空き */
const ORDER = { due: 0, event: 1, plan: 2, free: 3 } as const;
const at = (x: FlowItem) => (x.kind === 'due' ? x.at : x.start);
const until = (x: FlowItem) => (x.kind === 'due' ? x.at : x.end);

export function dayFlow(input: {
  today: string;
  events: OverlayEvent[];
  deadlines: Task[];
  /** 空きに置いたタスク（今日のやる日に時刻があるもの） */
  placed?: Task[];
  /** いまの時刻（分） */
  now: number;
  dayStart: number;
  dayEnd: number;
}): DayFlow {
  const { today, now, dayStart, dayEnd } = input;
  const allDay = allDayOn(input.events, today);
  const timed = timedOn(input.events, today);

  // 空き: [いま（起きる前なら起きる時刻）, 寝る時刻] から予定の時間を除いた、15分以上のすき間
  const from = Math.max(now, dayStart);
  const free: [number, number][] = [];
  const busy = busyOf(timed);
  let cur = from;
  for (const [s, e] of busy) {
    if (e <= cur) continue;
    if (s >= dayEnd) break;
    if (s > cur) free.push([cur, Math.min(s, dayEnd)]);
    cur = Math.max(cur, e);
  }
  if (cur < dayEnd) free.push([cur, dayEnd]);
  const slots = free.filter(([s, e]) => e - s >= MIN_FREE);
  const freeMin = slots.reduce((sum, [s, e]) => sum + e - s, 0);

  // 置いたタスク: 終わっていないものを並べ、空きの見せ方からはその時間を除く
  const plans = (input.placed ?? [])
    .map((task) => ({ task, span: placedSpan(task, today) }))
    .filter((x): x is { task: Task; span: { start: number; end: number } } => x.span !== null);
  const used = busyOf(plans.map((p) => p.span));
  const placedMin = slots.reduce(
    (sum, [s, e]) => sum + used.reduce((u, [a, b]) => u + Math.max(0, Math.min(b, e) - Math.max(a, s)), 0),
    0,
  );
  const after = used.reduce((sum, [a, b]) => sum + Math.max(0, b - Math.max(a, from)), 0);
  const alongMin = after - placedMin;
  const overlaps = (s: number, e: number) => busy.some(([a, b]) => a < e && s < b);
  const unplaced = slots.flatMap(([s, e]) => {
    const out: [number, number][] = [];
    let c = s;
    for (const [a, b] of used) {
      if (b <= c || a >= e) continue;
      if (a > c) out.push([c, a]);
      c = Math.max(c, b);
    }
    if (c < e) out.push([c, e]);
    return out;
  });

  const dues = input.deadlines
    .filter((t) => t.dueDate === today && t.dueTime !== null)
    .map((t): FlowItem => ({ kind: 'due', at: toMin(t.dueTime!), task: t, past: toMin(t.dueTime!) < now }));
  // 空きは締切の時刻で切って見せる（「締切までに 2h」が読めるように）。切った残りや置いたタスクの間の15分未満は並べない。合計は切る前の値
  const cuts = dues.map(at);
  const pieces = unplaced.flatMap(([s, e]) => {
    const marks = [s, ...cuts.filter((c) => c > s && c < e), e];
    return marks.slice(1).map((m, i): [number, number] => [marks[i]!, m]);
  });

  const items: FlowItem[] = [
    ...dues,
    ...timed
      // 終わっていない予定（長さ0の予定は、その時刻を過ぎるまで）
      .filter((x) => Math.max(x.end, x.start + 1) > now)
      .map((x): FlowItem => ({ kind: 'event', ...x, now: x.start <= now && now < x.end })),
    ...plans
      .filter((p) => p.span.end > now)
      .map(
        (p): FlowItem => ({
          kind: 'plan',
          ...p.span,
          task: p.task,
          now: p.span.start <= now && now < p.span.end,
          over: overlaps(p.span.start, p.span.end),
        }),
      ),
    ...pieces.filter(([s, e]) => e - s >= MIN_FREE).map(([start, end]): FlowItem => ({ kind: 'free', start, end })),
  ].sort((a, b) => at(a) - at(b) || ORDER[a.kind] - ORDER[b.kind] || until(a) - until(b));

  return { items, allDay, timed, freeMin, placedMin, alongMin };
}
