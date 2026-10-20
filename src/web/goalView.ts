// 目標の画面の見せ方（design 7-15）。純粋関数: 期間の呼び方・今の状態の一言・記録したあとの見込み・量のチップ・
// 月のカレンダー・記録の一覧のまとめ方。進み具合そのものは shared/goals.ts（サーバと同じ計算）。

import { addDays, diffDays } from '../shared/dates.ts';
import { fmtAmount, goalProgress, logFrom, paceText, periodEnd, periodStart, round, type GoalRule } from '../shared/goals.ts';
import type { Goal, GoalPeriod, GoalSpan } from '../shared/types.ts';
import { monthGrid } from './board/logic.ts';
import { fmtDate } from './util.ts';

type Log = { date: string; amount: number; note?: string };

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 期間の呼び方: 今日・昨日・10/18(土)／今週・先週・10/5〜10/11／今月・先月・9月（年が違えば 2025年12月） */
export function spanLabel(period: GoalPeriod, from: string, today: string): string {
  if (period === 'day') return fmtDate(from, today);
  if (period === 'week') {
    const cur = periodStart('week', today);
    if (from === cur) return '今週';
    if (from === addDays(cur, -7)) return '先週';
    return `${md(from)}〜${md(addDays(from, 6))}`;
  }
  return monthLabel(from, today);
}

/** 月の呼び方: 今月・先月・9月（年が違えば 2025年12月） */
export function monthLabel(date: string, today: string): string {
  const cur = periodStart('month', today);
  const from = periodStart('month', date);
  if (from === cur) return '今月';
  if (from === periodStart('month', addDays(cur, -1))) return '先月';
  const [y, m] = from.split('-').map(Number) as [number, number];
  return y === Number(today.slice(0, 4)) ? `${m}月` : `${y}年${m}月`;
}

/** 週の範囲 10/19〜10/25 */
export function weekRange(from: string): string {
  return `${md(from)}〜${md(addDays(from, 6))}`;
}

/** 日付を含む期間（期限までの目標は 数え始める日〜期限）とその合計 */
export function spanAt(g: GoalRule, logs: Log[], date: string): GoalSpan {
  const rate = g.kind === 'rate' && g.period;
  const from = rate ? periodStart(g.period!, date) : g.startDate;
  const to = rate ? periodEnd(g.period!, date) : (g.endDate ?? date);
  const sum = round(logs.filter((l) => l.date >= from && l.date <= to).reduce((s, l) => s + l.amount, 0));
  return { from, to, sum, achieved: sum >= g.target };
}

/** その日に記録できるか（サーバと同じ決まり: 先の日付と、記録できるいちばん前の日より前は断る） */
export function canLogOn(g: GoalRule, date: string, today: string): boolean {
  return date >= logFrom(g) && date <= today;
}

/** 今の期間の見出し: 今週 10/19〜10/25・今日 10/20(火)・今月・10/1〜11/14（残り26日） */
export function currentHeading(g: Goal, today: string): string {
  const p = g.progress;
  if (g.kind === 'rate' && g.period) {
    const from = p.current?.from ?? periodStart(g.period, today);
    if (g.period === 'week') return `${spanLabel('week', from, today)} ${weekRange(from)}`;
    if (g.period === 'day') return `今日 ${md(today)}`;
    return spanLabel('month', from, today);
  }
  return `${md(g.startDate)}〜${md(g.endDate ?? today)}${p.daysLeft ? `（残り${p.daysLeft}日）` : ''}`;
}

/** 今の期間（期限までは全体）の合計 */
export function currentSum(g: Goal): number {
  return g.kind === 'rate' ? (g.progress.current?.sum ?? 0) : g.progress.sum;
}

/** 達成したか（期間ごとは今の期間・期限までは全体） */
export function isAchieved(g: Goal): boolean {
  return g.kind === 'rate' ? !!g.progress.current?.achieved : g.progress.sum >= g.target;
}

/** 今日の画面・一覧・詳細から記録を足せるか（始まっている・終わっていない・アーカイブしていない） */
export function isLoggable(g: Goal): boolean {
  return !g.archived && !g.progress.notStarted && !g.progress.ended;
}

/** 今の状態の一言: あと 1回（残り5日）・達成 ✓・予定より 11 遅れ・1日 7.2ページ で間に合う */
export function statusText(g: Goal, today: string): string {
  const p = g.progress;
  if (p.notStarted) return `${fmtDate(g.startDate, today)} から数える`;
  if (g.kind === 'rate' && g.period) {
    if (!p.current) return '終わった';
    if (p.current.achieved) return '達成 ✓';
    const rest = `あと ${fmtAmount(round(g.target - p.current.sum), g.unit)}`;
    return g.period === 'day' ? rest : `${rest}（残り${diffDays(p.current.to, today) + 1}日）`;
  }
  if (p.sum >= g.target) return '達成 ✓';
  if (p.ended) return '期限を過ぎた';
  return `${paceText(p)}${p.perDay !== null ? `・1日 ${fmtAmount(p.perDay, g.unit)} で間に合う` : ''}`;
}

/** その日を含む期間の今の状態: 今週 1/2回・10/18(土) 30/30語 ✓・135/320ページ（予定より 11 遅れ） */
export function spanText(g: GoalRule, logs: Log[], date: string, today: string): string {
  if (g.kind === 'rate' && g.period) {
    const s = spanAt(g, logs, date);
    return `${spanLabel(g.period, s.from, today)} ${s.sum}/${fmtAmount(g.target, g.unit)}${s.achieved ? ' ✓' : ''}`;
  }
  const p = goalProgress(g, logs, today);
  return `${p.sum}/${fmtAmount(g.target, g.unit)}${p.sum >= g.target ? ' ✓' : `（${paceText(p)}）`}`;
}

export interface LogPreview {
  text: string;
  achieved: boolean;
  /** この記録でちょうど達成する */
  justAchieved: boolean;
}

/** 記録する前に見せる「記録したらこうなる」: 今週 2/2回 ✓ 達成・今日 25/30語・あと 5語・150/320ページ（予定より 4 遅れ） */
export function previewLog(g: GoalRule, logs: Log[], today: string, add: { date: string; amount: number }): LogPreview {
  const before = spanAt(g, logs, add.date);
  const after = round(before.sum + add.amount);
  const achieved = after >= g.target;
  const justAchieved = achieved && !before.achieved;
  const target = fmtAmount(g.target, g.unit);
  if (g.kind === 'rate' && g.period) {
    const label = spanLabel(g.period, before.from, today);
    const rest = achieved ? ' ✓ 達成' : `・あと ${fmtAmount(round(g.target - after), g.unit)}`;
    return { text: `${label} ${after}/${target}${rest}`, achieved, justAchieved };
  }
  const p = goalProgress(g, [...logs, add], today);
  return { text: `${p.sum}/${target}${achieved ? ' ✓ 達成' : `（${paceText(p)}）`}`, achieved, justAchieved };
}

/** 量のチップ: あと N で達成（期間ごと）・1日の目安 N（期限まで）・前回と同じ N。logs は新しい順。同じ量は1つに */
export function amountChips(g: Goal, logs: Log[], date: string): { label: string; value: number }[] {
  const chips: { label: string; value: number }[] = [];
  if (g.kind === 'rate') {
    const rest = round(g.target - spanAt(g, logs, date).sum);
    if (rest > 0) chips.push({ label: `あと ${rest} で達成`, value: rest });
  } else if (g.progress.perDay !== null) {
    chips.push({ label: `1日の目安 ${g.progress.perDay}`, value: g.progress.perDay });
  }
  if (logs[0]) chips.push({ label: `前回と同じ ${round(logs[0].amount)}`, value: logs[0].amount });
  return chips.filter((c, i) => chips.findIndex((x) => x.value === c.value) === i);
}

export interface CalDay {
  date: string;
  /** 表示している月の日か（前後の月の日は薄く） */
  inMonth: boolean;
  sum: number;
  /** 1日ごとの目標で、その日に届いた */
  achieved: boolean;
  /** 押して記録できる（数え始める前と先の日は押せない） */
  loggable: boolean;
  isToday: boolean;
}

export interface CalWeek {
  days: CalDay[];
  /** 週ごとの目標だけ: その週の合計（数える範囲の外の週は null） */
  sum: number | null;
  achieved: boolean;
  /** 今の週（まだ途中） */
  current: boolean;
}

/** 月のカレンダー（月曜はじまり・前後の月の日も含めて週単位）。offset=0 が今月 */
export function goalCalendar(g: GoalRule, logs: Log[], today: string, offset: number) {
  const { month, first, dates } = monthGrid(today, offset);
  const byDate = new Map<string, number>();
  for (const l of logs) byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.amount);
  const from = logFrom(g);
  const last = g.endDate && g.endDate < today ? g.endDate : today;
  const weeks: CalWeek[] = [];
  for (let i = 0; i < dates.length; i += 7) {
    const days = dates.slice(i, i + 7).map((date) => {
      const sum = round(byDate.get(date) ?? 0);
      return {
        date,
        inMonth: date.slice(0, 7) === month,
        sum,
        achieved: g.period === 'day' && sum >= g.target,
        loggable: canLogOn(g, date, today),
        isToday: date === today,
      };
    });
    const ws = days[0]!.date;
    const we = days[6]!.date;
    const counted = g.kind === 'rate' && g.period === 'week' && we >= from && ws <= last;
    const sum = counted ? round(days.reduce((s, d) => s + d.sum, 0)) : null;
    weeks.push({ days, sum, achieved: sum !== null && sum >= g.target, current: ws <= today && today <= we });
  }
  const [y, m] = first.split('-').map(Number) as [number, number];
  const monthSum = round(logs.filter((l) => l.date.slice(0, 7) === month).reduce((s, l) => s + l.amount, 0));
  return { month, title: `${y}年${m}月`, weeks, monthSum };
}

/** カレンダーで戻れるいちばん前の月（今月から数えて何か月前か・0 以下） */
export function minMonthOffset(g: GoalRule, today: string): number {
  const [y0, m0] = logFrom(g).split('-').map(Number) as [number, number];
  const [y1, m1] = today.split('-').map(Number) as [number, number];
  return Math.min((y0 - y1) * 12 + (m0 - m1), 0);
}

export interface DayRow {
  date: string;
  sum: number;
  /** 一言（空は除く） */
  notes: string[];
  count: number;
  /** 1日ごとの目標で、その日に届いた */
  achieved: boolean;
}

export interface LogGroup {
  key: string;
  /** 今週・先週・10/5〜10/11・今月・9月 */
  label: string;
  /** 今週・先週のときの日付の範囲 */
  range: string | null;
  /** 見出しの右: 2/2回 ✓・達成 5/7日・135ページ */
  summary: string;
  achieved: boolean;
  days: DayRow[];
}

/**
 * 記録の一覧のまとめ方（新しい順）。週ごと・月ごとの目標はその期間で、1日ごとの目標は週で、期限までの目標は月でまとめ、
 * 中は日ごと（同じ日の記録は合計して一言を並べる）。期間ごとの目標は、記録がなくても今の期間を先頭に出す
 */
export function groupLogs(g: GoalRule, logs: Log[], today: string): LogGroup[] {
  const groupBy: GoalPeriod = g.kind === 'rate' && g.period !== 'day' ? g.period! : g.kind === 'rate' ? 'week' : 'month';
  const days = new Map<string, DayRow>();
  for (const l of logs) {
    const d = days.get(l.date) ?? { date: l.date, sum: 0, notes: [], count: 0, achieved: false };
    d.sum = round(d.sum + l.amount);
    d.count++;
    if (l.note?.trim()) d.notes.push(l.note.trim());
    days.set(l.date, d);
  }
  for (const d of days.values()) d.achieved = g.period === 'day' && d.sum >= g.target;
  const groups = new Map<string, DayRow[]>();
  const live = g.kind === 'rate' && g.startDate <= today && !(g.endDate && g.endDate < today);
  if (live) groups.set(periodStart(groupBy, today), []);
  for (const d of [...days.values()].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    const key = periodStart(groupBy, d.date);
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const from = logFrom(g);
  return [...groups]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, rows]) => {
      const sum = round(rows.reduce((s, d) => s + d.sum, 0));
      const label = groupBy === 'week' ? spanLabel('week', key, today) : monthLabel(key, today);
      const range = groupBy === 'week' && (label === '今週' || label === '先週') ? weekRange(key) : null;
      if (g.kind === 'rate' && g.period === 'day') {
        // 1日ごと: その週に数えた日（記録できる日のうち今日まで）のうち、届いた日の数
        let counted = 0;
        for (let d = key; d <= addDays(key, 6); d = addDays(d, 1)) if (d >= from && d <= today) counted++;
        const n = rows.filter((d) => d.achieved).length;
        return { key, label, range, summary: `達成 ${n}/${counted}日`, achieved: counted > 0 && n === counted, days: rows };
      }
      if (g.kind === 'rate') {
        const achieved = sum >= g.target;
        return { key, label, range, summary: `${sum}/${fmtAmount(g.target, g.unit)}${achieved ? ' ✓' : ''}`, achieved, days: rows };
      }
      return { key, label, range, summary: fmtAmount(sum, g.unit), achieved: false, days: rows };
    });
}
