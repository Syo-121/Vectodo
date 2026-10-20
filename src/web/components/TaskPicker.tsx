// タスクを検索して1つ選ぶ（依存・親の指定で使う）。

import { useEffect, useState } from 'react';
import type { Task } from '../../shared/types.ts';
import { useAllTasks } from '../api.ts';

export function TaskPicker({
  exclude,
  placeholder,
  onPick,
  onCancel,
}: {
  exclude: Set<number>;
  placeholder: string;
  /** 選んだタスク自体も渡す（まだ無いタスクの入力欄で、選んだものの名前を出すため） */
  onPick: (id: number, task: Task) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(h);
  }, [q]);
  const { data = [] } = useAllTasks({ q: debounced || undefined });
  const hits = data.filter((t) => !exclude.has(t.id)).slice(0, 8);

  return (
    <div className="rounded-lg border border-zinc-300 p-2 dark:border-zinc-700">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        placeholder={placeholder}
        className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
      />
      <ul className="scroll-hidden mt-1 max-h-56 overflow-y-auto">
        {hits.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onPick(t.id, t)}
              className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <span className="mr-2 text-xs text-zinc-400">{t.code}</span>
              {t.title}
              {t.parentTitle && <span className="ml-2 text-xs text-zinc-400">↳ {t.parentTitle}</span>}
            </button>
          </li>
        ))}
        {hits.length === 0 && <li className="px-2 py-1.5 text-sm text-zinc-400">該当なし</li>}
      </ul>
      <button type="button" onClick={onCancel} className="mt-1 text-xs text-zinc-500">
        やめる
      </button>
    </div>
  );
}
