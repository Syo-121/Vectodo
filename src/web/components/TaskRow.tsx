// タスクの1行（今日・一覧・未整理など）。完了ボタンと小さい印（TaskMeta）はボードのカードでも使う。

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { STATUS_LABEL } from '../../shared/constants.ts';
import type { Category, Task } from '../../shared/types.ts';
import { api, useWrite } from '../api.ts';
import { useOpenTask } from '../nav.ts';
import { toast } from '../toast.ts';
import { cx, fmtDate, fmtMin, isDimmed, isOpenTask, PRIORITY_RING } from '../util.ts';

/** 完了したときに聞く「かかった時間」の選択肢 */
const ACTUAL_CHOICES: [number, string][] = [
  [5, '5m'],
  [15, '15m'],
  [30, '30m'],
  [60, '1h'],
  [120, '2h'],
  [240, '4h'],
];

/** 完了の切り替え（押した瞬間に見た目だけ先に変える） */
export function useToggleDone(t: Task) {
  const qc = useQueryClient();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const write = useWrite((done: boolean) => api.update(t.id, { status: done ? 'done' : 'todo' }));
  const done = optimistic ?? t.status === 'done';
  const refresh = () => qc.invalidateQueries({ queryKey: ['tasks'] });

  const toggle = () => {
    const next = !done;
    setOptimistic(next);
    write.mutate(next, {
      onSuccess: () => {
        if (!next) return;
        // かかった時間（design 4-12）: 押せば残す・押さなければ何も残らない
        const actual = ACTUAL_CHOICES.map(([m, label]) => ({
          label,
          chip: true,
          run: () =>
            void api
              .update(t.id, { actualMin: m })
              .then(() => toast(`${t.code} の実績 ${label} を残した`))
              .then(refresh),
        }));
        // 繰り返しは次の回ができているので「元に戻す」は出さない（戻すと未完了が2つになる）
        if (t.recurrence) toast(`${t.code} 完了（次の回を作った）・かかった時間は？`, 'info', actual, 8000);
        else
          toast(`${t.code} 完了・かかった時間は？`, 'info', [
            ...actual,
            { label: '元に戻す', run: () => void api.update(t.id, { status: 'todo' }).then(refresh) },
          ], 8000);
      },
      onSettled: () => setOptimistic(null),
    });
  };
  return { done, toggle };
}

export function DoneButton({ task: t, done, onToggle }: { task: Task; done: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={done ? '未完了に戻す' : '完了にする'}
      className={cx(
        // 見た目は 20px のまま、指で押せる範囲だけ周りに広げる
        'relative mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition before:absolute before:-inset-2',
        t.priority ? PRIORITY_RING[t.priority] : 'border-zinc-400 dark:border-zinc-500',
        done && 'border-emerald-500 bg-emerald-500 text-white',
      )}
    >
      {done && <span className="text-[11px] leading-none">✓</span>}
    </button>
  );
}

export interface MetaOptions {
  showParent?: boolean;
  carriedOver?: boolean;
  /** 列の見出しで分かっている項目は出さない（カンバンのカテゴリ列など） */
  hideCategory?: boolean;
  /** 週ビューでは、その日の時間を別に出すのでやる日は出さない */
  hideDoDates?: boolean;
}

export function TaskMeta({
  task: t,
  today,
  categories,
  showParent,
  carriedOver,
  hideCategory,
  hideDoDates,
}: { task: Task; today: string; categories: Map<number, Category> } & MetaOptions) {
  const cat = t.categoryId !== null ? categories.get(t.categoryId) : undefined;
  const waitingOn = t.dependsOn.filter((d) => d.status !== 'done' && d.status !== 'canceled');
  const upcoming = t.doDates.filter((d) => d.date >= today);
  const shownDates = (upcoming.length ? upcoming : t.doDates.slice(-1)).slice(0, 2);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="text-zinc-400 dark:text-zinc-500">{t.code}</span>
      {showParent && t.parentTitle && <span className="max-w-full truncate">↳ {t.parentTitle}</span>}
      {cat && !hideCategory && (
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full" style={{ background: cat.color }} />
          {cat.name}
        </span>
      )}
      {t.status === 'doing' && <span className="font-medium text-indigo-600 dark:text-indigo-400">進行中</span>}
      {t.status === 'waiting' && <span>⏳ {STATUS_LABEL.waiting}</span>}
      {t.status === 'canceled' && <span>中止</span>}
      {carriedOver && <span className="text-amber-600 dark:text-amber-400">持ち越し</span>}
      {t.dueDate && (
        <span
          className={cx(
            isOpenTask(t) && t.dueDate < today && 'font-medium text-red-600 dark:text-red-400',
            isOpenTask(t) && t.dueDate === today && 'font-medium text-orange-600 dark:text-orange-400',
          )}
          title={t.dueFrom ? `シリーズ「${t.dueFrom.title}」の締切` : undefined}
        >
          ⏰ {fmtDate(t.dueDate, today)}
          {t.dueTime && ` ${t.dueTime}`}
          {t.dueFrom && '（親）'}
        </span>
      )}
      {!hideDoDates && shownDates.length > 0 && (
        <span>
          📅{' '}
          {shownDates
            .map((d) => fmtDate(d.date, today) + (d.start ? ` ${d.start}〜` : '') + (d.minutes ? ` ${fmtMin(d.minutes)}` : ''))
            .join(', ')}
          {upcoming.length > 2 && ` ほか${upcoming.length - 2}`}
        </span>
      )}
      {t.estimateMin && <span>⏱ {fmtMin(t.estimateMin)}</span>}
      {t.actualMin && <span>実績 {fmtMin(t.actualMin)}</span>}
      {t.children.total > 0 && (
        <span>
          ☑ {t.children.done}/{t.children.total}
        </span>
      )}
      {t.recurrence && <span>🔁</span>}
      {isOpenTask(t) && waitingOn.length > 0 && (
        <span className="max-w-full truncate">
          ⛓ 待ち: {waitingOn[0]!.code} {waitingOn[0]!.title}
          {waitingOn.length > 1 && ` ほか${waitingOn.length - 1}`}
        </span>
      )}
      {isOpenTask(t) && waitingOn.length === 0 && t.waitVia && (
        <span className="max-w-full truncate">
          ⛓ 親が待ち: {t.waitVia.code} {t.waitVia.title}
        </span>
      )}
    </div>
  );
}

interface Props extends MetaOptions {
  task: Task;
  today: string;
  categories: Map<number, Category>;
  /** 木構造の字下げ */
  depth?: number;
  /** 子を畳む三角（一覧の木で使う） */
  toggle?: { open: boolean; onToggle: () => void };
  /** 行の右側に足すもの（未整理の「今日」「明日」など） */
  actions?: React.ReactNode;
  /** タイトルの下に出す一言（今日の「次にやること」の理由など） */
  note?: React.ReactNode;
}

export function TaskRow({ task: t, today, categories, depth = 0, toggle, actions, note, ...meta }: Props) {
  const openTask = useOpenTask();
  const { done, toggle: toggleDone } = useToggleDone(t);
  const closed = done || t.status === 'canceled';

  return (
    <div
      className={cx(
        // 右に足すボタン（actions）は、スマホではタイトルを潰さないよう下の段に回す
        'group flex flex-col gap-2.5 border-b border-zinc-200/70 py-3 pr-3 last:border-b-0 md:flex-row md:items-start md:gap-3 dark:border-zinc-800',
        isDimmed(t) && 'opacity-50',
      )}
      style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {toggle ? (
          <button
            type="button"
            onClick={toggle.onToggle}
            className="mt-0.5 -mr-1 w-4 shrink-0 text-sm text-zinc-400"
            aria-label={toggle.open ? '畳む' : '開く'}
          >
            {toggle.open ? '▾' : '▸'}
          </button>
        ) : (
          depth > 0 && <span className="-mr-1 w-4 shrink-0" />
        )}
        <DoneButton task={t} done={done} onToggle={toggleDone} />
        <button type="button" onClick={() => openTask(t.id)} className="min-w-0 flex-1 text-left">
          <div className={cx('break-words leading-snug', closed && 'text-zinc-400 line-through')}>{t.title}</div>
          {note}
          <TaskMeta task={t} today={today} categories={categories} {...meta} />
        </button>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-8 md:pl-0">{actions}</div>}
    </div>
  );
}

/** 子が全部終わった親を閉じる（今日の「子が全部終わった」・ボードの「プロジェクト」。親のかかった時間は聞かない・design 4-3） */
export function CloseButton({ task: t }: { task: Task }) {
  const close = useWrite(() => api.update(t.id, { status: 'done' }));
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        close.mutate(undefined, { onSuccess: () => toast(`${t.code} を閉じた`) });
      }}
      className="rounded-md border border-emerald-500 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
    >
      閉じる
    </button>
  );
}

/** ボード用のカード（カンバン・週） */
export function TaskCard({
  task: t,
  today,
  categories,
  badge,
  ...meta
}: { task: Task; today: string; categories: Map<number, Category>; badge?: React.ReactNode } & MetaOptions) {
  const openTask = useOpenTask();
  const { done, toggle } = useToggleDone(t);
  const closed = done || t.status === 'canceled';
  return (
    <div
      onClick={() => openTask(t.id)}
      className={cx(
        'flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700',
        isDimmed(t) && 'opacity-50',
      )}
    >
      <DoneButton task={t} done={done} onToggle={toggle} />
      <div className="min-w-0 flex-1">
        <div className={cx('break-words text-sm leading-snug', closed && 'text-zinc-400 line-through')}>
          {badge}
          {t.title}
        </div>
        <TaskMeta task={t} today={today} categories={categories} showParent {...meta} />
      </div>
    </div>
  );
}
