// 即追加のシート（QuickAdd・FullTaskForm）で共通に使う小さな部品。

import { cx } from '../util.ts';

/** 押すだけのチップ（選ばれているときは色が付く） */
export function chip(active: boolean) {
  return cx(
    'rounded-full border px-3 py-1 text-sm transition',
    active
      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
      : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300',
  );
}

/** 右寄せの「閉じる」「保存」 */
export function Buttons({
  onClose,
  onSubmit,
  disabled,
  label,
}: {
  onClose: () => void;
  onSubmit: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <div className="ml-auto flex gap-2">
      <button type="button" onClick={onClose} className="px-2 py-1 text-sm text-zinc-500">
        閉じる
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {label}
      </button>
    </div>
  );
}
