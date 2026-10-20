// タスクの詳細（design 7-6）。項目は変えた瞬間に保存する。
// 出し方は2通り: 重ねて出す（TaskDrawer＝スマホ・ボード）／右側に常に並べる（TaskPane＝広い画面の今日・一覧・未整理）。

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { STATUS_LABEL, STATUSES, type Status } from '../../shared/constants.ts';
import type { RecurrenceInput } from '../../shared/schemas.ts';
import { anchorLabel, flatten, stripDatePrefix } from '../../shared/templates.ts';
import type { Category, Task, TaskDetail, TaskRef } from '../../shared/types.ts';
import { api, ApiError, useCategories, useTask, useWrite } from '../api.ts';
import { useOpenTask, useOpenTaskId } from '../nav.ts';
import { toast } from '../toast.ts';
import { addDays, clientToday, cx, ESTIMATES, fmtMin } from '../util.ts';
import { DatePicker } from './DatePicker.tsx';
import { TaskPicker } from './TaskPicker.tsx';
import { TaskRow } from './TaskRow.tsx';

/** Esc で閉じる（入力中は除く） */
function useEscapeToClose(id: number | null) {
  const openTask = useOpenTask();
  useEffect(() => {
    if (id === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        openTask(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, openTask]);
}

/** 右側に常に並べる詳細（広い画面の今日・一覧・未整理） */
export function TaskPane() {
  const id = useOpenTaskId();
  useEscapeToClose(id);
  if (id === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-zinc-400">
        <span className="text-3xl">☜</span>
        タスクを選ぶと、ここに詳細が出る。
        <span className="text-xs">n でタスク・Shift＋n で詳しく・m でメモを追加 ／ Esc で閉じる</span>
      </div>
    );
  }
  return <Detail key={id} id={id} />;
}

/** 重ねて出す詳細（スマホ・ボード） */
export function TaskDrawer() {
  const id = useOpenTaskId();
  const openTask = useOpenTask();
  useEscapeToClose(id);

  if (id === null) return null;
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={() => openTask(null)}>
      <div
        className="pb-safe scroll-hidden h-full w-full overflow-y-auto bg-white shadow-xl md:max-w-lg dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <Detail key={id} id={id} />
      </div>
    </div>
  );
}

const sectionCls = 'border-t border-zinc-200 px-5 py-4 dark:border-zinc-800';
const labelCls = 'mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400';
const inputCls =
  'rounded-md border border-zinc-300 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700';

function Seg<T extends string | number | null>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={cx(
            'rounded-md border px-2.5 py-1.5 text-sm',
            v === value
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
              : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Detail({ id }: { id: number }) {
  const { data: t, error } = useTask(id);
  const { data: categories = [] } = useCategories(true);
  const openTask = useOpenTask();
  const navigate = useNavigate();
  /** シリーズの依存の図（ボードの「シリーズ」・v4）へ。focus を渡すと、図の中でそのタスクを光らせる。詳細は閉じる */
  const showSeries = (seriesId: number, focus?: number) =>
    navigate(`/board?v=series&s=${seriesId}${focus !== undefined ? `&f=${focus}` : ''}`);
  const update = useWrite((patch: Parameters<typeof api.update>[1]) => api.update(id, patch));
  const remove = useWrite(() => api.remove(id));

  if (error) return <p className="p-4 text-sm text-zinc-500">見つからない（消されたかもしれない）</p>;
  if (!t) return <p className="p-4 text-sm text-zinc-400">読み込み中…</p>;
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const onDelete = () => {
    const n = t.descendantCount;
    if (!confirm(`${t.code}「${t.title}」を削除する？${n ? `\n子・孫 ${n} 件も一緒に消える。` : ''}\n（やめるだけなら「中止」）`)) return;
    remove.mutate(undefined, {
      onSuccess: (r) => {
        toast(`${r.deleted} 件削除した`);
        openTask(null);
      },
    });
  };

  return (
    <div>
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-200 bg-white/90 px-5 py-2.5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <span className="text-sm text-zinc-400">{t.code}</span>
        {t.legacyId && <span className="text-xs text-zinc-400">（旧 {t.legacyId}）</span>}
        <button type="button" onClick={() => openTask(null)} className="ml-auto rounded px-2 py-1 text-sm text-zinc-500">
          閉じる
        </button>
      </header>

      <div className="px-5 pt-4 pb-3">
        {t.parentId !== null && (
          <div className="mb-2 flex items-center gap-3 text-xs">
            <button type="button" onClick={() => openTask(t.parentId)} className="min-w-0 truncate text-indigo-600 dark:text-indigo-400">
              ↑ {t.parentTitle}
            </button>
            {/* 属するシリーズ（親）の依存の図へ。図ではこのタスクが光る */}
            <button
              type="button"
              onClick={() => showSeries(t.parentId!, t.id)}
              className="ml-auto shrink-0 rounded-full border border-indigo-300 px-2.5 py-1 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300"
            >
              シリーズの図で見る →
            </button>
          </div>
        )}
        <TitleField task={t} onSave={(title) => update.mutate({ title })} />
      </div>

      <div className={sectionCls}>
        <div className={labelCls}>状態</div>
        <Seg<Status>
          value={t.status}
          options={STATUSES.map((s) => [s, STATUS_LABEL[s]])}
          onChange={(status) => update.mutate({ status })}
        />
      </div>

      <div className={cx(sectionCls, 'grid grid-cols-1 gap-3 sm:grid-cols-2')}>
        <div>
          <div className={labelCls}>カテゴリ</div>
          <select
            value={t.categoryId ?? ''}
            onChange={(e) => update.mutate({ categoryId: e.target.value ? Number(e.target.value) : null })}
            className={cx(inputCls, 'w-full')}
          >
            <option value="">なし</option>
            {categories
              .filter((c) => !c.archived || c.id === t.categoryId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <div className={labelCls}>優先度</div>
          <Seg<1 | 2 | 3 | null>
            value={t.priority}
            options={[
              [null, '－'],
              [1, '高'],
              [2, '中'],
              [3, '低'],
            ]}
            onChange={(priority) => update.mutate({ priority })}
          />
        </div>
      </div>

      <div className={sectionCls}>
        <div className={labelCls}>締切</div>
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker
            value={t.dueDate}
            onChange={(dueDate) => update.mutate({ dueDate })}
            clearable
            placeholder="締切なし"
            marks={t.doDates.map((d) => d.date)}
          />
          <input
            type="time"
            value={t.dueTime ?? ''}
            disabled={!t.dueDate}
            onChange={(e) => update.mutate({ dueTime: e.target.value || null })}
            className={cx(inputCls, 'min-h-9 disabled:opacity-40')}
            aria-label="締切の時刻"
          />
        </div>
      </div>

      <div className={sectionCls}>
        <div className={labelCls}>やる日</div>
        <DoDatesEditor task={t} />
      </div>

      <div className={sectionCls}>
        <div className={labelCls}>見積{t.estimateMin ? `（${fmtMin(t.estimateMin)}）` : ''}</div>
        <Seg<number | null>
          value={t.estimateMin}
          options={[[null, '－'], ...ESTIMATES]}
          onChange={(estimateMin) => update.mutate({ estimateMin })}
        />
      </div>

      {(t.status === 'done' || t.actualMin !== null) && (
        <div className={sectionCls}>
          <div className={labelCls}>
            かかった時間{t.actualMin ? `（${fmtMin(t.actualMin)}${t.estimateMin ? `・見積 ${fmtMin(t.estimateMin)}` : ''}）` : ''}
          </div>
          <Seg<number | null>
            value={t.actualMin}
            options={[[null, '－'], [5, '5m'], ...ESTIMATES]}
            onChange={(actualMin) => update.mutate({ actualMin })}
          />
        </div>
      )}

      <div className={sectionCls}>
        <div className={labelCls}>繰り返し</div>
        <RecurrenceEditor key={t.recurrence?.id ?? 'none'} task={t} />
      </div>

      <div className={sectionCls}>
        <div className={cx(labelCls, 'flex items-baseline')}>
          子タスク{t.children.total > 0 && `（${t.children.done}/${t.children.total}）`}
          {t.childTasks.length > 0 && (
            <button type="button" onClick={() => showSeries(t.id)} className="ml-auto text-indigo-600 dark:text-indigo-400">
              依存の図で見る →
            </button>
          )}
        </div>
        <ChildrenEditor task={t} categories={catMap} />
        {t.childTasks.length > 0 && <SaveTemplateButton task={t} />}
      </div>

      <div className={sectionCls}>
        <DepsEditor task={t} />
      </div>

      <div className={sectionCls}>
        <div className={labelCls}>メモ</div>
        <NotesField task={t} onSave={(notes) => update.mutate({ notes })} />
      </div>

      <div className={sectionCls}>
        <ParentEditor task={t} />
      </div>

      <div className={cx(sectionCls, 'flex items-center justify-between text-xs text-zinc-400')}>
        <span>
          登録 {t.createdAt.slice(0, 10)}
          {t.completedAt && ` ・ 完了 ${t.completedAt.slice(0, 10)}`}
        </span>
        <button type="button" onClick={onDelete} className="rounded px-2 py-1 text-red-600 dark:text-red-400">
          削除
        </button>
      </div>
    </div>
  );
}

function TitleField({ task, onSave }: { task: TaskDetail; onSave: (title: string) => void }) {
  const [v, setV] = useState(task.title);
  useEffect(() => setV(task.title), [task.title]);
  const save = () => {
    const s = v.trim();
    if (s && s !== task.title) onSave(s);
    else setV(task.title);
  };
  return (
    <textarea
      value={v}
      rows={Math.min(4, Math.max(1, Math.ceil(v.length / 22)))}
      onChange={(e) => setV(e.target.value.replace(/\n/g, ''))}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      className={cx(
        'w-full resize-none bg-transparent text-lg font-semibold leading-snug outline-none',
        (task.status === 'done' || task.status === 'canceled') && 'text-zinc-400 line-through',
      )}
    />
  );
}

function NotesField({ task, onSave }: { task: TaskDetail; onSave: (notes: string) => void }) {
  const [v, setV] = useState(task.notes);
  useEffect(() => setV(task.notes), [task.notes]);
  return (
    <textarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== task.notes && onSave(v)}
      rows={Math.min(14, Math.max(3, v.split('\n').length + 1))}
      placeholder="自由記述（Markdown）"
      className={cx(inputCls, 'w-full font-mono text-[13px] leading-relaxed')}
    />
  );
}

const MINUTES: [number | null, string][] = [[null, '時間'], ...ESTIMATES];

function DoDatesEditor({ task }: { task: TaskDetail }) {
  const setDates = useWrite((dates: Task['doDates']) => api.setDates(task.id, dates));
  const dates = task.doDates;
  const write = (next: Task['doDates']) => setDates.mutate(next);
  const today = clientToday();
  const addDate = (d: string) => {
    if (dates.some((x) => x.date === d)) return;
    write([...dates, { date: d, minutes: null }]);
  };

  return (
    <div className="space-y-1.5">
      {dates.map((d, i) => (
        <div key={d.date} className="flex items-center gap-2">
          <DatePicker
            value={d.date}
            onChange={(next) => next && write(dates.map((x, j) => (j === i ? { ...x, date: next } : x)))}
            marks={dates.filter((x) => x.date !== d.date).map((x) => x.date)}
          />
          <select
            value={d.minutes ?? ''}
            onChange={(e) =>
              write(dates.map((x, j) => (j === i ? { ...x, minutes: e.target.value ? Number(e.target.value) : null } : x)))
            }
            className={inputCls}
          >
            {MINUTES.map(([m, label]) => (
              <option key={String(m)} value={m ?? ''}>
                {label}
              </option>
            ))}
          </select>
          {/* その日の時刻（今日の流れの空きに置くと入る・入れると Google に時刻つきで書き出す） */}
          <input
            type="time"
            step={300}
            value={d.start ?? ''}
            onChange={(e) => write(dates.map((x, j) => (j === i ? { ...x, start: e.target.value || null } : x)))}
            className={cx(inputCls, 'min-h-9 w-[6.5rem]')}
            aria-label="その日の時刻"
          />
          <button type="button" onClick={() => write(dates.filter((_, j) => j !== i))} className="text-xs text-zinc-500">
            消す
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {!dates.some((d) => d.date === today) && (
          <button type="button" onClick={() => addDate(today)} className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm dark:border-zinc-700">
            ＋ 今日
          </button>
        )}
        {!dates.some((d) => d.date === addDays(today, 1)) && (
          <button
            type="button"
            onClick={() => addDate(addDays(today, 1))}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm dark:border-zinc-700"
          >
            ＋ 明日
          </button>
        )}
        <DatePicker
          value={null}
          onChange={(d) => d && addDate(d)}
          marks={dates.map((x) => x.date)}
          trigger={() => (
            <button type="button" className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm dark:border-zinc-700">
              ＋ 日付を選ぶ
            </button>
          )}
        />
      </div>
    </div>
  );
}

const WEEKDAYS: [number, string][] = [
  [1, '月'],
  [2, '火'],
  [3, '水'],
  [4, '木'],
  [5, '金'],
  [6, '土'],
  [7, '日'],
];

function RecurrenceEditor({ task }: { task: TaskDetail }) {
  const r = task.recurrence;
  const [kind, setKind] = useState<RecurrenceInput['kind'] | 'none'>(r?.active ? r.kind : 'none');
  const [weekdays, setWeekdays] = useState<number[]>(r?.weekdays ?? []);
  const [monthDay, setMonthDay] = useState(r?.monthDay ?? 1);
  const [intervalDays, setIntervalDays] = useState(r?.intervalDays ?? 7);
  const [anchor, setAnchor] = useState<'do' | 'due'>(r?.anchor ?? 'do');
  const save = useWrite((input: RecurrenceInput | null) => api.setRecurrence(task.id, input));

  const apply = () => {
    if (kind === 'none') return save.mutate(null, { onSuccess: () => toast('繰り返しを解除した') });
    const input: RecurrenceInput =
      kind === 'weekly'
        ? { kind, weekdays, anchor }
        : kind === 'monthly'
          ? { kind, monthDay, anchor }
          : { kind, intervalDays, anchor };
    if (kind === 'weekly' && weekdays.length === 0) return toast('曜日を1つ以上選んで', 'error');
    save.mutate(input, { onSuccess: () => toast('繰り返しを設定した') });
  };

  return (
    <div className="space-y-2">
      <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={inputCls}>
        <option value="none">なし</option>
        <option value="weekly">毎週◯曜</option>
        <option value="monthly">毎月◯日</option>
        <option value="interval">N 日ごと</option>
        <option value="after_done">完了から N 日後</option>
      </select>
      {kind === 'weekly' && (
        <div className="flex gap-1">
          {WEEKDAYS.map(([w, label]) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeekdays(weekdays.includes(w) ? weekdays.filter((x) => x !== w) : [...weekdays, w])}
              className={cx(
                'size-8 rounded-full border text-sm',
                weekdays.includes(w) ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-300 dark:border-zinc-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {kind === 'monthly' && (
        <label className="flex items-center gap-2 text-sm">
          毎月
          <input
            type="number"
            min={1}
            max={31}
            value={monthDay}
            onChange={(e) => setMonthDay(Number(e.target.value))}
            className={cx(inputCls, 'w-16')}
          />
          日（無い月は月末）
        </label>
      )}
      {(kind === 'interval' || kind === 'after_done') && (
        <label className="flex items-center gap-2 text-sm">
          {kind === 'after_done' ? '完了から' : ''}
          <input
            type="number"
            min={1}
            value={intervalDays}
            onChange={(e) => setIntervalDays(Number(e.target.value))}
            className={cx(inputCls, 'w-16')}
          />
          {kind === 'after_done' ? '日後' : '日ごと'}
        </label>
      )}
      {kind !== 'none' && (
        <label className="flex items-center gap-2 text-sm">
          日付を入れる先
          <select value={anchor} onChange={(e) => setAnchor(e.target.value as 'do' | 'due')} className={inputCls}>
            <option value="do">やる日</option>
            <option value="due">締切</option>
          </select>
        </label>
      )}
      <div className="flex items-center gap-3">
        <button type="button" onClick={apply} className="rounded-md bg-indigo-600 px-3 py-1 text-sm text-white">
          適用
        </button>
        <span className="text-xs text-zinc-400">完了・中止すると次の回ができる</span>
      </div>
    </div>
  );
}

function ChildrenEditor({ task, categories }: { task: TaskDetail; categories: Map<number, Category> }) {
  const [title, setTitle] = useState('');
  const create = useWrite(api.create);
  const today = clientToday();
  const add = () => {
    const s = title.trim();
    if (!s) return;
    create.mutate({ title: s, parentId: task.id }, { onSuccess: () => setTitle('') });
  };
  return (
    <div>
      <div className="-mx-3">
        {task.childTasks.map((c) => (
          <TaskRow key={c.id} task={c} today={today} categories={categories} />
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="mt-1.5"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="＋ 子タスクを追加（Enter で続けて）"
          enterKeyHint="send"
          className={cx(inputCls, 'w-full py-1.5')}
        />
      </form>
    </div>
  );
}

/**
 * この親の形（子・孫・依存・見積など）をテンプレートとして保存する（design 4-8）。
 * 同じ名前があれば、置き換えるか聞く。日付は親の締切（無ければやる日）からの相対で覚える
 */
function SaveTemplateButton({ task }: { task: TaskDetail }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const name = prompt('テンプレートの名前', stripDatePrefix(task.title).title)?.trim();
    if (!name) return;
    setBusy(true);
    try {
      let saved;
      try {
        saved = await api.saveTemplate(task.id, name);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 409)) throw e;
        if (!confirm(`テンプレート「${name}」は既にある。今のこの形で置き換える？`)) return;
        saved = await api.saveTemplate(task.id, name, true);
      }
      await qc.invalidateQueries({ queryKey: ['templates'] });
      const { body } = saved;
      const base = body.anchor ? `日付は親の${anchorLabel(body.anchor)}から数える` : '日付は覚えていない';
      toast(`テンプレート「${saved.name}」を保存（${flatten(body.root).length} 件・依存 ${body.deps.length} 本・${base}）`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={save}
      disabled={busy}
      className="mt-2.5 text-sm text-zinc-500 disabled:opacity-40 dark:text-zinc-400"
    >
      ▤ この形をテンプレートとして保存
    </button>
  );
}

function RefList({ refs, onOpen, onRemove }: { refs: TaskRef[]; onOpen: (id: number) => void; onRemove: (id: number) => void }) {
  return (
    <ul className="space-y-1">
      {refs.map((d) => (
        <li key={d.id} className="flex items-center gap-2 text-sm">
          <button type="button" onClick={() => onOpen(d.id)} className="min-w-0 flex-1 truncate text-left">
            <span className="mr-1.5 text-xs text-zinc-400">{d.code}</span>
            <span className={cx((d.status === 'done' || d.status === 'canceled') && 'text-zinc-400 line-through')}>{d.title}</span>
            <span className="ml-1.5 text-xs text-zinc-400">{STATUS_LABEL[d.status]}</span>
          </button>
          <button type="button" onClick={() => onRemove(d.id)} className="text-xs text-zinc-500">
            外す
          </button>
        </li>
      ))}
    </ul>
  );
}

function DepsEditor({ task }: { task: TaskDetail }) {
  const openTask = useOpenTask();
  const [picking, setPicking] = useState<'before' | 'after' | null>(null);
  const addBefore = useWrite((dep: number) => api.addDep(task.id, dep));
  const addAfter = useWrite((other: number) => api.addDep(other, task.id));
  const rmBefore = useWrite((dep: number) => api.removeDep(task.id, dep));
  const rmAfter = useWrite((other: number) => api.removeDep(other, task.id));
  const exclude = useMemo(
    () => new Set([task.id, ...task.dependsOn.map((d) => d.id), ...task.dependents.map((d) => d.id)]),
    [task],
  );

  return (
    <div className="space-y-3">
      <div>
        <div className={labelCls}>先にやる（これが終わるまで着手できない）</div>
        <RefList refs={task.dependsOn} onOpen={openTask} onRemove={(id) => rmBefore.mutate(id)} />
        {picking === 'before' ? (
          <TaskPicker
            exclude={exclude}
            placeholder="先にやるタスクを検索"
            onPick={(id) => addBefore.mutate(id, { onSuccess: () => setPicking(null) })}
            onCancel={() => setPicking(null)}
          />
        ) : (
          <button type="button" onClick={() => setPicking('before')} className="mt-1 text-sm text-indigo-600 dark:text-indigo-400">
            ＋ 追加
          </button>
        )}
      </div>
      <div>
        <div className={labelCls}>後にやる（これが終わるのを待っている）</div>
        <RefList refs={task.dependents} onOpen={openTask} onRemove={(id) => rmAfter.mutate(id)} />
        {picking === 'after' ? (
          <TaskPicker
            exclude={exclude}
            placeholder="後にやるタスクを検索"
            onPick={(id) => addAfter.mutate(id, { onSuccess: () => setPicking(null) })}
            onCancel={() => setPicking(null)}
          />
        ) : (
          <button type="button" onClick={() => setPicking('after')} className="mt-1 text-sm text-indigo-600 dark:text-indigo-400">
            ＋ 追加
          </button>
        )}
      </div>
    </div>
  );
}

function ParentEditor({ task }: { task: TaskDetail }) {
  const [picking, setPicking] = useState(false);
  const move = useWrite((parentId: number | null) => api.update(task.id, { parentId }));
  return (
    <div>
      <div className={labelCls}>親タスク</div>
      {picking ? (
        <TaskPicker
          exclude={new Set([task.id, ...task.childTasks.map((c) => c.id)])}
          placeholder="親にするタスクを検索"
          onPick={(id) => move.mutate(id, { onSuccess: () => setPicking(false) })}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">{task.parentTitle ?? 'なし（トップレベル）'}</span>
          <button type="button" onClick={() => setPicking(true)} className="text-indigo-600 dark:text-indigo-400">
            変更
          </button>
          {task.parentId !== null && (
            <button type="button" onClick={() => move.mutate(null)} className="text-zinc-500">
              外す
            </button>
          )}
        </div>
      )}
    </div>
  );
}
