import { addDays, diffDays, isoWeekday, todayIn } from '../shared/dates.ts';
import type { Task } from '../shared/types.ts';

export const TZ = 'Asia/Tokyo';
export const clientToday = () => todayIn(TZ);
export { addDays };

const WEEK = ['', '月', '火', '水', '木', '金', '土', '日'];

const RELATIVE: Record<number, string> = { 0: '今日', 1: '明日', [-1]: '昨日' };

/** 10/20(火)。年が違えば年も */
export function fmtMonthDay(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const md = `${m}/${d}(${WEEK[isoWeekday(date)]})`;
  return y === Number(today.slice(0, 4)) ? md : `${y}/${md}`;
}

/** 今日・明日・昨日、それ以外は 10/20(火) */
export function fmtDate(date: string, today: string): string {
  return RELATIVE[diffDays(date, today)] ?? fmtMonthDay(date, today);
}

/** 今日 10/13(火) のように、相対の言い方と日付の両方 */
export function fmtDateLong(date: string, today: string): string {
  const rel = RELATIVE[diffDays(date, today)];
  return rel ? `${rel} ${fmtMonthDay(date, today)}` : fmtMonthDay(date, today);
}

export function fmtMin(m: number): string {
  if (m === 240) return '半日';
  if (m === 480) return '1日+';
  if (m % 60 === 0) return `${m / 60}h`;
  return m > 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}m`;
}

/** 合計の時間 4h10m・45m（見積の「半日」のような丸めはしない） */
export function fmtSpan(m: number): string {
  const h = Math.floor(m / 60);
  return h === 0 ? `${m}m` : m % 60 === 0 ? `${h}h` : `${h}h${m % 60}m`;
}

export const ESTIMATES: [number, string][] = [
  [15, '15m'],
  [30, '30m'],
  [60, '1h'],
  [120, '2h'],
  [240, '半日'],
  [480, '1日+'],
];

export const PRIORITY_RING: Record<number, string> = {
  1: 'border-red-500',
  2: 'border-amber-500',
  3: 'border-sky-500',
};

export function isOpenTask(t: Task): boolean {
  return t.status === 'todo' || t.status === 'doing' || t.status === 'waiting';
}

/** 依存待ち・待ちは薄く表示（design 4-2） */
export function isDimmed(t: Task): boolean {
  return isOpenTask(t) && (t.blocked || t.status === 'waiting');
}

export function cx(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ');
}

/** 行のまとまりを入れる角丸のカード（今日・一覧・受信箱・設定）。中の行は border-b と last:border-b-0 で区切る */
export const CARD =
  'mx-4 rounded-xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900';
