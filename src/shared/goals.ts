// 目標の進み具合（設計の正= docs/design.md 4-13）。純粋関数で、サーバ・MCP の文・画面で同じものを使う。
// rate＝期間ごと（1日・1週〈月曜はじまり〉・1か月に◯◯）、total＝期限までの総量。記録は日付と量だけ。

import { addDays, daysInMonth, diffDays, isoWeekday } from './dates.ts';
import type { GoalPeriod, GoalProgress, GoalSpan } from './types.ts';

/** 進み具合の計算に要る目標の項目 */
export interface GoalRule {
  kind: 'rate' | 'total';
  period: GoalPeriod | null;
  target: number;
  unit: string;
  startDate: string;
  endDate: string | null;
}

/** 画面の「最近の期間」に並べる数（1日なら4週ぶん） */
export const HISTORY_LEN: Record<GoalPeriod, number> = { day: 28, week: 12, month: 12 };

export function periodStart(period: GoalPeriod, date: string): string {
  if (period === 'day') return date;
  if (period === 'week') return addDays(date, 1 - isoWeekday(date));
  return `${date.slice(0, 8)}01`;
}

export function periodEnd(period: GoalPeriod, date: string): string {
  if (period === 'day') return date;
  if (period === 'week') return addDays(periodStart('week', date), 6);
  const [y, m] = date.split('-').map(Number) as [number, number];
  return `${date.slice(0, 8)}${String(daysInMonth(y, m)).padStart(2, '0')}`;
}

/** ひとつ前の期間の始まり */
function prevStart(period: GoalPeriod, start: string): string {
  return periodStart(period, addDays(start, -1));
}

/** 新しく作るときの「数え始める日」の既定: 期間ごとなら今の期間の頭（今週の月曜・今月1日）、期限までなら今日 */
export function defaultStart(kind: 'rate' | 'total', period: GoalPeriod | null, today: string): string {
  return kind === 'rate' && period ? periodStart(period, today) : today;
}

/**
 * 進み具合。logs は日付ごとの量（同じ日が何件あってもよい）。
 * - rate: 今の期間の合計・最近の期間（古い順・今の期間まで）・連続達成（今の期間は達成していれば数え、まだなら飛ばす）・
 *   終わった期間のうち達成した数。数え始める日を含む期間から数える（途中から始めた最初の期間もそのまま数える）。
 * - total: 数え始める日〜期限の合計・今日までに済んでいたい量（日割り）・残りを1日あたりに
 */
export function goalProgress(g: GoalRule, logs: { date: string; amount: number }[], today: string): GoalProgress {
  const todaySum = round(logs.filter((l) => l.date === today).reduce((s, l) => s + l.amount, 0));
  const notStarted = g.startDate > today;
  const ended = g.endDate !== null && g.endDate < today;
  const base: GoalProgress = {
    todaySum,
    notStarted,
    ended,
    current: null,
    history: [],
    streak: 0,
    record: { achieved: 0, total: 0 },
    sum: 0,
    expected: null,
    perDay: null,
    daysLeft: null,
  };

  if (g.kind === 'total' || !g.period) {
    const end = g.endDate ?? today;
    const sum = round(logs.filter((l) => l.date >= g.startDate && l.date <= end).reduce((s, l) => s + l.amount, 0));
    const days = diffDays(end, g.startDate) + 1;
    const elapsed = Math.min(Math.max(diffDays(today, g.startDate) + 1, 0), days);
    const daysLeft = Math.max(diffDays(end, today) + 1, 0);
    const remaining = Math.max(g.target - sum, 0);
    return {
      ...base,
      sum,
      expected: round((g.target * elapsed) / days),
      daysLeft,
      // 1日あたりは切り上げ（これだけやれば間に合う量。10 以上は整数・それより小さければ小数第1位まで）
      perDay: daysLeft > 0 && remaining > 0 ? ceilApprox(remaining / Math.min(daysLeft, days)) : null,
    };
  }

  const period = g.period;
  const byDate = new Map<string, number>();
  for (const l of logs) byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.amount);
  const first = periodStart(period, g.startDate);
  // 最後に数える期間: 終わっていれば終わる日の期間、そうでなければ今の期間
  const last = periodStart(period, ended ? g.endDate! : today);
  const spans: GoalSpan[] = [];
  if (!notStarted) {
    // 期間ごとの合計（新しい順に作って最後に逆にする）
    const sorted = [...byDate].filter(([d]) => d >= first).sort(([a], [b]) => (a < b ? -1 : 1));
    for (let s = last; s >= first; s = prevStart(period, s)) {
      const to = periodEnd(period, s);
      let sum = 0;
      for (const [d, a] of sorted) if (d >= s && d <= to) sum += a;
      sum = round(sum);
      spans.push({ from: s, to, sum, achieved: sum >= g.target });
    }
    spans.reverse();
  }
  const total = round(spans.reduce((s, x) => s + x.sum, 0));
  const current = !notStarted && !ended ? (spans.at(-1) ?? null) : null;
  // 終わった期間（今の期間を除く）
  const closed = current ? spans.slice(0, -1) : spans;
  let streak = current?.achieved ? 1 : 0;
  for (let i = closed.length - 1; i >= 0 && closed[i]!.achieved; i--) streak++;
  return {
    ...base,
    sum: total,
    current,
    history: spans.slice(-HISTORY_LEN[period]),
    streak,
    record: { achieved: closed.filter((x) => x.achieved).length, total: closed.length },
  };
}

/** 小数の誤差を落とす（量は小数第2位まで） */
export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 量の書き方: 2回・10ページ・1.5h（単位が無ければ数だけ） */
export function fmtAmount(n: number, unit: string): string {
  return `${round(n)}${unit}`;
}

const PERIOD_WORD: Record<GoalPeriod, string> = { day: '1日', week: '週', month: '月' };
const CURRENT_WORD: Record<GoalPeriod, string> = { day: '今日', week: '今週', month: '今月' };

/** 目標の言い方: 「週に2回」「1日に10ページ」「12/31 までに 300ページ」 */
export function goalRuleText(g: GoalRule): string {
  if (g.kind === 'rate' && g.period) return `${PERIOD_WORD[g.period]}に${fmtAmount(g.target, g.unit)}`;
  const [, m, d] = (g.endDate ?? '').split('-').map(Number);
  return `${m}/${d} までに ${fmtAmount(g.target, g.unit)}`;
}

/** 今の期間の呼び方（今日・今週・今月） */
export function currentWord(period: GoalPeriod): string {
  return CURRENT_WORD[period];
}

/** 期間の数え方（連続達成・達成した数）: 日・週・か月 */
export function periodCounter(period: GoalPeriod): string {
  return period === 'day' ? '日' : period === 'week' ? '週' : 'か月';
}

/**
 * 進み具合の一言（今日の画面・MCP）。rate は「今週 1/2回」、total は「120/300ページ（予定より 20 遅れ）」。
 * 達成したら ✓、始まっていない・終わったものはそう書く
 */
export function progressText(g: GoalRule, p: GoalProgress): string {
  if (p.notStarted) return `${g.startDate} から`;
  if (g.kind === 'rate' && g.period) {
    if (!p.current) return `終わった（達成 ${p.record.achieved}/${p.record.total}${periodCounter(g.period)}）`;
    return `${CURRENT_WORD[g.period]} ${round(p.current.sum)}/${fmtAmount(g.target, g.unit)}${p.current.achieved ? ' ✓' : ''}`;
  }
  const head = `${round(p.sum)}/${fmtAmount(g.target, g.unit)}`;
  if (p.sum >= g.target) return `${head} ✓`;
  if (p.ended) return `${head}（期限を過ぎた）`;
  return `${head}（${paceText(p)}）`;
}

/** total のペース: 予定どおり・予定より 20 遅れ・予定より 5 先 */
export function paceText(p: GoalProgress): string {
  const diff = p.sum - (p.expected ?? 0);
  if (Math.abs(diff) < 0.5) return '予定どおり';
  return diff < 0 ? `予定より ${approx(-diff)} 遅れ` : `予定より ${approx(diff)} 先`;
}

/** 目安の数: 10 以上は整数、それより小さければ小数第1位まで */
function approx(n: number): number {
  return n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
}

function ceilApprox(n: number): number {
  return n >= 10 ? Math.ceil(n) : Math.ceil(n * 10) / 10;
}
