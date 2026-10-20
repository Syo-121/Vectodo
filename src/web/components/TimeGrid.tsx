// 時間割（design 4-11・7-8）: Google カレンダーの1日・週の表示のように、縦の時間軸に予定と置いたタスクを並べる。
// 今日の流れ（1日）・ボードの「日」（1日）・「週」（7日）で使う。
// - 時間を選んで置く: 空いているところ（予定の上でもよい＝ながら）をドラッグ → タスクを選ぶ（onPlace）
// - タップ: 空いているところならその時刻から置く・タスクなら詳細を開く
// - 置いたタスク: ドラッグで動かす（別の日へも）・下の端で長さを変える・上の「終日」の段へ落とすと時刻を外す
// - 終日の段のタスク（時刻の無いやる日）: 別の日の終日へ落とすとやる日が移る・時間の欄へ落とすとその時刻に置く
// マウスは押してすぐ、指は長押し（0.35秒）してから動かす（その前に動かすとスクロール）。
// 目標をやる時間（design 4-14）は、やる日1日だけのタスクの形に写して tasks に混ぜて渡す（goalPlans.ts）。緑で描き、押すと onOpenPlan。

import { useEffect, useRef, useState } from 'react';
import { allDayOn, fmtClock, PLACE_DEFAULT_MIN, placedSpan, timedOn } from '../../shared/flow.ts';
import type { Category, GoalPlan, OverlayEvent, Task } from '../../shared/types.ts';
import { planOf } from '../goalPlans.ts';
import { lanes, placeOn, slotAt, snap, SNAP, unplaceTo, type Draft, type Slot } from '../grid.ts';
import { useWideScreen } from '../media.ts';
import { useOpenTask } from '../nav.ts';
import { cx, fmtMin, fmtSpan, isOpenTask } from '../util.ts';

/** 1分の高さ（1時間 48px） */
const PX = 0.8;
/** 指で長押しとみなす時間 */
const HOLD_MS = 350;

type Zone = 'allday' | 'time';
interface Hit {
  col: number;
  zone: Zone;
  min: number;
}

type Drag =
  | { kind: 'open'; id: number }
  | { kind: 'new'; col: number; anchor: number; cur: number; moved: boolean }
  | { kind: 'block'; task: Task; from: string; start: number; len: number; grab: number; origin: Hit; hit: Hit; moved: boolean }
  | { kind: 'resize'; task: Task; col: number; start: number; cur: number }
  | { kind: 'chip'; task: Task; from: string; minutes: number; origin: Hit; hit: Hit; moved: boolean };

type Block = { kind: 'event'; e: ReturnType<typeof timedOn>[number] } | { kind: 'plan'; t: Task; over: boolean; done: boolean };

export function TimeGrid({
  days,
  today,
  now,
  events,
  tasks: given,
  categories,
  dayStart,
  dayEnd,
  allDayRow = false,
  head,
  onPlace,
  onSetDates,
  onOpenPlan,
  pending,
  focus,
  className,
  colMin = 0,
}: {
  days: string[];
  today: string;
  /** いまの時刻（分）。今日の列に赤線を引く */
  now: number;
  /** Google の予定（つながっていなければ空） */
  events: OverlayEvent[];
  /** やる日・締切を描くタスク（完了したものは薄く・動かせない） */
  tasks: Task[];
  categories?: Map<number, Category>;
  dayStart: number;
  dayEnd: number;
  /** 上に「終日」の段（時刻の無いやる日・締切・終日の予定）を出す */
  allDayRow?: boolean;
  /** 列の見出し（日付と合計など） */
  head?: (date: string) => React.ReactNode;
  onPlace: (slot: Slot) => void;
  /** やる日を書き換える（落としたとき）。終わるまでは落とした位置に見せる */
  onSetDates: (task: Task, dates: Task['doDates']) => Promise<unknown>;
  /** 目標をやる時間を押したとき（記録・外す・時刻を変えるシートを開く） */
  onOpenPlan?: (plan: GoalPlan) => void;
  /** 置こうとしている時間（パネルを開いている間、選んだまま見せる） */
  pending: (Draft & { date: string }) | null;
  /** 変わったら、置こうとしている時間が見えるようにスクロールする */
  focus: number;
  /** 外枠（高さ） */
  className?: string;
  /** 1列の最低の幅（px・週はスマホで横にスクロールさせる） */
  colMin?: number;
}) {
  const wide = useWideScreen();
  const openTask = useOpenTask();
  const scroller = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const hold = useRef<{ timer: number; x: number; y: number; d: Drag } | null>(null);
  // 落としたあと、保存が終わるまではその位置に見せる（元の位置に一瞬戻らないように）
  const [overrides, setOverrides] = useState<Map<number, Task['doDates']>>(new Map());
  const tasks = given.map((t) => (overrides.has(t.id) ? { ...t, doDates: overrides.get(t.id)! } : t));

  const cols = days.map((date) => {
    const timed = timedOn(events, date);
    const blocks = tasks.flatMap((t) => {
      const s = placedSpan(t, date);
      return s ? [{ t, ...s, done: !isOpenTask(t) }] : [];
    });
    const chips = tasks.filter(isOpenTask).flatMap((t) => {
      const d = t.doDates.find((x) => x.date === date && !x.start);
      return d ? [{ t, minutes: d.minutes }] : [];
    });
    const dues = tasks.filter((t) => isOpenTask(t) && t.dueDate === date);
    return {
      date,
      timed,
      allDay: allDayOn(events, date),
      blocks,
      chips,
      dueAt: dues.filter((t) => t.dueTime !== null),
      dueDay: dues.filter((t) => t.dueTime === null && !chips.some((c) => c.t.id === t.id)),
    };
  });
  const spans = cols.flatMap((c) => [...c.timed, ...c.blocks]);
  const lo = Math.floor(Math.min(dayStart, ...spans.map((x) => x.start)) / 60) * 60;
  const hi = Math.ceil(Math.max(dayEnd, ...spans.map((x) => x.end)) / 60) * 60;
  const y = (m: number) => (m - lo) * PX;
  const hasHead = allDayRow || head !== undefined;

  /** 画面の位置 → 何列目・終日か時間か・何分 */
  const hitAt = (x: number, yy: number): Hit => {
    const rects = colRefs.current.slice(0, days.length).map((c) => c?.getBoundingClientRect());
    let col = rects.findIndex((r) => r && x >= r.left && x < r.right);
    if (col === -1) col = x < (rects[0]?.left ?? 0) ? 0 : days.length - 1;
    const top = timeRef.current!.getBoundingClientRect().top;
    const headBottom = headRef.current?.getBoundingClientRect().bottom ?? -Infinity;
    return {
      col,
      zone: allDayRow && yy < headBottom ? 'allday' : 'time',
      min: Math.min(hi, Math.max(lo, lo + (yy - top) / PX)),
    };
  };

  // 開いたときは、いま（今日が無ければ起きる時刻）のあたりを見せる
  useEffect(() => {
    const s = scroller.current;
    if (!s) return;
    const at = days.includes(today) ? Math.max(now, lo) : dayStart;
    s.scrollTop = Math.max(0, y(at) - 56);
    // 最初の1回と、表示する日が変わったときだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join()]);
  // パネルを開いたとき: 狭い画面はパネルが下半分を覆うので、選んだ時間が上半分に来るよう寄せる
  useEffect(() => {
    const s = scroller.current;
    if (!pending || !s || wide) return;
    const top = y(pending.start);
    if (top < s.scrollTop || top > s.scrollTop + s.clientHeight * 0.4) s.scrollTop = Math.max(0, top - 32);
    const c = colRefs.current[days.indexOf(pending.date)];
    if (c) {
      const left = c.offsetLeft - 40;
      if (left < s.scrollLeft || c.offsetLeft + c.offsetWidth > s.scrollLeft + s.clientWidth) s.scrollLeft = Math.max(0, left);
    }
    const r = s.getBoundingClientRect();
    if (r.top < 0 || r.top > 16) window.scrollBy({ top: r.top - 8, behavior: 'smooth' });
    // focus が変わったときだけ（パネルで時刻を変えるたびには動かさない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  // 指でドラッグしている間はスクロールさせない（touchmove を止めるには passive: false が要る）
  useEffect(() => {
    const s = scroller.current;
    if (!s) return;
    const stop = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    s.addEventListener('touchmove', stop, { passive: false });
    return () => s.removeEventListener('touchmove', stop);
  }, []);

  const begin = (d: Drag, pointerId: number) => {
    setDrag(d);
    try {
      wrap.current?.setPointerCapture(pointerId);
    } catch {
      // 指がもう離れていたら何もしない
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = e.target as HTMLElement;
    const h = hitAt(e.clientX, e.clientY);
    const blockEl = el.closest<HTMLElement>('[data-block]');
    const chipEl = el.closest<HTMLElement>('[data-chip]');
    const openEl = el.closest<HTMLElement>('[data-open]');
    let d: Drag | null = null;
    if (blockEl) {
      const [id, date] = blockEl.dataset.block!.split('|') as [string, string];
      const col = cols.findIndex((c) => c.date === date);
      const b = cols[col]?.blocks.find((x) => x.t.id === Number(id));
      if (!b) return;
      if (b.done) d = { kind: 'open', id: b.t.id };
      else if (el.closest('[data-edge]')) d = { kind: 'resize', task: b.t, col, start: b.start, cur: b.end };
      else d = { kind: 'block', task: b.t, from: date, start: b.start, len: b.end - b.start, grab: h.min - b.start, origin: h, hit: h, moved: false };
    } else if (chipEl) {
      const [id, date] = chipEl.dataset.chip!.split('|') as [string, string];
      const c = cols.find((x) => x.date === date)?.chips.find((x) => x.t.id === Number(id));
      if (!c) return;
      const minutes = c.minutes ?? c.t.estimateMin ?? PLACE_DEFAULT_MIN;
      d = { kind: 'chip', task: c.t, from: date, minutes, origin: h, hit: h, moved: false };
    } else if (openEl) {
      d = { kind: 'open', id: Number(openEl.dataset.open) };
    } else if (h.zone === 'time') {
      const a = snap(h.min, 'floor');
      d = { kind: 'new', col: h.col, anchor: a, cur: a, moved: false };
    }
    if (!d) return;
    if (e.pointerType === 'mouse') {
      e.preventDefault();
      begin(d, e.pointerId);
      return;
    }
    // 指: 長押しで始める。その前に動いたらスクロール、動かずに離したらタップ
    const pid = e.pointerId;
    const start = d;
    hold.current = {
      timer: window.setTimeout(() => {
        hold.current = null;
        navigator.vibrate?.(10);
        begin(start, pid);
      }, HOLD_MS),
      x: e.clientX,
      y: e.clientY,
      d,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const hd = hold.current;
    if (hd) {
      if (Math.hypot(e.clientX - hd.x, e.clientY - hd.y) > 8) {
        clearTimeout(hd.timer);
        hold.current = null;
      }
      return;
    }
    const d = dragRef.current;
    if (!d || d.kind === 'open') return;
    const h = hitAt(e.clientX, e.clientY);
    if (d.kind === 'new') {
      const cur = snap(h.min);
      if (cur !== d.cur) setDrag({ ...d, cur, moved: true });
    } else if (d.kind === 'resize') {
      const cur = snap(h.min);
      if (cur !== d.cur) setDrag({ ...d, cur });
    } else {
      const moved = d.moved || h.col !== d.origin.col || h.zone !== d.origin.zone || Math.abs(h.min - d.origin.min) > 4;
      setDrag({ ...d, hit: h, moved });
    }
  };

  const commit = (t: Task, dates: Task['doDates']) => {
    setOverrides((m) => new Map(m).set(t.id, dates));
    void onSetDates(t, dates).finally(() =>
      setOverrides((m) => {
        const n = new Map(m);
        n.delete(t.id);
        return n;
      }),
    );
  };

  /** 押したら開く: 目標をやる時間ならその予定のシート、タスクなら詳細 */
  const openItem = (id: number) => {
    const plan = planOf(tasks.find((t) => t.id === id));
    return plan ? onOpenPlan?.(plan) : openTask(id);
  };

  const tap = (d: Drag) => {
    if (d.kind === 'open') return openItem(d.id);
    if (d.kind === 'new') {
      const c = cols[d.col]!;
      return onPlace(slotAt(c.date, d.anchor, c.timed.map((x) => ({ start: x.start, end: x.end, title: x.event.title })), dayEnd));
    }
    return openItem(d.task.id);
  };

  /** ブロック・カードを落とす先（時間の欄なら始める時刻も） */
  const dropOf = (d: Extract<Drag, { kind: 'block' | 'chip' }>) => {
    const date = cols[d.hit.col]!.date;
    if (d.hit.zone === 'allday') return { date, start: null };
    const start = d.kind === 'block' ? snap(d.hit.min - d.grab) : snap(d.hit.min, 'floor');
    return { date, start, len: d.kind === 'block' ? d.len : d.minutes };
  };

  const finish = (d: Drag) => {
    if (d.kind === 'open') return tap(d);
    if (d.kind === 'new') {
      if (!d.moved) return tap(d);
      const c = cols[d.col]!;
      const s = Math.min(d.anchor, d.cur);
      const end = Math.max(d.anchor, d.cur, s + SNAP);
      return onPlace({ date: c.date, start: s, end, host: c.timed.find((x) => x.start < end && s < x.end)?.event.title, fixed: true });
    }
    if (d.kind === 'resize') {
      const date = cols[d.col]!.date;
      const end = Math.max(d.start + SNAP, d.cur);
      if (end === placedSpan(d.task, date)?.end) return;
      return commit(
        d.task,
        d.task.doDates.map((x) => (x.date === date ? { ...x, minutes: end - d.start } : x)),
      );
    }
    if (!d.moved) return tap(d);
    const to = dropOf(d);
    if (to.start === null) {
      if (d.kind === 'chip' && to.date === d.from) return;
      return commit(d.task, unplaceTo(d.task.doDates, d.from, to.date));
    }
    if (d.kind === 'block' && to.date === d.from && to.start === d.start) return;
    return commit(d.task, placeOn(d.task.doDates, d.from, to.date, fmtClock(to.start), to.len!));
  };

  const onPointerUp = () => {
    const hd = hold.current;
    if (hd) {
      clearTimeout(hd.timer);
      hold.current = null;
      tap(hd.d);
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    finish(d);
  };

  const onPointerCancel = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
    setDrag(null);
  };

  // ドラッグ中に見せるもの
  const moving = drag && (drag.kind === 'block' || drag.kind === 'chip') && drag.moved ? drag : null;
  const target = moving ? dropOf(moving) : null;
  const hours: number[] = [];
  for (let m = lo; m <= hi; m += 60) hours.push(m);
  const pos = (col: number, n: number) => ({ left: `calc(${(col / n) * 100}% + 1px)`, width: `calc(${100 / n}% - 3px)` });
  // 目標をやる時間は緑（emerald-500）
  const catColor = (t: Task) =>
    planOf(t) ? '#10b981' : ((t.categoryId !== null ? categories?.get(t.categoryId)?.color : undefined) ?? '#a1a1aa');
  const minWidth = colMin ? 40 + colMin * days.length : undefined;

  return (
    // isolate: 中の重なり順（時刻の目盛り・終日の段・締切の線など）を時間割の中だけに閉じ込める。
    // しないと、固定した画面下のタブ（z-20）より上に描かれてタブに被る
    <div
      ref={scroller}
      className={cx('relative isolate overflow-auto overscroll-contain rounded-lg border border-zinc-200 dark:border-zinc-800', className)}
    >
      <div
        ref={wrap}
        className="relative touch-pan-x touch-pan-y select-none [-webkit-touch-callout:none]"
        style={{ minWidth }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {hasHead && (
          <div ref={headRef} className="sticky top-0 z-30 flex border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="sticky left-0 z-10 w-10 shrink-0 bg-white pt-1.5 pr-1.5 text-right text-[10px] text-zinc-400 dark:bg-zinc-900">
              {allDayRow && '終日'}
            </div>
            {cols.map((c, i) => (
              <div
                key={c.date}
                className={cx(
                  'min-w-0 flex-1 border-l border-zinc-200 px-1 pt-1 pb-1.5 dark:border-zinc-800',
                  target?.start === null && target.date === c.date && 'bg-indigo-50 ring-2 ring-indigo-400 ring-inset dark:bg-indigo-950',
                )}
                style={{ minWidth: colMin || undefined }}
              >
                {head?.(c.date)}
                {allDayRow && (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {c.allDay.map((e) => (
                      <div
                        key={e.id}
                        className="truncate rounded px-1 py-px text-[10px] text-zinc-600 dark:text-zinc-300"
                        style={{ background: `${e.color ?? '#a1a1aa'}33` }}
                        title={e.title}
                      >
                        {e.title}
                      </div>
                    ))}
                    {c.dueDay.map((t) => (
                      <div
                        key={`d${t.id}`}
                        data-open={t.id}
                        className="cursor-pointer truncate rounded border border-red-300 px-1 py-px text-[10px] text-red-700 dark:border-red-900 dark:text-red-300"
                      >
                        締切 {t.title}
                      </div>
                    ))}
                    {c.chips.map(({ t, minutes }) => (
                      <div
                        key={`c${t.id}`}
                        data-chip={`${t.id}|${c.date}`}
                        className={cx(
                          'flex cursor-grab items-center gap-1 truncate rounded border border-zinc-200 bg-white px-1 py-0.5 text-[11px] shadow-xs dark:border-zinc-700 dark:bg-zinc-800',
                          moving?.task.id === t.id && moving.from === c.date && 'opacity-40',
                        )}
                        style={{ borderLeft: `3px solid ${catColor(t)}` }}
                      >
                        {minutes !== null && <span className="shrink-0 text-[10px] text-zinc-500">{fmtMin(minutes)}</span>}
                        <span className="truncate">{t.title}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* 終日の段に何も無くても、落とす場所の高さは取る */}
                {allDayRow && c.allDay.length + c.dueDay.length + c.chips.length === 0 && <div className="h-4" />}
              </div>
            ))}
          </div>
        )}

        <div ref={timeRef} className="relative flex" style={{ height: y(hi) + 8 }}>
          {/* 時刻の目盛り */}
          <div className="sticky left-0 z-20 w-10 shrink-0 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            {hours.map((m) => (
              <span
                key={m}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] text-zinc-400 tabular-nums"
                style={{ top: y(m) + (m === lo ? 6 : 0) }}
              >
                {m / 60}:00
              </span>
            ))}
          </div>
          {cols.map((c, i) => {
            const laid = lanes<Block>([
              ...c.timed.map((e) => ({ item: { kind: 'event' as const, e }, start: e.start, end: e.end })),
              ...c.blocks.map((b) => ({
                item: { kind: 'plan' as const, t: b.t, done: b.done, over: c.timed.some((e) => e.start < b.end && b.start < e.end) },
                start: b.start,
                end: b.end,
              })),
            ]);
            const isToday = c.date === today;
            const pastTo = c.date < today ? hi : isToday ? Math.min(now, hi) : lo;
            return (
              <div
                key={c.date}
                ref={(el) => {
                  colRefs.current[i] = el;
                }}
                className={cx(
                  'relative min-w-0 flex-1 border-l border-zinc-200 dark:border-zinc-800',
                  drag?.kind === 'block' || drag?.kind === 'chip'
                    ? 'cursor-grabbing'
                    : drag?.kind === 'resize'
                      ? 'cursor-ns-resize'
                      : 'cursor-crosshair',
                )}
                style={{ minWidth: colMin || undefined }}
              >
                {/* 起きている時間の外と、過ぎた時間は薄く */}
                <div className="pointer-events-none absolute inset-x-0 top-0 bg-zinc-100/80 dark:bg-zinc-800/50" style={{ height: y(dayStart) }} />
                <div
                  className="pointer-events-none absolute inset-x-0 bg-zinc-100/80 dark:bg-zinc-800/50"
                  style={{ top: y(dayEnd), height: Math.max(0, y(hi) - y(dayEnd)) }}
                />
                {hours.map((m) => (
                  <div
                    key={m}
                    className="pointer-events-none absolute inset-x-0 border-t border-zinc-200 dark:border-zinc-800"
                    style={{ top: y(m) }}
                  >
                    <div className="absolute inset-x-0 top-6 border-t border-dashed border-zinc-100 dark:border-zinc-800/60" />
                  </div>
                ))}
                {pastTo > lo && (
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 bg-white/50 dark:bg-zinc-950/40"
                    style={{ height: y(pastTo) }}
                  />
                )}

                {laid.map(({ item, start, end, col, cols: n }) => {
                  if (item.kind === 'event') {
                    const color = item.e.event.color ?? '#a1a1aa';
                    const h = Math.max((end - start) * PX, 14);
                    return (
                      <div
                        key={`e${item.e.event.id}${start}`}
                        className="pointer-events-none absolute overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight text-zinc-800 dark:text-zinc-100"
                        style={{ ...pos(col, n), top: y(start), height: h, background: `${color}40`, borderLeft: `3px solid ${color}` }}
                      >
                        <div className="truncate font-medium">{item.e.event.title}</div>
                        {h >= 30 && (
                          <div className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                            {fmtClock(start)}–{fmtClock(end)}
                          </div>
                        )}
                      </div>
                    );
                  }
                  const resizing = drag?.kind === 'resize' && drag.task.id === item.t.id && drag.col === i;
                  const e2 = resizing ? Math.max(start + SNAP, drag.cur) : end;
                  const h = Math.max((e2 - start) * PX, 16);
                  const lifted = moving?.task.id === item.t.id && moving.from === c.date;
                  const goal = planOf(item.t) !== undefined;
                  return (
                    <div
                      key={`p${item.t.id}`}
                      data-block={`${item.t.id}|${c.date}`}
                      className={cx(
                        'absolute overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight shadow-sm',
                        item.done
                          ? goal
                            ? 'cursor-pointer border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'cursor-pointer border border-zinc-300 bg-zinc-100 text-zinc-400 line-through dark:border-zinc-700 dark:bg-zinc-800'
                          : item.over
                            ? goal
                              ? 'cursor-grab border border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                              : 'cursor-grab border border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200'
                            : goal
                              ? 'cursor-grab bg-emerald-600 text-white'
                              : 'cursor-grab bg-indigo-500 text-white',
                        resizing && 'z-20 ring-2 ring-indigo-300',
                        lifted && 'opacity-30',
                      )}
                      style={{ ...pos(col, n), top: y(start), height: h }}
                    >
                      <div className="truncate font-medium">
                        {item.over && !item.done && <span className="mr-1 font-normal opacity-80">ながら</span>}
                        {goal && item.done && '✓ '}
                        {item.t.title}
                      </div>
                      {h >= 30 && (
                        <div className="truncate text-[10px] opacity-80">
                          {fmtClock(start)}–{fmtClock(e2)}
                        </div>
                      )}
                      {/* 下の端: ドラッグで長さを変える */}
                      {!item.done && (
                        <div data-edge="1" className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-end justify-center pb-0.5">
                          <span className={cx('h-0.5 w-5 rounded-full', item.over ? (goal ? 'bg-emerald-400' : 'bg-indigo-400') : 'bg-white/70')} />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 締切の線 */}
                {c.dueAt.map((t) => {
                  const at = Number(t.dueTime!.slice(0, 2)) * 60 + Number(t.dueTime!.slice(3, 5));
                  const past = c.date < today || (isToday && at < now);
                  return (
                    <div
                      key={`d${t.id}`}
                      className={cx('pointer-events-none absolute inset-x-0 z-10 border-t-2', past ? 'border-red-500' : 'border-orange-500')}
                      style={{ top: y(at) }}
                    >
                      <span
                        className={cx(
                          'absolute right-1 -translate-y-1/2 truncate rounded px-1 text-[10px] font-medium text-white',
                          past ? 'bg-red-500' : 'bg-orange-500',
                        )}
                        style={{ maxWidth: '85%' }}
                      >
                        締切 {t.dueTime} {t.title}
                      </span>
                    </div>
                  );
                })}

                {/* いま */}
                {isToday && now > lo && now < hi && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: y(now) }}>
                    <span className="absolute -top-[5px] -left-[5px] size-2 rounded-full bg-red-500" />
                  </div>
                )}

                {/* ドラッグで選んでいる時間・置こうとしている時間・動かしている先 */}
                {drag?.kind === 'new' && drag.moved && drag.col === i && (
                  <Selection
                    start={Math.min(drag.anchor, drag.cur)}
                    end={Math.max(drag.anchor, drag.cur, Math.min(drag.anchor, drag.cur) + SNAP)}
                    y={y}
                  />
                )}
                {pending && pending.date === c.date && !(drag?.kind === 'new' && drag.moved) && (
                  <Selection start={pending.start} end={pending.start + (pending.len ?? SNAP)} y={y} open={pending.len === null} />
                )}
                {target && target.start !== null && target.date === c.date && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 overflow-hidden rounded-md border-2 border-dashed border-indigo-500 bg-indigo-500/25 px-1.5 py-0.5 text-[11px] font-medium text-indigo-800 dark:text-indigo-100"
                    style={{ top: y(target.start), height: Math.max(target.len! * PX, 16) }}
                  >
                    {fmtClock(target.start)}–{fmtClock(target.start + target.len!)} {moving!.task.title}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 選んだ時間。open は長さが決まっていない（見積どおり）＝始める時刻だけ見せる */
function Selection({ start, end, y, open }: { start: number; end: number; y: (m: number) => number; open?: boolean }) {
  return (
    <div
      className={cx(
        'pointer-events-none absolute inset-x-0 z-20 rounded-md border-2 border-indigo-500 bg-indigo-500/20',
        open && 'border-dashed',
      )}
      style={{ top: y(start), height: Math.max(y(end) - y(start), 12) }}
    >
      {/* 下の予定の字と重なっても読めるよう、時刻は塗りの札に */}
      <span className="absolute -top-px -left-px max-w-full truncate rounded-tl-md rounded-br-md bg-indigo-600 px-1.5 py-px text-[11px] font-medium whitespace-nowrap text-white">
        {open ? `${fmtClock(start)}〜（長さは見積どおり）` : `${fmtClock(start)}–${fmtClock(end)}（${fmtSpan(end - start)}）`}
      </span>
    </div>
  );
}
