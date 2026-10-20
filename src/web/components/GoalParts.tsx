// 目標の部品（design 7-15）: 記録を足す（電波がなければ溜める）・進み具合のバー・最近の期間・今日の画面の1行。

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { fmtAmount, goalRuleText, progressText, round } from '../../shared/goals.ts';
import type { Goal, GoalSpan } from '../../shared/types.ts';
import { api } from '../api.ts';
import { sendOrQueue } from '../outbox.ts';
import { toast } from '../toast.ts';
import { clientToday, cx } from '../util.ts';

/** 達成したか（期間ごとは今の期間・期限までは合計） */
export function isAchieved(g: Goal): boolean {
  return g.kind === 'rate' ? !!g.progress.current?.achieved : g.progress.sum >= g.target;
}

/** 今の期間（期限までは全体）の合計 */
export function currentSum(g: Goal): number {
  return g.kind === 'rate' ? (g.progress.current?.sum ?? 0) : g.progress.sum;
}

/** 記録を足す。済んだら「＋1回 → 今週 2/2回 ✓」と［取り消す］をお知らせ。つながらなければ端末に溜める */
export function useLogGoal() {
  const qc = useQueryClient();
  return async (g: Goal, input: { amount?: number; date?: string; note?: string } = {}) => {
    const amount = input.amount ?? 1;
    const date = input.date ?? clientToday();
    try {
      const d = await sendOrQueue(
        { kind: 'goalLog', goalId: g.id, title: g.title, unit: g.unit, input: { amount, date, note: input.note } },
        () => api.addGoalLog(g.id, { amount, date, note: input.note }),
      );
      if (!d) {
        toast(`つながっていないので溜めた: ${g.title} ＋${fmtAmount(amount, g.unit)}`);
        return;
      }
      const added = Math.max(...d.logs.map((l) => l.id));
      toast(`${g.title} ＋${fmtAmount(amount, g.unit)} → ${progressText(d, d.progress)}`, 'info', {
        label: '取り消す',
        run: () =>
          void api
            .deleteGoalLog(g.id, added)
            .then(() => toast('取り消した'))
            .catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error'))
            .finally(() => void qc.invalidateQueries({ queryKey: ['goals'] })),
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      void qc.invalidateQueries({ queryKey: ['goals'] });
    }
  };
}

/** 進み具合のバー。期限までの目標は、今日までに済んでいたい量に縦線を引く */
export function GoalBar({ g, className }: { g: Goal; className?: string }) {
  const ratio = Math.min(currentSum(g) / g.target, 1);
  const expected = g.kind === 'total' && g.progress.expected !== null ? Math.min(g.progress.expected / g.target, 1) : null;
  return (
    <div className={cx('relative h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800', className)}>
      <div
        className={cx('h-full rounded-full', isAchieved(g) ? 'bg-emerald-500' : 'bg-indigo-500')}
        style={{ width: `${ratio * 100}%` }}
      />
      {expected !== null && expected > 0 && expected < 1 && (
        <div className="absolute inset-y-0 w-0.5 bg-zinc-500 dark:bg-zinc-300" style={{ left: `${expected * 100}%` }} title="今日までの予定" />
      )}
    </div>
  );
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/**
 * 最近の期間。1日ごとはマス（達成＝濃い緑・少しでも＝薄い緑）、週・月は棒（目標の高さに線・今の期間は藍の枠）
 */
export function GoalHistory({ g }: { g: Goal }) {
  const spans = g.progress.history;
  if (!spans.length || !g.period) return null;
  const tip = (s: GoalSpan) => `${s.from === s.to ? md(s.from) : `${md(s.from)}〜${md(s.to)}`} ${fmtAmount(s.sum, g.unit)}`;
  const isCurrent = (s: GoalSpan) => g.progress.current?.from === s.from;
  if (g.period === 'day') {
    return (
      <div className="flex flex-wrap gap-1" aria-label="最近の28日">
        {spans.map((s) => (
          <span
            key={s.from}
            title={tip(s)}
            className={cx(
              'size-4 rounded-sm',
              s.achieved ? 'bg-emerald-500' : s.sum > 0 ? 'bg-emerald-200 dark:bg-emerald-900' : 'bg-zinc-200 dark:bg-zinc-800',
              isCurrent(s) && 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-zinc-900',
            )}
          />
        ))}
      </div>
    );
  }
  // 棒の高さは目標の 1.5 倍までを 100% にする（目標の線は 2/3 の高さ）
  const top = g.target * 1.5;
  return (
    <div>
      <div className="relative flex h-16 items-end gap-1">
        <div className="absolute inset-x-0 border-t border-dashed border-zinc-400 dark:border-zinc-600" style={{ bottom: `${(g.target / top) * 100}%` }} />
        {spans.map((s) => (
          <div key={s.from} title={tip(s)} className="flex h-full flex-1 items-end">
            <div
              className={cx(
                'w-full rounded-t-sm',
                s.achieved ? 'bg-emerald-500' : 'bg-indigo-300 dark:bg-indigo-800',
                isCurrent(s) && !s.achieved && 'bg-indigo-500 dark:bg-indigo-500',
              )}
              style={{ height: `${Math.max((Math.min(s.sum, top) / top) * 100, s.sum > 0 ? 6 : 2)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-zinc-400">
        {spans.map((s, i) => (
          <span key={s.from} className="flex-1 truncate text-center">
            {i === 0 || i === spans.length - 1 || i % 4 === 0 ? (g.period === 'month' ? `${Number(s.from.slice(5, 7))}月` : md(s.from)) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * 記録のボタン。単位が「回」なら押すだけで＋1、それ以外は量を入れる欄を開く（Enter で記録・Esc で閉じる）
 */
export function QuickLog({ g, compact }: { g: Goal; compact?: boolean }) {
  const log = useLogGoal();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (amount?: number) => {
    setBusy(true);
    await log(g, { amount });
    setBusy(false);
    setOpen(false);
    setValue('');
  };
  const btn = cx(
    'shrink-0 rounded-md border border-indigo-300 px-2.5 py-1 text-sm font-medium text-indigo-600 active:scale-95 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-400',
    compact && 'py-0.5 text-xs',
  );
  if (g.unit === '回') {
    return (
      <button type="button" className={btn} disabled={busy} onClick={() => void run(1)}>
        ＋1
      </button>
    );
  }
  if (!open) {
    return (
      <button type="button" className={btn} onClick={() => setOpen(true)} aria-label={`${g.title} を記録`}>
        ＋
      </button>
    );
  }
  const n = Number(value);
  const ok = value.trim() !== '' && Number.isFinite(n) && n > 0;
  return (
    <form
      className="flex shrink-0 items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) void run(n);
      }}
    >
      <input
        autoFocus
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        placeholder={g.period === 'day' ? String(round(Math.max(g.target - g.progress.todaySum, 1))) : '量'}
        className="w-16 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-base outline-none focus:border-indigo-500 md:text-sm dark:border-zinc-700"
      />
      <span className="text-xs text-zinc-500">{g.unit}</span>
      <button type="submit" disabled={!ok || busy} className={btn}>
        記録
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-1 text-zinc-400" aria-label="閉じる">
        ×
      </button>
    </form>
  );
}

/** 今日の画面の1行: 名前・目標の言い方・進み具合・バー・記録のボタン */
export function GoalTodayRow({ g }: { g: Goal }) {
  const done = isAchieved(g);
  return (
    <div className="flex items-center gap-3 border-b border-zinc-200/70 px-3.5 py-2.5 last:border-b-0 dark:border-zinc-800">
      <Link to="/goals" className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{g.title}</span>
          <span className="shrink-0 text-xs text-zinc-400">{goalRuleText(g)}</span>
        </div>
        <div className={cx('mt-0.5 text-xs', done ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-zinc-500')}>
          {progressText(g, g.progress)}
          {g.kind === 'rate' && g.progress.streak > 1 && <span className="ml-1.5 text-amber-600 dark:text-amber-400">🔥{g.progress.streak}</span>}
        </div>
        <GoalBar g={g} className="mt-1.5 h-1.5" />
      </Link>
      <QuickLog g={g} compact />
    </div>
  );
}
