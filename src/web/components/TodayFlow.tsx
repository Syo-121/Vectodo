// 今日の流れ（design 4-11）: 見せ方は2つ（端末に覚える）。
// - 時間割: Google カレンダーの1日表示のような縦の時間軸。ドラッグで時間を選んでタスクを置く（components/TimeGrid.tsx・ボードの日・週と同じ）
// - 並び: 上に1日の帯、その下に、いま以降を時刻順に1本で。空きの［＋ 置く］・予定の［＋］（ながら）から置く
// 置くと今日のやる日に時刻が入り、Google に時刻つきの予定として書き出される。
// 目標をやる時間（design 4-14）は placed に混ぜて渡される（goalPlans.ts の planTask）。緑で描き、押すと記録のシート。

import { useEffect, useState } from 'react';
import { fmtClock, toMin, type DayFlow, type FlowItem } from '../../shared/flow.ts';
import type { GoalPlan, NextItem, OverlayEvent, Task } from '../../shared/types.ts';
import { api, useGoalWrite, useWrite } from '../api.ts';
import { planOf, planPatch } from '../goalPlans.ts';
import { type Slot } from '../grid.ts';
import { useWideScreen } from '../media.ts';
import { useOpenTask, useOpenTaskId } from '../nav.ts';
import { useClaimSidePanel } from '../sidePanel.ts';
import { useLocalState } from '../storage.ts';
import { toast } from '../toast.ts';
import { CARD, cx, fmtSpan, TZ } from '../util.ts';
import { PlanSheet } from './GoalSheets.tsx';
import { PlacePanel, usePlacing } from './PlacePanel.tsx';
import { TimeGrid } from './TimeGrid.tsx';

const H2 = 'px-7 pb-2 text-xs font-semibold tracking-wide text-zinc-500';

/** いまの時刻（0:00 からの分・日本時間）。1分ごとに進める */
export function useNow(): number {
  const read = () =>
    toMin(new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  const [now, setNow] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setNow(read()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * 畳むと帯だけ。Google につながっていなければ締切と置いたタスクだけ並べる。
 * candidates: 置く候補（次にやる順）・placed: 今日のやる日に時刻がある未完了（時間割に描く）
 */
export function FlowSection({
  flow,
  now,
  today,
  connected,
  dayStart,
  dayEnd,
  candidates,
  placed,
  deadlines,
  events,
}: {
  flow: DayFlow;
  now: number;
  today: string;
  connected: boolean;
  dayStart: number;
  dayEnd: number;
  candidates: NextItem[];
  placed: Task[];
  deadlines: Task[];
  events: OverlayEvent[];
}) {
  const [open, setOpen] = useLocalState('today.flowOpen', true);
  const [mode, setMode] = useLocalState<'grid' | 'list'>('today.flowMode', 'grid');
  const seg = (on: boolean) =>
    cx(
      'rounded px-2 py-0.5 text-[11px] font-normal',
      on ? 'bg-white text-zinc-800 shadow-xs dark:bg-zinc-700 dark:text-zinc-100' : 'text-zinc-500',
    );
  // 置こうとしている枠と、始める時刻・長さ（パネルと時間割で同じものを見る）
  const placing = usePlacing(today, now);
  const { slot, close } = placing;
  const openSlot = (s: Omit<Slot, 'date'>) => placing.open({ ...s, date: today });
  const wide = useWideScreen();
  // 広い画面は右の欄（詳細の欄）を借りる。詳細を開いたらパネルは閉じる
  useClaimSidePanel(wide && slot !== null);
  const openId = useOpenTaskId();
  useEffect(() => {
    if (openId !== null) close();
  }, [openId, close]);
  // 時間割で動かしたとき（目標をやる時間なら予定の書き換え）
  const write = useWrite((a: { id: number; dates: Task['doDates'] }) => api.setDates(a.id, a.dates));
  const movePlan = useGoalWrite((a: { id: number; dates: Task['doDates'] }) => api.updateGoalPlan(a.id, planPatch(a.dates)));
  const setDates = (t: Task, dates: Task['doDates']) => {
    const plan = planOf(t);
    return (plan ? movePlan.mutateAsync({ id: plan.id, dates }) : write.mutateAsync({ id: t.id, dates })).catch(() => undefined);
  };
  const [openPlan, setOpenPlan] = useState<GoalPlan | null>(null);
  const gridTasks = [...placed, ...deadlines.filter((t) => !placed.some((p) => p.id === t.id))];
  // いまに当たる行が無ければ「いま」の行を差し込む（予定や置いたタスクの最中・いまから始まる空きがあれば要らない）
  const covered = flow.items.some((x) => ((x.kind === 'event' || x.kind === 'plan') && x.now) || (x.kind === 'free' && x.start === now));
  const rows: (FlowItem | { kind: 'now' })[] = [...flow.items];
  if (!covered) {
    const at = rows.findIndex((x) => x.kind !== 'now' && (x.kind === 'due' ? !x.past : x.start >= now));
    rows.splice(at === -1 ? rows.length : at, 0, { kind: 'now' });
  }

  return (
    <section className="mt-6">
      <div className={cx(H2, 'flex items-center gap-2')}>
        <button type="button" onClick={() => setOpen(!open)} className="shrink-0 text-left">
          {open ? '▾' : '▸'} 今日の流れ
        </button>
        {open && (
          <span className="flex rounded-md bg-zinc-100 p-0.5 dark:bg-zinc-800">
            <button type="button" className={seg(mode === 'grid')} onClick={() => setMode('grid')}>
              時間割
            </button>
            <button type="button" className={seg(mode === 'list')} onClick={() => setMode('list')}>
              並び
            </button>
          </span>
        )}
        {connected && (
          <span className="ml-auto truncate font-normal">
            {flow.freeMin === 0 ? 'このあと空きは無い' : `このあと空き ${fmtSpan(flow.freeMin)}`}
          </span>
        )}
      </div>
      <div className={cx(CARD, 'px-3.5 py-3')}>
        {connected && !(open && mode === 'grid') && <FlowBar flow={flow} now={now} dayStart={dayStart} dayEnd={dayEnd} />}
        {flow.allDay.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {flow.allDay.map((e) => (
              <span
                key={e.id}
                className="flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                <span className="size-1.5 rounded-full" style={{ background: e.color ?? '#a1a1aa' }} />
                終日 {e.title}
              </span>
            ))}
          </div>
        )}
        {!connected && (
          <p className="text-xs text-zinc-400">Google カレンダーにつながっていないので、予定と空きは出せない（締切と置いたタスクだけ並べる）。</p>
        )}
        {open && mode === 'grid' && (
          <TimeGrid
            className="mt-2 max-h-[28rem] md:max-h-[36rem]"
            days={[today]}
            today={today}
            now={now}
            events={events}
            tasks={gridTasks}
            dayStart={dayStart}
            dayEnd={dayEnd}
            onPlace={placing.open}
            onSetDates={setDates}
            onOpenPlan={setOpenPlan}
            pending={placing.pending}
            focus={placing.focus}
          />
        )}
        {open && mode === 'grid' && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
            ドラッグで時間を選んでタスクや目標を置く（スマホは長押ししてから・予定の上でもよい＝ながら）。タップならその時刻から。置いたものはドラッグで動かし、下の端で長さを変える。Google に時刻つきで入る。緑の枠は目標をやる時間（押すと記録できる）。
          </p>
        )}
        {open && mode === 'list' && (
          <ol className="relative mt-2">
            {/* 1本の軸 */}
            <div className="absolute top-3 bottom-3 left-[calc(5.5rem+0.5rem+5px)] w-px bg-zinc-200 dark:bg-zinc-700" />
            {rows.map((x, i) => (
              <FlowRow key={i} x={x} now={now} today={today} onPlace={openSlot} onOpenPlan={setOpenPlan} />
            ))}
          </ol>
        )}
        {open && mode === 'list' && connected && flow.items.some((x) => x.kind === 'free' || x.kind === 'event') && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
            空きの［＋ 置く］で空きに、予定の右の［＋］で予定に重ねて（移動中・授業のすき間など＝ながら）タスクを置ける。Google に時刻つきで入る。
          </p>
        )}
      </div>
      {slot && (
        <PlacePanel
          slot={slot}
          draft={placing.draft}
          onDraft={placing.setDraft}
          now={now}
          today={today}
          candidates={candidates}
          mode={wide ? 'portal' : 'dock'}
          onClose={close}
        />
      )}
      {openPlan && <PlanSheet plan={openPlan} onClose={() => setOpenPlan(null)} />}
    </section>
  );
}

const TIME = 'w-[5.5rem] shrink-0 text-right text-xs tabular-nums text-zinc-500';
const MARK = 'relative flex w-[11px] shrink-0 justify-center';

function FlowRow({
  x,
  now,
  today,
  onPlace,
  onOpenPlan,
}: {
  x: FlowItem | { kind: 'now' };
  now: number;
  today: string;
  onPlace: (slot: Omit<Slot, 'date'>) => void;
  onOpenPlan: (plan: GoalPlan) => void;
}) {
  const openTask = useOpenTask();
  if (x.kind === 'now')
    return (
      <li className="flex items-center gap-2 py-1">
        <span className={cx(TIME, 'font-medium text-red-600 dark:text-red-400')}>いま {fmtClock(now)}</span>
        <span className={MARK}>
          <span className="size-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-900" />
        </span>
        <span className="h-px flex-1 bg-red-300 dark:bg-red-800" />
      </li>
    );
  if (x.kind === 'free')
    return (
      <li>
        <button
          type="button"
          onClick={() => onPlace({ start: x.start, end: x.end })}
          className="group flex w-full items-center gap-2 py-1 text-left"
        >
          <span className={TIME}>
            {x.start === now ? 'いま' : fmtClock(x.start)}–{fmtClock(x.end)}
          </span>
          <span className={MARK}>
            <span className="size-2.5 rounded-full border-2 border-emerald-500 bg-white dark:bg-zinc-900" />
          </span>
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">空き {fmtSpan(x.end - x.start)}</span>
          <span className="ml-auto rounded-md border border-emerald-300 px-2 py-0.5 text-[11px] text-emerald-700 group-hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:group-hover:bg-emerald-950">
            ＋ 置く
          </span>
        </button>
      </li>
    );
  if (x.kind === 'due')
    return (
      <li>
        <button type="button" onClick={() => openTask(x.task.id)} className="flex w-full items-center gap-2 py-1 text-left">
          <span className={cx(TIME, x.past ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400')}>
            {fmtClock(x.at)}
          </span>
          <span className={MARK}>
            <span className={cx('size-2 rotate-45', x.past ? 'bg-red-500' : 'bg-orange-500')} />
          </span>
          <span
            className={cx(
              'min-w-0 truncate text-sm',
              x.past ? 'text-red-700 dark:text-red-300' : 'text-orange-700 dark:text-orange-300',
            )}
          >
            <span className="text-xs font-medium">{x.past ? '締切を過ぎた' : '締切'}</span> {x.task.title}
          </span>
        </button>
      </li>
    );
  if (x.kind === 'plan') return <PlanRow x={x} today={today} onOpenPlan={onOpenPlan} />;
  return (
    <li className={cx('flex items-center gap-2 py-1', x.now && '-mx-2 rounded-md bg-indigo-50 px-2 dark:bg-indigo-950/50')}>
      <span className={TIME}>
        {fmtClock(x.start)}
        {x.end > x.start && `–${fmtClock(x.end)}`}
      </span>
      <span className={MARK}>
        <span
          className="size-2.5 rounded-full ring-2 ring-white dark:ring-zinc-900"
          style={{ background: x.event.color ?? '#a1a1aa' }}
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        {x.now && <span className="mr-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">いま</span>}
        {x.event.title}
        {/* メインのカレンダーは名前がメールアドレスなので出さない */}
        {!x.event.calendar.includes('@') && <span className="ml-1.5 text-[11px] text-zinc-400">{x.event.calendar}</span>}
      </span>
      {/* 予定に重ねて置く（移動中・授業のすき間など）。最中の予定は、いまから */}
      {x.end > x.start && (
        <button
          type="button"
          onClick={() => onPlace({ start: Math.max(x.start, now), end: x.end, host: x.event.title })}
          aria-label="この予定に重ねてタスクを置く（ながら）"
          className="shrink-0 rounded-md border border-dashed border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          ＋<span className="hidden md:inline"> ながら</span>
        </button>
      )}
    </li>
  );
}

/**
 * 置いたタスク: 押すと詳細、「外す」で時刻だけ消す（今日のやる日は残る）。
 * 目標をやる時間（緑）: 押すと記録のシート、「外す」で予定ごと外す
 */
function PlanRow({ x, today, onOpenPlan }: { x: Extract<FlowItem, { kind: 'plan' }>; today: string; onOpenPlan: (plan: GoalPlan) => void }) {
  const openTask = useOpenTask();
  const goal = planOf(x.task);
  const unplace = useWrite(() =>
    api.setDates(
      x.task.id,
      x.task.doDates.map((d) => (d.date === today ? { ...d, start: null } : d)),
    ),
  );
  const removePlan = useGoalWrite((id: number) => api.deleteGoalPlan(id));
  const tone = goal ? 'text-emerald-700 dark:text-emerald-300' : 'text-indigo-700 dark:text-indigo-300';
  return (
    <li
      className={cx(
        'flex items-center gap-2 py-1',
        x.now && (goal ? '-mx-2 rounded-md bg-emerald-50 px-2 dark:bg-emerald-950/50' : '-mx-2 rounded-md bg-indigo-50 px-2 dark:bg-indigo-950/50'),
      )}
    >
      <button
        type="button"
        onClick={() => (goal ? onOpenPlan(goal) : openTask(x.task.id))}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className={cx(TIME, goal ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-600 dark:text-indigo-400')}>
          {fmtClock(x.start)}–{fmtClock(x.end)}
        </span>
        <span className={MARK}>
          <span
            className={cx(
              'rounded-sm ring-2 ring-white dark:ring-zinc-900',
              x.over
                ? cx('size-2 border-2 bg-white dark:bg-zinc-900', goal ? 'border-emerald-500' : 'border-indigo-500')
                : cx('size-2.5', goal ? 'bg-emerald-500' : 'bg-indigo-500'),
            )}
          />
        </span>
        <span
          className={cx(
            'min-w-0 truncate text-sm font-medium',
            tone,
            x.over && 'border-l-2 border-indigo-200 pl-2 dark:border-indigo-800',
          )}
        >
          {x.over && <span className="mr-1.5 text-[11px] font-normal opacity-80">ながら</span>}
          {x.now && <span className="mr-1.5 text-xs">いま</span>}
          {x.task.title}
        </span>
      </button>
      <button
        type="button"
        onClick={() =>
          goal
            ? removePlan.mutate(goal.id, { onSuccess: () => toast(`${goal.title} のやる時間を外した`) })
            : unplace.mutate(undefined, { onSuccess: () => toast(`${x.task.code} の時刻を外した（今日やるのは残る）`) })
        }
        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-600"
      >
        外す
      </button>
    </li>
  );
}

/**
 * 1日の帯: 起きている時間（と、はみ出す予定）を横1本に。緑＝空き、色＝予定、縦線＝締切（橙）といま（赤）、薄い部分＝過ぎた時間。
 * 置いたタスクは帯のすぐ下の細い段に藍で（予定に重ねたものも隠れない）
 */
function FlowBar({ flow, now, dayStart, dayEnd }: { flow: DayFlow; now: number; dayStart: number; dayEnd: number }) {
  const lo = Math.floor(Math.min(dayStart, ...flow.timed.map((x) => x.start)) / 60) * 60;
  const hi = Math.ceil(Math.max(dayEnd, ...flow.timed.map((x) => x.end)) / 60) * 60;
  const pos = (m: number) => ((Math.min(Math.max(m, lo), hi) - lo) / (hi - lo)) * 100;
  const span = (a: number, b: number) => ({ left: `${pos(a)}%`, width: `${pos(b) - pos(a)}%` });
  const hours: number[] = [];
  for (let h = Math.ceil(lo / 180) * 3; h * 60 <= hi; h += 3) if (pos(h * 60) > 3 && pos(h * 60) < 97) hours.push(h);
  return (
    <div className="relative h-9">
      <div className="absolute inset-x-0 top-1 h-3.5 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
        <div className="absolute inset-y-0 bg-emerald-200/80 dark:bg-emerald-900/70" style={span(dayStart, dayEnd)} />
        {flow.timed.map((x) => (
          <div
            key={x.event.id + x.start}
            className="absolute inset-y-0"
            style={{ ...span(x.start, x.end), background: x.event.color ?? '#a1a1aa' }}
          />
        ))}
        <div className="absolute inset-y-0 left-0 bg-white/60 dark:bg-zinc-900/60" style={{ width: `${pos(now)}%` }} />
      </div>
      {flow.items.map(
        (x) =>
          x.kind === 'plan' && (
            <div
              key={`p${x.task.id}`}
              className="absolute top-[1.2rem] h-1.5 rounded-full bg-indigo-500"
              style={span(x.start, x.end)}
            />
          ),
      )}
      {flow.items.map(
        (x) =>
          x.kind === 'due' && (
            <div
              key={`d${x.task.id}`}
              className={cx('absolute top-0 h-5.5 w-0.5 -translate-x-1/2', x.past ? 'bg-red-500' : 'bg-orange-500')}
              style={{ left: `${pos(x.at)}%` }}
            />
          ),
      )}
      {now > lo && now < hi && (
        <div className="absolute top-0 h-5.5 w-0.5 -translate-x-1/2 bg-red-600" style={{ left: `${pos(now)}%` }} />
      )}
      {hours.map((h) => (
        <span
          key={h}
          className="absolute top-[1.45rem] -translate-x-1/2 text-[10px] text-zinc-400 tabular-nums"
          style={{ left: `${pos(h * 60)}%` }}
        >
          {h}
        </span>
      ))}
    </div>
  );
}
