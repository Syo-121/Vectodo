// 週（design 7-8）。Google カレンダーの週の表示のような時間割（BoardTimeGrid）。列の見出しに日ごとの合計時間と詰め込みすぎ。
// 上の「終日」の段に時刻の無いやる日（別の日へ落とすと移る）・締切・終日の予定、下の時間の欄に予定と置いたタスク。

import { useState } from 'react';
import type { Category, Task } from '../../shared/types.ts';
import { useOverlay } from '../api.ts';
import { addDays, cx, fmtMin } from '../util.ts';
import { BoardTimeGrid } from './BoardTimeGrid.tsx';
import { weekDays } from './logic.ts';

const WEEK = ['', '月', '火', '水', '木', '金', '土', '日'];

/** 10/13(火) */
function md(date: string): string {
  const w = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}(${WEEK[w === 0 ? 7 : w]})`;
}

export function WeekView({
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
  /** Google の予定を重ねる（v3） */
  overlay: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const start = addDays(today, offset * 7);
  const days = weekDays(tasks, start);
  const load = new Map(days.map((d) => [d.date, d.loadMin]));
  const total = days.reduce((s, d) => s + d.loadMin, 0);
  const { data: ov } = useOverlay(start, addDays(start, 6), overlay);

  const head = (date: string) => {
    const m = load.get(date) ?? 0;
    const ratio = m / capacityMin;
    const isToday = date === today;
    return (
      <div>
        <div className="flex items-baseline gap-1">
          <span className={cx('truncate text-xs font-semibold', isToday && 'text-indigo-600 dark:text-indigo-400')}>{md(date)}</span>
          <span
            className={cx(
              'ml-auto shrink-0 text-[10px]',
              ratio > 1 ? 'font-semibold text-red-600 dark:text-red-400' : ratio > 0.8 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400',
            )}
          >
            {m > 0 ? fmtMin(m) : ''}
          </span>
        </div>
        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className={cx('h-full rounded-full', ratio > 1 ? 'bg-red-500' : ratio > 0.8 ? 'bg-amber-500' : 'bg-emerald-500')}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
      </div>
    );
  };

  const nav = 'rounded-md border border-zinc-300 px-2.5 py-1 text-xs dark:border-zinc-700';
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <button type="button" className={nav} onClick={() => setOffset(offset - 1)}>
          ◀ 前の週
        </button>
        <button type="button" className={cx(nav, offset === 0 && 'opacity-40')} onClick={() => setOffset(0)} disabled={offset === 0}>
          今日から
        </button>
        <button type="button" className={nav} onClick={() => setOffset(offset + 1)}>
          次の週 ▶
        </button>
        <span className="text-xs text-zinc-500">
          {md(start)} 〜 {md(addDays(start, 6))}・合計 {total > 0 ? fmtMin(total) : '0'}
        </span>
      </div>
      <p className="px-4 pb-2 text-[11px] text-zinc-400">
        日ごとの時間＝配分時間（無ければ見積をやる日の数で割った値）。容量 {fmtMin(capacityMin)}/日（設定で変更）を8割超えると黄、超えると赤。
      </p>
      <BoardTimeGrid
        days={days.map((d) => d.date)}
        today={today}
        tasks={tasks}
        pool={pool}
        categories={categories}
        events={overlay ? (ov?.events ?? []) : []}
        head={head}
        onSetDates={onSetDates}
      />
    </div>
  );
}
