// プロジェクト（design 7-14・2026-10-20 本人要望）: 子を持つ親（プロジェクト・シリーズ）の一覧。
// いちばん上の親ごとに1枚のカードで、締切（無ければ工程の締切）の近い順。中間の親はカードの中に字下げで。
// タイトルでシリーズの図へ、番号で詳細へ、「次」の工程の名前でその工程の詳細へ。

import { Fragment } from 'react';
import { useNavigate } from 'react-router';
import { diffDays } from '../../shared/dates.ts';
import type { Category } from '../../shared/types.ts';
import { CloseButton } from '../components/TaskRow.tsx';
import { useOpenTask } from '../nav.ts';
import { cx, fmtDate, isDimmed } from '../util.ts';
import type { ProjectNode } from './logic.ts';

interface Props {
  projects: ProjectNode[];
  today: string;
  categories: Map<number, Category>;
}

export function ProjectsView({ projects, today, categories }: Props) {
  if (projects.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-zinc-400">
        子タスクを持つ親はまだない。タスクの詳細で子を足すと、ここに並ぶ。
      </p>
    );
  }
  return (
    <div className="grid items-start gap-3 px-4 pb-4 md:grid-cols-2">
      {projects.map((p) => (
        <section
          key={p.task.id}
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        >
          <ProjectRow node={p} depth={0} today={today} categories={categories} />
        </section>
      ))}
    </div>
  );
}

function ProjectRow({ node, depth, today, categories }: { node: ProjectNode; depth: number } & Omit<Props, 'projects'>) {
  const navigate = useNavigate();
  const openTask = useOpenTask();
  const t = node.task;
  const cat = t.categoryId !== null ? categories.get(t.categoryId) : undefined;
  const { total, done } = t.children;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <div
        className={cx('py-3 pr-3', depth > 0 && 'border-t border-zinc-200/70 dark:border-zinc-800')}
        style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => navigate(`/board?v=series&s=${t.id}`)}
            className={cx(
              'min-w-0 flex-1 break-words text-left leading-snug hover:underline',
              depth === 0 ? 'font-semibold' : 'text-sm font-medium',
              isDimmed(t) && 'opacity-60',
            )}
            title="シリーズの図で見る"
          >
            {depth > 0 && <span className="mr-1 text-zinc-400">↳</span>}
            {t.title}
          </button>
          <button
            type="button"
            onClick={() => openTask(t.id)}
            className="shrink-0 pt-0.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            title="詳細を開く"
          >
            {t.code}
          </button>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          {cat && depth === 0 && (
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: cat.color }} />
              {cat.name}
            </span>
          )}
          {t.status === 'doing' && <span className="font-medium text-indigo-600 dark:text-indigo-400">進行中</span>}
          {t.status === 'waiting' && <span>⏳ 待ち</span>}
          {t.status !== 'waiting' && t.blocked && (
            <span>⛓ 待ち{t.waitVia ? `（親 ${t.waitVia.code}）` : ''}</span>
          )}
          <Due node={node} today={today} />
          {node.waiting > 0 && <span>待っている工程 {node.waiting}</span>}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-zinc-500">
            {done}/{total}
          </span>
        </div>

        {node.finished ? (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-emerald-600 dark:text-emerald-400">工程が全部済んだ</span>
            <CloseButton task={t} />
          </div>
        ) : node.next.length > 0 ? (
          <div className="mt-2 text-xs leading-relaxed">
            <span className="text-zinc-500">次: </span>
            {node.next.slice(0, 3).map((c, i) => (
              <Fragment key={c.id}>
                {i > 0 && <span className="text-zinc-400">・</span>}
                <button
                  type="button"
                  onClick={() => openTask(c.id)}
                  className="text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {c.title}
                </button>
              </Fragment>
            ))}
            {node.next.length > 3 && <span className="text-zinc-400"> ほか{node.next.length - 3}</span>}
          </div>
        ) : (
          <div className="mt-2 text-xs text-zinc-400">次: いま手を付けられる工程はない（待っている）</div>
        )}
      </div>
      {node.subs.map((s) => (
        <ProjectRow key={s.task.id} node={s} depth={depth + 1} today={today} categories={categories} />
      ))}
    </>
  );
}

/** 自分の締切（無ければ工程のいちばん近い締切）。過ぎたら赤・今日は橙・3日以内は黄 */
function Due({ node, today }: { node: ProjectNode; today: string }) {
  const own = node.task.dueDate;
  const date = own ?? node.nextDue;
  if (!date) return null;
  const left = diffDays(date, today);
  return (
    <span
      className={cx(
        left < 0 && 'font-medium text-red-600 dark:text-red-400',
        left === 0 && 'font-medium text-orange-600 dark:text-orange-400',
        left > 0 && left <= 3 && 'text-amber-600 dark:text-amber-400',
      )}
    >
      ⏰ {fmtDate(date, today)}
      {own && node.task.dueTime && ` ${node.task.dueTime}`}
      {!own && '（工程）'}
    </span>
  );
}
