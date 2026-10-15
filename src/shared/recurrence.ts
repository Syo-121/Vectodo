// 繰り返しの日付計算（設計の正= docs/design.md 4-4）。純粋関数だけを置く。

import { addDays, daysInMonth, isoWeekday } from './dates.ts';

export type RecurrenceRule =
  | { kind: 'weekly'; weekdays: number[] }
  | { kind: 'monthly'; monthDay: number }
  | { kind: 'interval'; intervalDays: number }
  | { kind: 'after_done'; intervalDays: number };

function matches(rule: RecurrenceRule, date: string): boolean {
  if (rule.kind === 'weekly') return rule.weekdays.includes(isoWeekday(date));
  if (rule.kind === 'monthly') {
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    return d === Math.min(rule.monthDay, daysInMonth(y, m));
  }
  return true;
}

/** from 以降（inclusive が false なら from より後）で最初に条件に合う日 */
function scan(rule: RecurrenceRule, from: string, inclusive: boolean): string {
  let d = inclusive ? from : addDays(from, 1);
  for (let i = 0; i < 400; i++) {
    if (matches(rule, d)) return d;
    d = addDays(d, 1);
  }
  throw new Error('繰り返しの次の日付が見つからない');
}

/** 繰り返しを設定したときの最初の回の日付（今日を含む） */
export function firstDate(rule: RecurrenceRule, today: string): string {
  if (rule.kind === 'weekly' || rule.kind === 'monthly') return scan(rule, today, true);
  return today;
}

/**
 * 今の回を完了・中止したときの次の回の日付。常に今日より後になる。
 * - weekly・monthly: 「今の回の日付」と「今日」の遅いほうより後で最初に合う日（サボった回は積まない）
 * - interval: 今の回の日付＋N 日。今日以前なら今日を越えるまで N 日ずつ足す
 * - after_done: 完了した日＋N 日
 */
export function nextDate(
  rule: RecurrenceRule,
  ctx: { current: string | null; today: string; completedOn: string },
): string {
  const { current, today, completedOn } = ctx;
  if (rule.kind === 'after_done') return addDays(completedOn, rule.intervalDays);
  if (rule.kind === 'interval') {
    let d = addDays(current ?? today, rule.intervalDays);
    while (d <= today) d = addDays(d, rule.intervalDays);
    return d;
  }
  const base = current && current > today ? current : today;
  return scan(rule, base, false);
}
