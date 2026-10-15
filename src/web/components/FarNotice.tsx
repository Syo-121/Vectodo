// 「先の分を隠している」の1行（design 4-9）。何も言わずに消さず、押せば全部出す。

import type { FarGroup } from '../horizon.ts';
import { fmtMonthDay } from '../util.ts';

export function FarNotice({
  far,
  shown,
  onToggle,
  today,
}: {
  far: FarGroup[];
  shown: boolean;
  onToggle: (shown: boolean) => void;
  today: string;
}) {
  if (far.length === 0) return null;
  const parts = far.map((g) => `${g.category.name} ${g.count} 件（〜${fmtMonthDay(g.last, today)}）`).join('・');
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1 text-xs text-zinc-500">
      <span>{shown ? `先の分も出している: ${parts}` : `先の分を隠している: ${parts}`}</span>
      <button type="button" onClick={() => onToggle(!shown)} className="text-indigo-600 dark:text-indigo-400">
        {shown ? '隠す' : '出す'}
      </button>
    </p>
  );
}
