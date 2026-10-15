// 一覧（design 7-4）: カテゴリ別の木（既定）／締切順。検索・絞り込み（7-10）・完了も表示。
// カテゴリの「先の分を隠す」（4-9）が効く。検索しているときは全部出す。

import { useEffect, useState } from 'react';
import { OPEN_STATUSES, STATUSES } from '../../shared/constants.ts';
import type { Category, Task } from '../../shared/types.ts';
import { useAllTasks, useCategories } from '../api.ts';
import { FarNotice } from '../components/FarNotice.tsx';
import { FilterBar } from '../components/FilterBar.tsx';
import { PageHeader, Section } from '../components/Layout.tsx';
import { TaskRow } from '../components/TaskRow.tsx';
import { applyFilter, EMPTY_FILTER, normalizeFilter, type TaskFilter } from '../filter.ts';
import { splitFar } from '../horizon.ts';
import { useLocalState } from '../storage.ts';
import { clientToday, cx } from '../util.ts';

export function ListPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(h);
  }, [q]);
  const [mode, setMode] = useLocalState<'category' | 'due'>('list.mode', 'category');
  const [includeDone, setIncludeDone] = useLocalState('list.includeDone', false);
  const [collapsed, setCollapsed] = useLocalState<number[]>('list.collapsed', []);
  const [includeArchived, setIncludeArchived] = useLocalState('list.includeArchived', false);
  const { data: cats = [] } = useCategories(true);
  const hasArchived = cats.some((c) => c.archived);
  const showArchived = hasArchived && includeArchived;
  const { data: fetched = [], isLoading } = useAllTasks({
    q: debounced || undefined,
    includeDone,
    includeArchived: showArchived,
  });
  const [savedFilter, setFilter] = useLocalState<TaskFilter>('list.filter', EMPTY_FILTER);
  const filter = normalizeFilter(savedFilter);
  const categories = new Map(cats.map((c) => [c.id, c]));
  const today = clientToday();
  const [showFar, setShowFar] = useLocalState('list.showFar', false);
  const filtered = applyFilter(fetched, filter, today);
  const { near, far } = splitFar(filtered, categories, today);
  const searching = debounced !== '';
  const tasks = showFar || searching ? filtered : near;

  const toggle = (id: number) =>
    setCollapsed(collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id]);

  const btn = (active: boolean) =>
    cx(
      'rounded-md border px-2.5 py-1.5 text-xs',
      active ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300' : 'border-zinc-300 text-zinc-500 dark:border-zinc-700',
    );

  return (
    <div>
      <PageHeader title="一覧">
        <button type="button" className={btn(mode === 'category')} onClick={() => setMode('category')}>
          カテゴリ別
        </button>
        <button type="button" className={btn(mode === 'due')} onClick={() => setMode('due')}>
          締切順
        </button>
        <button type="button" className={btn(includeDone)} onClick={() => setIncludeDone(!includeDone)}>
          完了も
        </button>
      </PageHeader>
      <div className="px-4 pb-1">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="検索（タイトル・メモ・T-番号）"
          className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="mt-2.5">
          <FilterBar
            filter={filter}
            onChange={setFilter}
            categories={cats.filter((c) => !c.archived || showArchived)}
            statuses={includeDone || showArchived ? STATUSES : OPEN_STATUSES}
            shown={tasks.length}
            total={fetched.length}
          />
        </div>
        {!searching && (
          <div className="mt-2.5">
            <FarNotice far={far} shown={showFar} onToggle={setShowFar} today={today} />
          </div>
        )}
        {/* 終わったカテゴリ（設定でアーカイブしたもの）のタスクは普段は隠す（design 4-6） */}
        {hasArchived && (
          <label className="mt-2.5 flex items-center gap-1.5 px-1 text-xs text-zinc-500">
            <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
            アーカイブしたカテゴリのタスクも出す
          </label>
        )}
      </div>

      {isLoading && <p className="p-4 text-sm text-zinc-400">読み込み中…</p>}
      {!isLoading && tasks.length === 0 && <p className="px-4 py-8 text-center text-sm text-zinc-400">該当なし</p>}

      {mode === 'due' ? (
        <Section title="締切が早い順" count={tasks.length}>
          {[...tasks].sort(byDue).map((t) => (
            <TaskRow key={t.id} task={t} today={today} categories={categories} showParent />
          ))}
        </Section>
      ) : (
        <CategoryTree tasks={tasks} cats={cats} categories={categories} today={today} collapsed={collapsed} toggle={toggle} />
      )}
    </div>
  );
}

function byDue(a: Task, b: Task): number {
  const firstDo = (t: Task) => t.doDates[0]?.date ?? '9999-99-99';
  return (
    (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') ||
    firstDo(a).localeCompare(firstDo(b)) ||
    (a.priority ?? 9) - (b.priority ?? 9) ||
    a.id - b.id
  );
}

function CategoryTree({
  tasks,
  cats,
  categories,
  today,
  collapsed,
  toggle,
}: {
  tasks: Task[];
  cats: Category[];
  categories: Map<number, Category>;
  today: string;
  collapsed: number[];
  toggle: (id: number) => void;
}) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const kids = new Map<number, Task[]>();
  const roots: Task[] = [];
  for (const t of tasks) {
    if (t.parentId !== null && byId.has(t.parentId)) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);
    else roots.push(t);
  }
  const groupTitle = (cid: number | null) => {
    if (cid === null) return 'カテゴリなし';
    const c = categories.get(cid);
    return c ? `${c.name}${c.archived ? '・アーカイブ' : ''}` : '?';
  };
  const groups = [...cats.map((c) => c.id), null]
    .map((cid) => ({ cid, roots: roots.filter((t) => t.categoryId === cid) }))
    .filter((g) => g.roots.length > 0);

  const render = (t: Task, depth: number): React.ReactNode[] => {
    const children = (kids.get(t.id) ?? []).sort((a, b) => a.position - b.position || a.id - b.id);
    const open = !collapsed.includes(t.id);
    return [
      <TaskRow
        key={t.id}
        task={t}
        today={today}
        categories={categories}
        depth={depth}
        showParent={depth === 0 && t.parentId !== null}
        toggle={children.length ? { open, onToggle: () => toggle(t.id) } : undefined}
      />,
      ...(open ? children.flatMap((c) => render(c, depth + 1)) : []),
    ];
  };

  return (
    <>
      {groups.map((g) => (
        <Section key={g.cid ?? 'none'} title={groupTitle(g.cid)} count={g.roots.length}>
          {g.roots.flatMap((t) => render(t, 0))}
        </Section>
      ))}
    </>
  );
}
