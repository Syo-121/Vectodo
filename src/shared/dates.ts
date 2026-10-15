// 日付は 'YYYY-MM-DD' の文字列で扱う。計算は UTC の Date に載せて行い、タイムゾーンの影響を受けないようにする。
// 「今日」がいつかだけは設定のタイムゾーン（既定 Asia/Tokyo）で決める。

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUtc(s: string): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = toUtc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** a - b（日数） */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / 86_400_000);
}

/** ISO の曜日番号（1=月 … 7=日） */
export function isoWeekday(s: string): number {
  const w = toUtc(s).getUTCDay();
  return w === 0 ? 7 : w;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function maxDate(dates: string[]): string | null {
  return dates.length === 0 ? null : dates.reduce((a, b) => (a > b ? a : b));
}

function parts(tz: string, now: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  });
  return Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
}

export function todayIn(tz: string, now = new Date()): string {
  const p = parts(tz, now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 例: 2026-10-13T15:20:00+09:00 */
export function nowIsoIn(tz: string, now = new Date()): string {
  const p = parts(tz, now);
  const offset = (p.timeZoneName ?? 'GMT').replace('GMT', '') || '+00:00';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`;
}

export interface Clock {
  today(): string;
  now(): string;
}

export function systemClock(tz: string): Clock {
  return { today: () => todayIn(tz), now: () => nowIsoIn(tz) };
}
