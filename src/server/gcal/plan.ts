// Google カレンダー同期の「どの予定をどうするか」を決める純粋関数（設計の正= docs/design.md 4-7）。
// 通信はしない（sync.ts が実行する）。

import { PRIORITY_LABEL } from '../../shared/constants.ts';
import { addDays, isoWeekday } from '../../shared/dates.ts';
import { PLACE_DEFAULT_MIN } from '../../shared/flow.ts';
import { formatTaskCode } from '../../shared/ids.ts';
import type { Category, Task } from '../../shared/types.ts';

type When = { date: string } | { dateTime: string; timeZone: string };

/** Google に送る予定の中身（この JSON を丸ごと比べて、変わったときだけ送る） */
export interface EventSpec {
  calendarId: string;
  summary: string;
  description: string;
  start: When;
  end: When;
  colorId: string;
  /** 通知（ポップアップ）。開始の何分前か */
  reminders: number[];
}

/** あるべき予定1件。slot は 'due'（締切）か 'do:YYYY-MM-DD'（やる日） */
export interface Desired {
  key: string;
  taskId: number;
  slot: string;
  date: string;
  /** 完了・中止したタスクの予定（作り直さず、あるものを【済】【中止】にするだけ） */
  closed: boolean;
  spec: EventSpec;
}

/** 送ったことのある予定（gcal_events の1行） */
export interface SyncedRow {
  taskId: number;
  slot: string;
  date: string;
  calendarId: string;
  eventId: string;
  sent: string;
}

export type Action =
  | { type: 'create'; want: Desired }
  | { type: 'update'; want: Desired; row: SyncedRow }
  | { type: 'delete'; row: SyncedRow }
  /** 過去の予定は消さずに、覚えておくのだけやめる */
  | { type: 'forget'; row: SyncedRow };

export interface PlanContext {
  today: string;
  categories: Map<number, Category>;
  /** カテゴリに書き込み先が無いときのカレンダー */
  defaultCalendarId: string;
  /** 予定の説明欄に載せる、タスクを開くリンクの頭（例 https://…:5180）。null なら載せない */
  appUrl: string | null;
  timezone: string;
}

export const keyOf = (taskId: number, slot: string) => `${taskId}|${slot}`;
export const sentOf = (spec: EventSpec) => JSON.stringify(spec);

const WD = ['', '月', '火', '水', '木', '金', '土', '日'];
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}(${WD[isoWeekday(d)]})`;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function fmtMin(m: number): string {
  if (m === 240) return '半日';
  if (m === 480) return '1日+';
  if (m >= 60 && m % 60 === 0) return `${m / 60}h`;
  if (m > 60) return `${Math.floor(m / 60)}h${m % 60}m`;
  return `${m}m`;
}

/** 終日の予定の通知: 前日 20:00（終日は 0:00 から数えるので 240 分前） */
const ALL_DAY_REMINDERS = [240];
/** 時刻を決めたやる日（今日の流れの空きに置いたもの）の通知: 始まる5分前 */
const BLOCK_REMINDERS = [5];


function description(t: Task, ctx: PlanContext, extra: string[]): string {
  const cat = t.categoryId !== null ? ctx.categories.get(t.categoryId) : undefined;
  const lines = [`タスクID: ${formatTaskCode(t.id)}（Vectodo で管理）`];
  // 2行目はダッシュボードが読む形（優先度: 高・見積 2h）
  const pri = t.priority ? PRIORITY_LABEL[t.priority] : null;
  const est = t.estimateMin ? `見積 ${fmtMin(t.estimateMin)}` : null;
  if (pri || est) lines.push([pri && `優先度: ${pri}`, est].filter(Boolean).join('・'));
  if (cat) lines.push(`カテゴリ: ${cat.name}`);
  lines.push(...extra);
  if (ctx.appUrl) lines.push(`${ctx.appUrl}/list?t=${t.id}`);
  return lines.join('\n');
}

/**
 * タスク1件のあるべき予定（締切1件＋やる日ごとに1件。やる日が締切と同じ日なら締切の予定にまとめる）。
 * 時刻を決めたやる日は、締切と同じ日でも別に「その時刻から配分時間（無ければ見積）」の予定にする（design 4-11）
 */
export function desiredFor(t: Task, ctx: PlanContext): Desired[] {
  const closed = t.status === 'done' || t.status === 'canceled';
  const prefix = t.status === 'done' ? '【済】' : t.status === 'canceled' ? '【中止】' : '';
  const cat = t.categoryId !== null ? ctx.categories.get(t.categoryId) : undefined;
  const calendarId = cat?.gcalCalendarId || ctx.defaultCalendarId;
  const out: Desired[] = [];
  const push = (slot: string, date: string, spec: EventSpec) =>
    out.push({ key: keyOf(t.id, slot), taskId: t.id, slot, date, closed, spec });

  if (t.dueDate) {
    const doToo = t.doDates.some((d) => d.date === t.dueDate && !d.start);
    const extra = doToo ? ['この日がやる日でもある'] : [];
    if (t.dueTime) {
      // 締切の1時間前〜締切。通知は前日 20:00 と締切の2時間前
      const due = toMin(t.dueTime);
      const start = Math.max(0, due - 60);
      const at = (m: number) => ({ dateTime: `${t.dueDate}T${hhmm(m)}:00+09:00`, timeZone: ctx.timezone });
      push('due', t.dueDate, {
        calendarId,
        summary: `${prefix}【締切${t.dueTime}】${t.title}`,
        description: description(t, ctx, extra),
        start: at(start),
        end: at(due),
        colorId: '11',
        reminders: closed ? [] : [start + 240, 120 - (due - start)],
      });
    } else {
      push('due', t.dueDate, {
        calendarId,
        summary: `${prefix}【締切】${t.title}`,
        description: description(t, ctx, extra),
        start: { date: t.dueDate },
        end: { date: addDays(t.dueDate, 1) },
        colorId: '11',
        reminders: closed ? [] : ALL_DAY_REMINDERS,
      });
    }
  }

  for (const d of t.doDates) {
    if (d.date === t.dueDate && !d.start) continue;
    const extra = [
      t.dueDate && `締切: ${md(t.dueDate)}${t.dueTime ? ` ${t.dueTime}` : ''}`,
      d.minutes && `この日の配分: ${fmtMin(d.minutes)}`,
    ].filter((x): x is string => Boolean(x));
    const base = { calendarId, summary: `${prefix}【タスク】${t.title}`, description: description(t, ctx, extra), colorId: '7' };
    if (d.start) {
      const from = toMin(d.start);
      const to = from + (d.minutes ?? t.estimateMin ?? PLACE_DEFAULT_MIN);
      // 24:00 を越えたら翌日の時刻にする
      const at = (m: number) => ({
        dateTime: `${m >= 1440 ? addDays(d.date, 1) : d.date}T${hhmm(m % 1440)}:00+09:00`,
        timeZone: ctx.timezone,
      });
      push(`do:${d.date}`, d.date, { ...base, start: at(from), end: at(to), reminders: closed ? [] : BLOCK_REMINDERS });
      continue;
    }
    push(`do:${d.date}`, d.date, {
      ...base,
      start: { date: d.date },
      end: { date: addDays(d.date, 1) },
      reminders: closed ? [] : ALL_DAY_REMINDERS,
    });
  }
  return out;
}

/**
 * あるべき予定と、送ったことのある予定を突き合わせる。
 * - 過去（今日より前）の予定はさわらない（作らない・直さない・消さない）
 * - 完了・中止したタスクの予定は新しく作らない（あるものを【済】【中止】にするだけ）
 * - タスクの削除・やる日や締切を消したら、今日以降の予定は消す（アプリが作った予定だけ・本人了承済み）
 */
export function diff(desired: Desired[], rows: SyncedRow[], today: string): Action[] {
  const actions: Action[] = [];
  const have = new Map(rows.map((r) => [keyOf(r.taskId, r.slot), r]));
  const want = new Set<string>();
  for (const d of desired) {
    want.add(d.key);
    const r = have.get(d.key);
    if (!r) {
      if (!d.closed && d.date >= today) actions.push({ type: 'create', want: d });
      continue;
    }
    if (d.date < today && r.date < today) continue;
    if (sentOf(d.spec) !== r.sent) actions.push({ type: 'update', want: d, row: r });
  }
  for (const r of rows) {
    if (want.has(keyOf(r.taskId, r.slot))) continue;
    actions.push(r.date >= today ? { type: 'delete', row: r } : { type: 'forget', row: r });
  }
  return actions;
}
