// 月（v3・design 7-11）。月曜はじまりの表でタスクを日付で眺め、選んだ日の中身を下に並べる。
// やる日のカードは別の日へドラッグで移せる（PC は表の中のカードも、スマホは下の一覧から長押しで表の日へ）。
// Google の予定は薄い色で重ねる（タスクの予定は除いてある）。

import { useState } from 'react';
import type { Category, OverlayEvent, Task } from '../../shared/types.ts';
import { useOverlay } from '../api.ts';
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
              onSelect={() => setSelected(date)}
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
        {!sel?.items.length && selEvents.length === 0 && <p className="py-3 text-center text-xs text-zinc-400">この日は何もない</p>}
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
          やる日のカードは、PC はドラッグ、スマホは長押しで表の別の日へ移せる。締切は詳細から変える。灰色の行は Google カレンダーの予定。
        </p>
      </section>
    </BoardDnd>
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
  onSelect,
}: {
  date: string;
  day: Day | undefined;
  events: OverlayEvent[];
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  wide: boolean;
  categories: Map<number, Category>;
  onSelect: () => void;
}) {
  const items = day?.items ?? [];
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  // タスクを先に出し、残りの枠に予定（多い日はタスクが「ほか N 件」に埋もれないように）
  const limit = 4;
  const shown = wide ? [...items.map((i) => ({ i })), ...events.map((e) => ({ e }))].slice(0, limit) : [];
  const more = events.length + items.length - shown.length;

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
          // スマホ: 文字は入らないので、予定（灰）・やる日（藍）・締切（赤）を点で
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
          </span>
        )}
      </button>
      {wide && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {shown.map((x) =>
            'e' in x ? (
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
