// 月（v3・design 7-11）。月曜はじまりの表でタスクを日付で眺め、選んだ日の中身を下に並べる。
// やる日のカードは別の日へドラッグで移せる（PC は表の中のカードも、スマホは下の一覧から長押しで表の日へ）。
// Google の予定は薄い色で重ねる（タスクの予定は除いてある）。
// 目標をやる時間（design 4-14）は緑で出し、選んだ日の下の［＋ 目標をやる時間を入れる］から入れる（押すと記録のシート）。

import { useState } from 'react';
import { fmtAmount } from '../../shared/goals.ts';
import type { Category, GoalPlan, OverlayEvent, Task } from '../../shared/types.ts';
import { useGoalPlans, useOverlay } from '../api.ts';
import { PlanCreateSheet, PlanSheet } from '../components/GoalSheets.tsx';
import { TaskCard } from '../components/TaskRow.tsx';
import { useWideScreen } from '../media.ts';
import { useOpenTask } from '../nav.ts';
import { cx, fmtMin } from '../util.ts';
import { BoardDnd, Draggable, Droppable } from './dnd.tsx';
import { monthGrid, overlayByDay, weekDays, type Day } from './logic.ts';
import { OverlayLine } from './Overlay.tsx';

const WEEK = ['月', '火', '水', '木', '金', '土', '日'];

function md(date: string): string {
  const w = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}(${WEEK[(w + 6) % 7]})`;
}

export function MonthView({
  tasks,
  today,
  categories,
  onMoveDate,
  overlay,
}: {
  tasks: Task[];
  today: string;
  categories: Map<number, Category>;
  onMoveDate: (task: Task, from: string, to: string) => void;
  overlay: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(today);
  const wide = useWideScreen();
  const grid = monthGrid(today, offset);
  const from = grid.dates[0]!;
  const to = grid.dates.at(-1)!;
  const days = new Map(weekDays(tasks, from, grid.dates.length).map((d) => [d.date, d]));
  const { data: ov, isFetching } = useOverlay(from, to, overlay);
  const events = overlayByDay(overlay ? (ov?.events ?? []) : [], grid.dates);
  // 目標をやる時間（日ごと）
  const { data: plans = [] } = useGoalPlans(from, to);
  const plansOn = (date: string) => plans.filter((p) => p.date === date);
  const [openPlan, setOpenPlan] = useState<GoalPlan | null>(null);
  const [adding, setAdding] = useState(false);

  const onDrop = (dragId: string, dropId: string) => {
    const [, idStr, fromDate] = dragId.split(':') as [string, string, string];
    const toDate = dropId.replace('day:', '');
    const task = tasks.find((t) => t.id === Number(idStr));
    if (task && fromDate !== toDate) {
      onMoveDate(task, fromDate, toDate);
      setSelected(toDate);
    }
  };
  const go = (n: number) => {
    setOffset(n);
    const g = monthGrid(today, n);
    setSelected(n === 0 ? today : g.first);
  };

  const [y, m] = grid.month.split('-').map(Number);
  const nav = 'rounded-md border border-zinc-300 px-2.5 py-1 text-xs dark:border-zinc-700';
  const sel = days.get(selected);
  const selEvents = events.get(selected) ?? [];

  return (
    <BoardDnd onDrop={onDrop}>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <button type="button" className={nav} onClick={() => go(offset - 1)}>
          ◀
        </button>
        <span className="min-w-24 text-center text-sm font-semibold">
          {y}年{m}月
        </span>
        <button type="button" className={nav} onClick={() => go(offset + 1)}>
          ▶
        </button>
        <button type="button" className={cx(nav, offset === 0 && 'opacity-40')} onClick={() => go(0)} disabled={offset === 0}>
          今月
        </button>
        {overlay && isFetching && <span className="text-[11px] text-zinc-400">予定を読み込み中…</span>}
      </div>

      <div className="px-4">
        <div className="grid grid-cols-7 text-center text-[11px] text-zinc-500">
          {WEEK.map((w, i) => (
            <div key={w} className={cx('pb-1', i === 5 && 'text-sky-600', i === 6 && 'text-red-500')}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 gap-px dark:border-zinc-800 dark:bg-zinc-800">
          {grid.dates.map((date) => (
            <DayCell
              key={date}
              date={date}
              day={days.get(date)}
              events={events.get(date) ?? []}
              inMonth={date.startsWith(grid.month)}
              isToday={date === today}
              isSelected={date === selected}
              wide={wide}
              categories={categories}
              plans={plansOn(date)}
              onSelect={() => setSelected(date)}
              onOpenPlan={setOpenPlan}
            />
          ))}
        </div>
      </div>

      {/* 選んだ日の中身。スマホは表のマスが小さいので、ここから長押しで別の日へ移す */}
      <section className="mt-5 px-4 pb-4">
        <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
          {md(selected)}
          {selected === today && <span className="text-[11px] font-normal text-indigo-600 dark:text-indigo-400">今日</span>}
          {sel && sel.loadMin > 0 && <span className="ml-auto text-xs font-normal text-zinc-500">{fmtMin(sel.loadMin)}</span>}
        </h3>
        {selEvents.length > 0 && (
          <div className="mb-3 flex flex-col gap-1">
            {selEvents.map((e) => (
              <OverlayLine key={e.id} e={e} />
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {sel?.items.map((item) =>
            item.kind === 'do' ? (
              <Draggable key={`do:${item.task.id}`} id={`do:${item.task.id}:${selected}`}>
                <TaskCard task={item.task} today={today} categories={categories} hideDoDates showParent={false} />
              </Draggable>
            ) : (
              <TaskCard
                key={`due:${item.task.id}`}
                task={item.task}
                today={today}
                categories={categories}
                badge={<span className="mr-1 text-[11px] text-red-600 dark:text-red-400">締切</span>}
              />
            ),
          )}
        </div>
        {plansOn(selected).length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {plansOn(selected).map((p) => (
              <PlanCard key={p.id} plan={p} onOpen={() => setOpenPlan(p)} />
            ))}
          </div>
        )}
        {!sel?.items.length && selEvents.length === 0 && plansOn(selected).length === 0 && (
          <p className="py-3 text-center text-xs text-zinc-400">この日は何もない</p>
        )}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 w-full rounded-xl border border-dashed border-emerald-400 py-2.5 text-sm text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
        >
          🎯 {md(selected)} に目標をやる時間を入れる
        </button>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
          やる日のカードは、PC はドラッグ、スマホは長押しで表の別の日へ移せる。締切は詳細から変える。灰色の行は Google カレンダーの予定、緑は目標をやる時間（押すと記録・時間を変える・外す）。
        </p>
      </section>
      {openPlan && <PlanSheet plan={openPlan} onClose={() => setOpenPlan(null)} />}
      {adding && <PlanCreateSheet date={selected} onClose={() => setAdding(false)} />}
    </BoardDnd>
  );
}

/** 選んだ日の下に並べる「目標をやる時間」（押すと記録のシート） */
function PlanCard({ plan, onOpen }: { plan: GoalPlan; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm',
        plan.done
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
          : 'border-emerald-300 bg-white dark:border-emerald-800 dark:bg-zinc-900',
      )}
      style={{ borderLeft: '4px solid #10b981' }}
    >
      <span className="w-12 shrink-0 text-xs text-zinc-500 tabular-nums">{plan.start ?? '終日'}</span>
      <span className="min-w-0 flex-1 truncate font-medium">
        🎯 {plan.title}
        {plan.amount !== null && <span className="ml-1 font-normal text-zinc-500">{fmtAmount(plan.amount, plan.unit)}</span>}
      </span>
      {plan.done && <span className="shrink-0 text-xs font-medium">✓ 済</span>}
    </button>
  );
}

function DayCell({
  date,
  day,
  events,
  inMonth,
  isToday,
  isSelected,
  wide,
  categories,
  plans,
  onSelect,
  onOpenPlan,
}: {
  date: string;
  day: Day | undefined;
  events: OverlayEvent[];
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  wide: boolean;
  categories: Map<number, Category>;
  /** 目標をやる時間（緑） */
  plans: GoalPlan[];
  onSelect: () => void;
  onOpenPlan: (plan: GoalPlan) => void;
}) {
  const items = day?.items ?? [];
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  // タスク・目標をやる時間を先に出し、残りの枠に予定（多い日はタスクが「ほか N 件」に埋もれないように）
  const limit = 4;
  const shown = wide ? [...items.map((i) => ({ i })), ...plans.map((p) => ({ p })), ...events.map((e) => ({ e }))].slice(0, limit) : [];
  const more = events.length + items.length + plans.length - shown.length;

  return (
    <Droppable
      id={`day:${date}`}
      className={cx(
        'min-h-16 bg-white p-1 dark:bg-zinc-900 lg:min-h-28',
        !inMonth && 'bg-zinc-50 dark:bg-zinc-950',
        isSelected && 'ring-2 ring-inset ring-indigo-400',
      )}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <span
          className={cx(
            'inline-flex size-6 items-center justify-center rounded-full text-xs',
            isToday ? 'bg-indigo-600 font-semibold text-white' : !inMonth ? 'text-zinc-300 dark:text-zinc-600' : weekday === 5 ? 'text-sky-600' : weekday === 6 ? 'text-red-500' : 'text-zinc-700 dark:text-zinc-300',
          )}
        >
          {Number(date.slice(8))}
        </span>
        {!wide && (
          // スマホ: 文字は入らないので、予定（灰）・やる日（藍）・締切（赤）・目標をやる時間（緑）を点で
          <span className="mt-0.5 flex flex-wrap gap-0.5 px-0.5">
            {events.slice(0, 3).map((e) => (
              <span key={e.id} className="size-1.5 rounded-full" style={{ background: e.color ?? '#a1a1aa', opacity: 0.6 }} />
            ))}
            {items.slice(0, 4).map((it) => (
              <span
                key={`${it.kind}:${it.task.id}`}
                className={cx('size-1.5 rounded-full', it.kind === 'due' ? 'bg-red-500' : 'bg-indigo-500')}
              />
            ))}
            {plans.slice(0, 3).map((p) => (
              <span key={`g${p.id}`} className={cx('size-1.5 rounded-full', p.done ? 'bg-emerald-300' : 'bg-emerald-500')} />
            ))}
          </span>
        )}
      </button>
      {wide && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {shown.map((x) =>
            'p' in x ? (
              <button
                key={`g${x.p.id}`}
                type="button"
                onClick={() => onOpenPlan(x.p)}
                className={cx(
                  'block w-full truncate rounded px-1 text-left text-[10px] leading-4',
                  x.p.done
                    ? 'bg-emerald-50 text-emerald-600 opacity-70 dark:bg-emerald-950/50 dark:text-emerald-400'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100',
                )}
                title={x.p.title}
              >
                {x.p.done ? '✓ ' : '🎯 '}
                {x.p.start && <span className="mr-1 tabular-nums">{x.p.start}</span>}
                {x.p.title}
              </button>
            ) : 'e' in x ? (
              <div key={x.e.id} className="truncate rounded px-1 text-[10px] leading-4 text-zinc-500" title={`${x.e.calendar}: ${x.e.title}`}>
                <span className="mr-1 inline-block size-1.5 rounded-full align-middle" style={{ background: x.e.color ?? '#a1a1aa' }} />
                {x.e.start && <span className="mr-1 tabular-nums">{x.e.start}</span>}
                {x.e.title}
              </div>
            ) : x.i.kind === 'do' ? (
              <Draggable key={`do:${x.i.task.id}`} id={`do:${x.i.task.id}:${date}`}>
                <MiniChip task={x.i.task} kind="do" categories={categories} />
              </Draggable>
            ) : (
              <MiniChip key={`due:${x.i.task.id}`} task={x.i.task} kind="due" categories={categories} />
            ),
          )}
          {more > 0 && (
            <button type="button" onClick={onSelect} className="px-1 text-left text-[10px] text-zinc-400">
              ほか {more} 件
            </button>
          )}
        </div>
      )}
    </Droppable>
  );
}

/** PC の月の表に入れる小さいタスク札（押すと詳細） */
function MiniChip({
  task,
  kind,
  categories,
}: {
  task: Task;
  kind: 'do' | 'due';
  categories: Map<number, Category>;
}) {
  const cat = task.categoryId !== null ? categories.get(task.categoryId) : undefined;
  const openTask = useOpenTask();
  return (
    <button
      type="button"
      onClick={() => openTask(task.id)}
      className={cx(
        'block w-full truncate rounded px-1 text-left text-[10px] leading-4',
        kind === 'due'
          ? 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300'
          : 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200',
        (task.status === 'done' || task.status === 'canceled') && 'line-through opacity-60',
      )}
      title={task.title}
    >
      {cat && <span className="mr-1 inline-block size-1.5 rounded-full align-middle" style={{ background: cat.color }} />}
      {kind === 'due' && (task.dueTime ? `${task.dueTime} ` : '締切 ')}
      {task.title}
    </button>
  );
}
