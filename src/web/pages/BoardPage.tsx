// ボード（design 7-8）: 全体を見渡すメインのダッシュボード。上でビューを切り替える。

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { STATUSES } from '../../shared/constants.ts';
import type { TaskPatchInput } from '../../shared/schemas.ts';
import type { Task } from '../../shared/types.ts';
import { api, useAllTasks, useCategories, useSettings, useWrite, type AllParams } from '../api.ts';
import { DayView } from '../board/DayView.tsx';
import { KanbanView, AXES } from '../board/KanbanView.tsx';
import { BottleneckView, MatrixView, PlanView, ReviewView } from '../board/ListViews.tsx';
import { moveDoDate, planQueue, bottlenecks, type Axis } from '../board/logic.ts';
import { MonthView } from '../board/MonthView.tsx';
import { SeriesView } from '../board/SeriesView.tsx';
import { WeekView } from '../board/WeekView.tsx';
import { FarNotice } from '../components/FarNotice.tsx';
import { FilterBar } from '../components/FilterBar.tsx';
import { applyFilter, EMPTY_FILTER, normalizeFilter, type TaskFilter } from '../filter.ts';
import { forAction, forCalendar } from '../../shared/series.ts';
import { hiddenFromPlan, splitFar } from '../horizon.ts';
import { useLocalState } from '../storage.ts';
import { addDays, clientToday, cx, isOpenTask } from '../util.ts';

type View = 'kanban' | 'day' | 'week' | 'month' | 'series' | 'matrix' | 'plan' | 'bottleneck' | 'review';

const VIEWS: [View, string][] = [
  ['kanban', 'カンバン'],
  ['day', '日'],
  ['week', '週'],
  ['month', '月'],
  ['series', 'シリーズ'],
  ['matrix', '重要×緊急'],
  ['plan', '計画待ち'],
  ['bottleneck', 'ボトルネック'],
  ['review', '振り返り'],
];

export function BoardPage() {
  const [savedView, saveView] = useLocalState<View>('board.view', 'kanban');
  const [savedAxis, saveAxis] = useLocalState<Axis>('board.axis', 'status');
  // URL（/board?v=week&axis=priority・/board?v=series&s=133）で直接開ける。指定が無ければ最後に見たもの
  const [params0, setParams] = useSearchParams();
  const urlView = params0.get('v') as View | null;
  const urlAxis = params0.get('axis') as Axis | null;
  const view = VIEWS.some(([v]) => v === urlView) ? urlView! : savedView;
  const axis = AXES.some(([a]) => a === urlAxis) ? urlAxis! : savedAxis;
  const clearUrl = () =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('v');
        next.delete('axis');
        next.delete('s');
        return next;
      },
      { replace: true },
    );
  const setView = (v: View) => {
    saveView(v);
    clearUrl();
  };
  const setAxis = (a: Axis) => {
    saveAxis(a);
    saveView(view);
    clearUrl();
  };
  const [savedFilter, setFilter] = useLocalState<TaskFilter>('board.filter', EMPTY_FILTER);
  const filter = normalizeFilter(savedFilter);
  // シリーズ（子が残っている親）も出すか（design 4-3）。既定は出さない＝並べるビューには子（やること）だけを並べて、
  // 親の締切はいま着手できる子に受け継がせる。日・週・月では親は締切の印だけ（やる日は出さない）
  const [withParents, setWithParents] = useLocalState('board.parents', false);
  // 依存待ち（先にやるものが終わっていない未完了）を出すか。ボトルネックは待っている側を数えるので、そこでは常に含める
  const [withBlocked, setWithBlocked] = useLocalState('board.blocked', true);
  // 週・月に Google カレンダーの予定を重ねる（v3・design 7-11）。つながっているときだけ選べる
  const [overlayOn, setOverlayOn] = useLocalState('board.overlay', true);
  const { data: gcal } = useQuery({ queryKey: ['gcal'], queryFn: api.gcalStatus, staleTime: 60_000 });
  const overlay = overlayOn && Boolean(gcal?.connected);

  const today = clientToday();
  const since = addDays(today, -6);
  const params: AllParams = { doneSince: since };
  const { data: all = [], isLoading } = useAllTasks(params);
  const { data: cats = [] } = useCategories(true);
  const { data: settings } = useSettings();
  const categories = new Map(cats.map((c) => [c.id, c]));
  const qc = useQueryClient();

  const narrow = (list: Task[]) => {
    const withAllBlocked = applyFilter(list, filter, today);
    return {
      withAllBlocked,
      shown: withBlocked ? withAllBlocked : withAllBlocked.filter((t) => !(isOpenTask(t) && t.blocked)),
    };
  };
  // 親の扱いはビューの種類で変える（design 4-3）: 並べるビュー＝親を外して締切を子へ／日付のビュー＝親は締切の印だけ／
  // ボトルネック・振り返り＝そのまま（依存のつながりと、終わったものを見るため）
  const actionBase = withParents ? all : forAction(all);
  const action = narrow(actionBase);
  const dated = narrow(withParents ? all : forCalendar(all));
  const raw = narrow(all);
  const dateView = view === 'day' || view === 'week' || view === 'month';
  const tasks = dateView ? dated.shown : raw.shown;
  // 並べるだけのビュー（カンバン・重要×緊急・計画待ち）は、カテゴリの日数より先の分を隠す（design 4-9）。
  // 週・月は日付の画面なので全部出す
  const [showFar, setShowFar] = useLocalState('board.showFar', false);
  const { near, far } = splitFar(action.shown, categories, today);
  const listed = showFar ? action.shown : near;
  const planned = listed.filter((t) => !hiddenFromPlan(t, categories));
  const horizonView = view === 'kanban' || view === 'matrix' || view === 'plan';
  const activeCats = cats.filter((c) => !c.archived);
  // カテゴリで絞っているときは、カンバンのカテゴリ列も選んだものだけにする
  const kanbanCats = filter.categories.length ? cats.filter((c) => filter.categories.includes(c.id)) : cats;

  /** 落とした瞬間にカードを動かして見せ、裏で保存してから取り直す */
  const patchLocal = (id: number, fn: (t: Task) => Task) =>
    qc.setQueryData<Task[]>(['tasks', 'all', params], (old) => old?.map((t) => (t.id === id ? fn(t) : t)));
  const update = useWrite((a: { id: number; patch: TaskPatchInput }) => api.update(a.id, a.patch));
  const setDates = useWrite((a: { id: number; dates: Task['doDates'] }) => api.setDates(a.id, a.dates));

  const onPatch = (id: number, patch: TaskPatchInput) => {
    patchLocal(id, (t) => ({ ...t, ...(patch as Partial<Task>) }));
    update.mutate({ id, patch });
  };
  const onMoveDate = (task: Task, from: string, to: string) => {
    const dates = moveDoDate(task.doDates, from, to);
    patchLocal(task.id, (t) => ({ ...t, doDates: dates }));
    setDates.mutate({ id: task.id, dates });
  };
  /** 日・週の時間割で動かしたとき（失敗はトーストで知らせて取り直す） */
  const onSetDates = (task: Task, dates: Task['doDates']) => {
    patchLocal(task.id, (t) => ({ ...t, doDates: dates }));
    return setDates.mutateAsync({ id: task.id, dates }).catch(() => undefined);
  };

  const badge: Partial<Record<View, number>> = {
    plan: planQueue(planned).length,
    bottleneck: bottlenecks(raw.withAllBlocked).length,
  };
  const pill = (active: boolean) =>
    cx(
      'shrink-0 rounded-full px-3 py-1.5 text-sm transition',
      active ? 'bg-indigo-600 text-white' : 'bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    );
  const common = { tasks, today, categories };

  return (
    <div>
      <div className="scroll-thin flex gap-2 overflow-x-auto px-4 pt-5 pb-3">
        {VIEWS.map(([v, label]) => (
          <button key={v} type="button" className={pill(view === v)} onClick={() => setView(v)}>
            {label}
            {badge[v] ? <span className="ml-1 text-xs opacity-70">{badge[v]}</span> : null}
          </button>
        ))}
      </div>

      {view !== 'series' && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3 text-sm">
            {view === 'kanban' && (
              <div className="flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700">
                {AXES.map(([a, label]) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAxis(a)}
                    className={cx(
                      'px-3 py-1.5 text-xs',
                      axis === a ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900' : 'text-zinc-600 dark:text-zinc-300',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {(horizonView || dateView) && (
              <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                <input type="checkbox" checked={withParents} onChange={(e) => setWithParents(e.target.checked)} />
                シリーズ（親）も出す
              </label>
            )}
            {view !== 'bottleneck' && (
              <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                <input type="checkbox" checked={withBlocked} onChange={(e) => setWithBlocked(e.target.checked)} />
                依存待ちを含める
              </label>
            )}
            {(view === 'day' || view === 'week' || view === 'month') && gcal?.connected && (
              <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                <input type="checkbox" checked={overlayOn} onChange={(e) => setOverlayOn(e.target.checked)} />
                Google の予定を重ねる
              </label>
            )}
          </div>
          <div className="px-4 pb-4">
            <FilterBar
              filter={filter}
              onChange={setFilter}
              categories={activeCats}
              statuses={STATUSES}
              shown={(view === 'bottleneck' ? raw.withAllBlocked : view === 'plan' ? planned : horizonView ? listed : tasks).length}
              total={(horizonView ? actionBase : all).length}
            />
            {horizonView && (
              <div className="mt-2.5">
                <FarNotice far={far} shown={showFar} onToggle={setShowFar} today={today} />
              </div>
            )}
          </div>
        </>
      )}

      {isLoading ? (
        <p className="p-4 text-sm text-zinc-400">読み込み中…</p>
      ) : view === 'kanban' ? (
        // 絞り込みで列が変わったら横スクロールを左端に戻す（key で作り直す）
        <KanbanView
          key={`${axis}:${filter.categories.join(',')}`}
          {...common}
          tasks={listed}
          axis={axis}
          cats={kanbanCats}
          hideNoCategory={filter.categories.length > 0 && !filter.categories.includes(0)}
          onPatch={onPatch}
        />
      ) : view === 'day' ? (
        <DayView {...common} pool={actionBase} capacityMin={settings?.dailyCapacityMin ?? 360} onSetDates={onSetDates} overlay={overlay} />
      ) : view === 'week' ? (
        <WeekView {...common} pool={actionBase} capacityMin={settings?.dailyCapacityMin ?? 360} onSetDates={onSetDates} overlay={overlay} />
      ) : view === 'month' ? (
        <MonthView {...common} onMoveDate={onMoveDate} overlay={overlay} />
      ) : view === 'series' ? (
        <SeriesView today={today} categories={categories} />
      ) : view === 'matrix' ? (
        <MatrixView {...common} tasks={listed} />
      ) : view === 'plan' ? (
        <PlanView {...common} tasks={planned} />
      ) : view === 'bottleneck' ? (
        <BottleneckView {...common} tasks={raw.withAllBlocked} />
      ) : (
        <ReviewView {...common} since={since} />
      )}
    </div>
  );
}
