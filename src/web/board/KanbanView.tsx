// カンバン（design 7-8）。列の分け方を切り替え、カードを別の列へ落とすとその項目が変わる。

import type { TaskPatchInput } from '../../shared/schemas.ts';
import type { Category, Task } from '../../shared/types.ts';
import { TaskCard } from '../components/TaskRow.tsx';
import { cx, fmtMin } from '../util.ts';
import { BoardDnd, Draggable, Droppable } from './dnd.tsx';
import { columnPatch, kanbanColumns, type Axis } from './logic.ts';

export const AXES: [Axis, string][] = [
  ['status', '状態'],
  ['urgency', '緊急度'],
  ['priority', '優先度'],
  ['category', 'カテゴリ'],
];

export function KanbanView({
  tasks,
  axis,
  today,
  cats,
  categories,
  onPatch,
  hideNoCategory = false,
}: {
  tasks: Task[];
  axis: Axis;
  today: string;
  cats: Category[];
  categories: Map<number, Category>;
  onPatch: (id: number, patch: TaskPatchInput) => void;
  /** カテゴリで絞っているとき、カテゴリ軸の「カテゴリなし」列を出さない */
  hideNoCategory?: boolean;
}) {
  const columns = kanbanColumns(tasks, axis, today, cats).filter(
    (c) => !(hideNoCategory && axis === 'category' && c.key === 'none'),
  );
  const onDrop = (dragId: string, dropId: string) => {
    const id = Number(dragId.replace('task:', ''));
    const key = dropId.replace('col:', '');
    const task = tasks.find((t) => t.id === id);
    const patch = columnPatch(axis, key);
    if (!task || !patch) return;
    const [field, value] = Object.entries(patch)[0]!;
    if ((task as unknown as Record<string, unknown>)[field] === value) return;
    onPatch(id, patch);
  };

  return (
    <BoardDnd onDrop={onDrop}>
      {axis === 'urgency' && (
        <p className="px-4 pb-2 text-xs text-zinc-500">緊急度は締切から決まるので、ここではドラッグで動かせない（締切を変えると列が変わる）。</p>
      )}
      <div className="scroll-thin flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 md:snap-none">
        {columns.map((col) => {
          const load = col.tasks.reduce((s, t) => s + (t.estimateMin ?? 0), 0);
          return (
            // PC では列が幅を分け合う（多すぎる分は横スクロール）
            <div key={col.key} className="flex w-[82vw] max-w-sm shrink-0 snap-start flex-col md:w-auto md:max-w-none md:min-w-60 md:flex-1">

              <div className="flex items-center gap-2 px-1 pb-2">
                {col.color && <span className="size-2.5 rounded-full" style={{ background: col.color }} />}
                <span
                  className={cx(
                    'text-sm font-semibold',
                    col.tone === 'red' && 'text-red-600 dark:text-red-400',
                    col.tone === 'amber' && 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {col.label}
                </span>
                <span className="text-xs text-zinc-400">{col.tasks.length}</span>
                {load > 0 && <span className="ml-auto text-xs text-zinc-400">⏱ {fmtMin(load)}</span>}
              </div>
              <Droppable
                id={`col:${col.key}`}
                disabled={!col.droppable}
                className="flex min-h-24 flex-1 flex-col gap-2 rounded-xl bg-zinc-100 p-2 transition dark:bg-zinc-900/60"
              >
                {col.tasks.map((t) => (
                  <Draggable key={t.id} id={`task:${t.id}`} disabled={!col.droppable}>
                    <TaskCard
                      task={t}
                      today={today}
                      categories={categories}
                      hideCategory={axis === 'category'}
                    />
                  </Draggable>
                ))}
                {col.tasks.length === 0 && <div className="py-4 text-center text-xs text-zinc-400">なし</div>}
              </Droppable>
            </div>
          );
        })}
      </div>
    </BoardDnd>
  );
}
