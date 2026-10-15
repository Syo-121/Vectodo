// 一覧・ボードの絞り込み（design 7-10）。ボタンで条件の欄を開き、効いている条件はチップで見せて1つずつ外せる。

import { useState } from 'react';
import { STATUS_LABEL, type Status } from '../../shared/constants.ts';
import type { Category } from '../../shared/types.ts';
import {
  activeChips,
  countActive,
  DO_OPTIONS,
  DUE_OPTIONS,
  EMPTY_FILTER,
  PRIORITY_OPTIONS,
  toggle,
  type TaskFilter,
} from '../filter.ts';
import { cx } from '../util.ts';

interface Props {
  filter: TaskFilter;
  onChange: (f: TaskFilter) => void;
  /** 選べるカテゴリ（アーカイブ済みは呼び出し側で除く） */
  categories: Category[];
  /** 選べる状態（一覧で「完了も」が切れているときは未完了の3つだけ） */
  statuses: readonly Status[];
  /** 絞り込み後／前の件数 */
  shown: number;
  total: number;
}

const chip = (on: boolean) =>
  cx(
    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs',
    on
      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
      : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300',
  );

export function FilterBar({ filter: f, onChange, categories, statuses, shown, total }: Props) {
  const [open, setOpen] = useState(false);
  const n = countActive(f);
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const chips = activeChips(f, catMap);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={cx(
            'rounded-md border px-2.5 py-1.5 text-xs',
            n ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300' : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300',
          )}
        >
          絞り込み{n ? `（${n}）` : ''} {open ? '▴' : '▾'}
        </button>
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.remove(f))}
            className="flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-xs text-white"
            aria-label={`${c.label} を外す`}
          >
            {c.label}
            <span className="opacity-70">✕</span>
          </button>
        ))}
        {n > 0 && (
          <>
            <span className="text-xs text-zinc-400">
              {shown}/{total} 件
            </span>
            <button type="button" onClick={() => onChange(EMPTY_FILTER)} className="text-xs text-zinc-500 underline">
              全部外す
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="mt-2.5 space-y-3.5 rounded-xl border border-zinc-200/80 bg-white p-3.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <Group label="カテゴリ（複数可）">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={chip(f.categories.includes(c.id))}
                onClick={() => onChange({ ...f, categories: toggle(f.categories, c.id) })}
              >
                <span className="size-2 rounded-full" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
            <button
              type="button"
              className={chip(f.categories.includes(0))}
              onClick={() => onChange({ ...f, categories: toggle(f.categories, 0) })}
            >
              カテゴリなし
            </button>
          </Group>
          <Group label="締切">
            {DUE_OPTIONS.map(([v, label]) => (
              <button
                key={v}
                type="button"
                className={chip(f.due === v)}
                onClick={() => onChange({ ...f, due: f.due === v ? 'any' : v })}
              >
                {label}
              </button>
            ))}
          </Group>
          <Group label="やる日">
            {DO_OPTIONS.map(([v, label]) => (
              <button
                key={v}
                type="button"
                className={chip(f.doDate === v)}
                onClick={() => onChange({ ...f, doDate: f.doDate === v ? 'any' : v })}
              >
                {label}
              </button>
            ))}
          </Group>
          <Group label="優先度（複数可）">
            {PRIORITY_OPTIONS.map(([v, label]) => (
              <button
                key={v}
                type="button"
                className={chip(f.priorities.includes(v))}
                onClick={() => onChange({ ...f, priorities: toggle(f.priorities, v) })}
              >
                {label}
              </button>
            ))}
          </Group>
          <Group label="状態（複数可）">
            {statuses.map((s) => (
              <button
                key={s}
                type="button"
                className={chip(f.statuses.includes(s))}
                onClick={() => onChange({ ...f, statuses: toggle(f.statuses, s) })}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </Group>
          <div className="flex justify-end">
            <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-xs text-zinc-500">
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
