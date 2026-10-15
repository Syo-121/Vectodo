// 行の右側に置く「今日／明日／日付／分類」の小さいボタン（未整理・計画待ちで使う）。

import type { Category, Task } from '../../shared/types.ts';
import { api, useWrite } from '../api.ts';
import { addDays } from '../util.ts';
import { DatePicker } from './DatePicker.tsx';

const btn = 'rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300';

export function QuickActions({
  task,
  today,
  categories,
  pickDate,
}: {
  task: Task;
  today: string;
  /** 渡すと「分類」の選択肢を出す */
  categories?: Category[];
  /** 「日付」ボタンで任意の日を選べるようにする */
  pickDate?: boolean;
}) {
  const setDate = useWrite((date: string) => api.setDates(task.id, [...task.doDates, { date }]));
  const setCat = useWrite((categoryId: number) => api.update(task.id, { categoryId }));
  return (
    <>
      <button type="button" className={btn} onClick={() => setDate.mutate(today)}>
        今日
      </button>
      <button type="button" className={btn} onClick={() => setDate.mutate(addDays(today, 1))}>
        明日
      </button>
      {pickDate && (
        <DatePicker
          value={null}
          onChange={(d) => d && setDate.mutate(d)}
          marks={task.dueDate ? [task.dueDate] : []}
          alignRight
          trigger={() => (
            <button type="button" className={btn}>
              日付
            </button>
          )}
        />
      )}
      {categories && categories.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && setCat.mutate(Number(e.target.value))}
          className={`${btn} max-w-20 bg-transparent`}
          aria-label="カテゴリ"
        >
          <option value="">分類</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </>
  );
}
