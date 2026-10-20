// 目標の部品（design 7-15）: 記録を足す（電波がなければ溜める）・記録のボタン・進み具合のバー・最近の期間の帯・今日の画面の1行。

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { currentWord, fmtAmount, goalRuleText, periodCounter } from '../../shared/goals.ts';
import type { Goal, GoalPlan } from '../../shared/types.ts';
import { api } from '../api.ts';
import { currentSum, isAchieved, isLoggable, spanText, statusText } from '../goalView.ts';
import { sendOrQueue } from '../outbox.ts';
import { toast } from '../toast.ts';
import { clientToday, cx, fmtDate } from '../util.ts';
import { LogSheet } from './GoalSheets.tsx';

/**
 * 記録を足す。済んだら「プール ＋1回 → 今週 2/2回 ✓［取り消す］」とお知らせ。つながらなければ端末に溜める。
 * 記録できた（溜めたも含む）ら true
 */
export function useLogGoal() {
  const qc = useQueryClient();
  return async (g: Goal, input: { amount?: number; date?: string; note?: string; planId?: number } = {}): Promise<boolean> => {
    const today = clientToday();
    const amount = input.amount ?? 1;
    const date = input.date ?? today;
    const what = `${g.title} ＋${fmtAmount(amount, g.unit)}${date === today ? '' : `（${fmtDate(date, today)}）`}`;
    const body = { amount, date, note: input.note, planId: input.planId };
    try {
      const d = await sendOrQueue({ kind: 'goalLog', goalId: g.id, title: g.title, unit: g.unit, input: body }, () =>
        api.addGoalLog(g.id, body),
      );
      if (!d) {
        toast(`つながっていないので溜めた: ${what}`);
        return true;
      }
      const added = Math.max(...d.logs.map((l) => l.id));
      toast(`${what} → ${spanText(d, d.logs, date, today)}`, 'info', {
        label: '取り消す',
        run: () =>
          void api
            .deleteGoalLog(g.id, added)
            .then(() => toast('取り消した'))
            .catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error'))
            .finally(() => void qc.invalidateQueries({ queryKey: ['goals'] })),
      });
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      return false;
    } finally {
      void qc.invalidateQueries({ queryKey: ['goals'] });
    }
  };
}

/**
 * 記録のボタン。単位が「回」なら押すだけで ＋1（取り消しはお知らせから）、それ以外は記録のシートを開く。
 * 記録できない目標（始まっていない・終わった・アーカイブ）には出さない
 */
export function LogButton({ g, compact }: { g: Goal; compact?: boolean }) {
  const log = useLogGoal();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!isLoggable(g)) return null;
  const oneTap = g.unit === '回';
  return (
    <>
      <button
        type="button"
        disabled={busy}
        aria-label={oneTap ? `${g.title} を1回記録` : `${g.title} を記録`}
        onClick={() => {
          if (!oneTap) return setOpen(true);
          setBusy(true);
          void log(g, { amount: 1 }).finally(() => setBusy(false));
        }}
        className={cx(
          'shrink-0 rounded-full bg-indigo-600 font-semibold text-white shadow-sm active:scale-95 disabled:opacity-50',
          compact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm',
        )}
      >
        {oneTap ? '＋1' : '＋ 記録'}
      </button>
      {open && <LogSheet g={g} onClose={() => setOpen(false)} />}
    </>
  );
}

/** 進み具合のバー。期限までの目標は、今日までに済んでいたい量に縦線を引く */
export function GoalBar({ g, className }: { g: Goal; className?: string }) {
  const ratio = Math.min(currentSum(g) / g.target, 1);
  const expected = g.kind === 'total' && g.progress.expected !== null ? Math.min(g.progress.expected / g.target, 1) : null;
  return (
    <div className={cx('relative h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800', className)}>
      <div
        className={cx('h-full rounded-full transition-[width]', isAchieved(g) ? 'bg-emerald-500' : 'bg-indigo-500')}
        style={{ width: `${ratio * 100}%` }}
      />
      {expected !== null && expected > 0 && expected < 1 && (
        <div className="absolute inset-y-0 w-0.5 bg-zinc-500 dark:bg-zinc-300" style={{ left: `${expected * 100}%` }} title="今日までの予定" />
      )}
    </div>
  );
}

/**
 * 最近の期間の帯（一覧のカード）: 週・月ごとは最近8期間、1日ごとは最近14日。達成＝緑・届かなかった＝灰・今の期間＝藍の枠。
 * 期限までの目標には出さない
 */
export function GoalStrip({ g }: { g: Goal }) {
  if (g.kind !== 'rate' || !g.period) return null;
  const spans = g.progress.history.slice(g.period === 'day' ? -14 : -8);
  if (!spans.length) return null;
  const current = g.progress.current?.from;
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {spans.map((s) => (
        <span
          key={s.from}
          className={cx(
            'h-2.5 rounded-sm',
            g.period === 'day' ? 'w-2.5' : 'w-4',
            s.achieved ? 'bg-emerald-500' : s.from === current ? 'bg-indigo-200 dark:bg-indigo-900' : 'bg-zinc-200 dark:bg-zinc-700',
            s.from === current && 'ring-1 ring-indigo-500',
          )}
        />
      ))}
    </div>
  );
}

/** 連続達成の一言（2以上のとき）: 🔥 6週連続 */
export function streakText(g: Goal): string | null {
  if (g.kind !== 'rate' || !g.period || g.progress.streak < 2) return null;
  return `🔥 ${g.progress.streak}${periodCounter(g.period)}連続`;
}

/** 進み具合の数: 今週 1/2回・135/320ページ */
export function sumText(g: Goal): string {
  const word = g.kind === 'rate' && g.period ? `${currentWord(g.period)} ` : '';
  return `${word}${currentSum(g)}/${fmtAmount(g.target, g.unit)}`;
}

/**
 * 今日の画面の1行: 名前・目標の言い方・進み具合と状態・今日のやる時間（まだのもの）・バー（押すと詳細へ）・記録のボタン。
 * 記録すると、今日のまだのやる時間のうち最初のものが済になる（サーバが結ぶ）
 */
export function GoalTodayRow({ g, plans = [] }: { g: Goal; plans?: GoalPlan[] }) {
  const today = clientToday();
  const done = isAchieved(g);
  const streak = streakText(g);
  const next = plans.filter((p) => !p.done);
  return (
    <div className="flex items-center gap-3 border-b border-zinc-200/70 px-3.5 py-3 last:border-b-0 dark:border-zinc-800">
      <Link to={`/goals/${g.id}`} className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{g.title}</span>
          <span className="shrink-0 text-xs text-zinc-400">{goalRuleText(g)}</span>
        </div>
        <div className="mt-0.5 flex items-baseline gap-2 text-xs">
          <span className={cx('shrink-0 font-semibold tabular-nums', done ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-700 dark:text-zinc-200')}>
            {sumText(g)}
          </span>
          <span className={cx('truncate', done ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500')}>{statusText(g, today)}</span>
          {streak && <span className="shrink-0 text-amber-600 dark:text-amber-400">{streak}</span>}
        </div>
        {next.length > 0 && (
          <div className="mt-0.5 truncate text-xs text-emerald-700 dark:text-emerald-300">
            🗓 {next.map((p) => p.start ?? '時刻なし').join('・')} にやる
          </div>
        )}
        <GoalBar g={g} className="mt-1.5 h-1.5" />
      </Link>
      <LogButton g={g} compact />
    </div>
  );
}
