// 重ねて見せる Google の予定の1行（v3・design 7-11）。タスクと見分けがつくよう、薄い色・小さい字で出す。

import type { OverlayEvent } from '../../shared/types.ts';

export function OverlayLine({ e }: { e: OverlayEvent }) {
  return (
    <div
      className="flex items-start gap-1.5 rounded-md bg-white/70 px-2 py-1 text-[11px] leading-snug text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400"
      title={`${e.calendar}: ${e.title}`}
    >
      <span className="mt-1 size-1.5 shrink-0 rounded-full" style={{ background: e.color ?? '#a1a1aa' }} />
      <span className="shrink-0 tabular-nums">{e.start ?? '終日'}</span>
      <span className="min-w-0 truncate">{e.title}</span>
    </div>
  );
}
