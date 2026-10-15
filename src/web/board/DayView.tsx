// 日（design 7-8）。好きな日の時間割（BoardTimeGrid・今日の流れと同じ操作）。前後の日へ移れて、日付を選んで飛べる。
// 上にその日の空き（起きている時間のうち予定の無い時間）と、やる時間の合計・1日の容量。

import { useState } from 'react';
import { dayFlow } from '../../shared/flow.ts';
import type { Category, Task } from '../../shared/types.ts';
import { useOverlay, useSettings } from '../api.ts';
import { DatePicker } from '../components/DatePicker.tsx';
import { useNow } from '../components/TodayFlow.tsx';
import { addDays, cx, fmtDateLong, fmtMin, fmtSpan } from '../util.ts';
import { BoardTimeGrid } from './BoardTimeGrid.tsx';
import { weekDays } from './logic.ts';

export function DayView({
  tasks,
  pool,
  today,
  capacityMin,
  categories,
  onSetDates,
  overlay,
}: {
  tasks: Task[];
  pool: Task[];
  today: string;
  capacityMin: number;
  categories: Map<number, Category>;
  onSetDates: (task: Task, dates: Task['doDates']) => Promise<unknown>;
  overlay: boolean;
}) {
  const [date, setDate] = useState(today);
  const now = useNow();
  const { data: settings } = useSettings();
  const { data: ov } = useOverlay(date, date, overlay);
  const events = overlay ? (ov?.events ?? []) : [];
  const load = weekDays(tasks, date, 1)[0]!.loadMin;
  // 空き: 今日はいまから・先の日は起きる時刻から・過ぎた日は出さない
  const free =
    date < today || !overlay
      ? null
      : dayFlow({
          today: date,
          events,
          deadlines: [],
          now: date === today ? now : 0,
          dayStart: settings?.dayStartMin ?? 8 * 60,
          dayEnd: settings?.dayEndMin ?? 23 * 60,
        }).freeMin;
  const ratio = load / capacityMin;

  const nav = 'rounded-md border border-zinc-300 px-2.5 py-1 text-xs dark:border-zinc-700';
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <button type="button" className={nav} onClick={() => setDate(addDays(date, -1))}>
          ◀ 前の日
        </button>
        <button type="button" className={cx(nav, date === today && 'opacity-40')} onClick={() => setDate(today)} disabled={date === today}>
          今日
        </button>
        <button type="button" className={nav} onClick={() => setDate(addDays(date, 1))}>
          次の日 ▶
        </button>
        <DatePicker
          value={date}
          onChange={(d) => d && setDate(d)}
          trigger={() => (
            <button type="button" className={cx(nav, 'font-medium')}>
              📅 {fmtDateLong(date, today)}
            </button>
          )}
        />
        <span className="text-xs text-zinc-500">
          {free !== null && `${date === today ? 'このあと' : ''}空き ${fmtSpan(free)}・`}
          やる{' '}
          <span
            className={cx(
              ratio > 1 ? 'font-semibold text-red-600 dark:text-red-400' : ratio > 0.8 ? 'text-amber-600 dark:text-amber-400' : '',
            )}
          >
            {load > 0 ? fmtMin(load) : '0'}
          </span>
          ／容量 {fmtMin(capacityMin)}
        </span>
      </div>
      <BoardTimeGrid
        days={[date]}
        today={today}
        tasks={tasks}
        pool={pool}
        categories={categories}
        events={events}
        onSetDates={onSetDates}
      />
    </div>
  );
}
