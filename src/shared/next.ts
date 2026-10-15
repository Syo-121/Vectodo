// 「次にやること」の順番（design 4-10）。サーバ（今日の画面・MCP）と画面で同じものを使う純粋関数。
// 段: 期限切れ → 今日締切 → 進行中 → 今日やる日（持ち越し含む）→ 締切が迫る → 7日以内の締切 → 急がないけど優先度「高」。
// 「締切が迫る」は /task スキルの緊急度と同じ: 締切までの日数 − 必要な日数（見積 ÷ 2h を切り上げ・見積なしは1日）≦ 2。
// ただし見積 30m 以下の小さいタスク（ゴミ出しなど）は ≦ 0＝締切の前日から。
// 着手できないもの（待ち・依存待ち）は入れない。子が残っている親は入れず、その段を着手できる子に受け継がせる。

import { diffDays, maxDate } from './dates.ts';
import type { NextItem, NextKind, Task } from './types.ts';

export const NEXT_ORDER: NextKind[] = ['overdue', 'dueToday', 'doing', 'doToday', 'atRisk', 'dueSoon', 'important'];
/** 今日の画面の「その次に」に出す段（「近いうちに」と「優先度高」以外） */
export const TODAY_KINDS: NextKind[] = ['overdue', 'dueToday', 'doing', 'doToday', 'atRisk'];
export const NEXT_COUNT = 3;

/** 必要な日数（見積 ÷ 2h を切り上げ・見積なしは 2h 扱い） */
export function needDays(estimateMin: number | null): number {
  return Math.max(1, Math.ceil((estimateMin ?? 120) / 120));
}

/** 締切が迫ると見なす余裕の日数（見積 30m 以下の小さいタスクは前日まで寄せない） */
export function slackLimit(estimateMin: number | null): number {
  return estimateMin !== null && estimateMin <= 30 ? 0 : 2;
}

const isOpen = (t: Task) => t.status === 'todo' || t.status === 'doing' || t.status === 'waiting';
/** 子が残っている親（中身は子のほう） */
const isContainer = (t: Task) => t.children.total > t.children.done;
/** 今すぐ手を付けられる */
const canStart = (t: Task) => (t.status === 'todo' || t.status === 'doing') && !t.blocked;

export function plannedToday(t: Task, today: string): boolean {
  return t.doDates.some((d) => d.date === today);
}
export function carriedOver(t: Task, today: string): boolean {
  const dates = t.doDates.map((d) => d.date);
  return dates.length > 0 && !dates.includes(today) && maxDate(dates)! < today;
}

/** 1件の段（候補でなければ null）。daysLeft は締切までの日数 */
function classify(t: Task, today: string): { kind: NextKind; daysLeft: number | null } | null {
  const daysLeft = t.dueDate ? diffDays(t.dueDate, today) : null;
  const kind: NextKind | null =
    daysLeft !== null && daysLeft < 0
      ? 'overdue'
      : daysLeft === 0
        ? 'dueToday'
        : t.status === 'doing'
          ? 'doing'
          : plannedToday(t, today) || carriedOver(t, today)
            ? 'doToday'
            : daysLeft !== null && daysLeft - needDays(t.estimateMin) <= slackLimit(t.estimateMin)
              ? 'atRisk'
              : daysLeft !== null && daysLeft <= 7
                ? 'dueSoon'
                : t.priority === 1 && daysLeft === null
                  ? 'important'
                  : null;
  return kind ? { kind, daysLeft } : null;
}

const rank = (k: NextKind) => NEXT_ORDER.indexOf(k);
const pri = (t: Task) => t.priority ?? 9;
const byStr = (a: string | null, b: string | null) => (a ?? '9999').localeCompare(b ?? '9999');

function compare(a: NextItem, b: NextItem): number {
  const d = rank(a.kind) - rank(b.kind);
  if (d) return d;
  const ta = a.task;
  const tb = b.task;
  switch (a.kind) {
    case 'overdue':
    case 'dueSoon':
      return (a.daysLeft ?? 0) - (b.daysLeft ?? 0) || byStr(ta.dueTime, tb.dueTime) || pri(ta) - pri(tb) || ta.id - tb.id;
    case 'dueToday':
      return byStr(ta.dueTime, tb.dueTime) || pri(ta) - pri(tb) || ta.id - tb.id;
    case 'atRisk': {
      const slack = (x: NextItem) => (x.daysLeft ?? 0) - needDays(x.task.estimateMin);
      return slack(a) - slack(b) || pri(ta) - pri(tb) || (a.daysLeft ?? 0) - (b.daysLeft ?? 0) || ta.id - tb.id;
    }
    default:
      return pri(ta) - pri(tb) || byStr(ta.dueDate, tb.dueDate) || ta.id - tb.id;
  }
}

/** 未完了のタスク全部（アーカイブ分は除いて）を受け取り、着手できるものを次にやる順に並べる */
export function rankNext(tasks: Task[], today: string): NextItem[] {
  const open = tasks.filter(isOpen);
  const kids = new Map<number, Task[]>();
  for (const t of open) if (t.parentId !== null) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);

  const best = new Map<number, NextItem>();
  const offer = (item: NextItem) => {
    const cur = best.get(item.task.id);
    if (!cur || rank(item.kind) < rank(cur.kind)) best.set(item.task.id, item);
  };
  /** 親の段を、着手できる子（子もまた親なら、その子）に受け継がせる */
  const hand = (parent: Task, kind: NextKind, daysLeft: number | null, via: NextItem['via'], depth = 0) => {
    if (depth > 10) return;
    for (const c of kids.get(parent.id) ?? []) {
      if (isContainer(c)) hand(c, kind, daysLeft, via, depth + 1);
      else if (canStart(c)) offer(item(c, kind, daysLeft, via));
    }
  };
  const item = (t: Task, kind: NextKind, daysLeft: number | null, via: NextItem['via']): NextItem => ({
    task: t,
    kind,
    daysLeft,
    carriedOver: carriedOver(t, today),
    plannedToday: plannedToday(t, today),
    via,
  });

  for (const t of open) {
    const c = classify(t, today);
    if (!c) continue;
    if (isContainer(t)) {
      // 優先度「高」なだけの親は子に配らない（子それぞれの優先度で決める）
      if (c.kind !== 'important') hand(t, c.kind, c.daysLeft, { id: t.id, title: t.title });
    } else if (canStart(t)) {
      offer(item(t, c.kind, c.daysLeft, null));
    }
  }
  return [...best.values()].sort(compare);
}

/** 待ち・依存待ちで、7日以内に締切があるか、やる日が今日までのもの（「待っているもの」に畳んで出す） */
export function waitingSoon(tasks: Task[], today: string): Task[] {
  return tasks
    .filter((t) => isOpen(t) && !isContainer(t) && (t.status === 'waiting' || t.blocked))
    .filter(
      (t) =>
        (t.dueDate !== null && diffDays(t.dueDate, today) <= 7) || t.doDates.some((d) => d.date <= today),
    )
    .sort((a, b) => byStr(a.dueDate, b.dueDate) || pri(a) - pri(b) || a.id - b.id);
}

function minutes(m: number): string {
  if (m === 240) return '半日';
  if (m === 480) return '1日+';
  if (m % 60 === 0) return `${m / 60}h`;
  return m > 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}m`;
}

/** 自分の締切の時刻を過ぎた「今日締切」か（now は HH:MM。親から受け継いだものは親の時刻が分からないので見ない） */
export function duePassed(n: NextItem, now: string | undefined): boolean {
  return n.kind === 'dueToday' && !n.via && n.task.dueTime !== null && now !== undefined && now > n.task.dueTime;
}

/** なぜこの順番なのかの一言（画面と MCP で同じ言い方）。now（HH:MM）を渡すと、時刻を過ぎた今日締切はそう言う */
export function nextReason(n: NextItem, now?: string): string {
  const t = n.task;
  const d = n.daysLeft;
  const own =
    n.kind === 'overdue'
      ? `締切を${-(d ?? 0)}日過ぎている`
      : n.kind === 'dueToday'
        ? duePassed(n, now)
          ? `今日 ${t.dueTime} の締切を過ぎた`
          : t.dueTime && !n.via
            ? `今日 ${t.dueTime} が締切`
            : '今日が締切'
        : n.kind === 'doing'
          ? '手を付けている途中'
          : n.kind === 'doToday'
            ? n.carriedOver
              ? 'やる日を過ぎて持ち越し'
              : '今日やると決めた'
            : n.kind === 'atRisk' || n.kind === 'dueSoon'
              ? `締切まであと${d}日${n.kind === 'atRisk' && !n.via && t.estimateMin ? `・見積${minutes(t.estimateMin)}` : ''}`
              : '急がないけど優先度「高」';
  return n.via ? `「${n.via.title}」の次の工程（${own}）` : own;
}
