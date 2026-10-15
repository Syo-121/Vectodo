// ボードの振り分け（design 7-8）。画面から切り離した純粋関数で、test/board.test.ts で確かめる。

import type { TaskPatchInput } from '../../shared/schemas.ts';
import type { Category, OverlayEvent, Task } from '../../shared/types.ts';
import { addDays, daysInMonth, diffDays, isoWeekday } from '../../shared/dates.ts';
import { isOpen } from '../../shared/constants.ts';

export type Axis = 'status' | 'urgency' | 'priority' | 'category';

export interface Column {
  key: string;
  label: string;
  color?: string;
  tone?: 'red' | 'amber';
  /** ドラッグで入れられるか（緊急度は締切から計算した値なので不可） */
  droppable: boolean;
  tasks: Task[];
}

/** 優先度 → 締切 → 番号 */
export function byPriorityDue(a: Task, b: Task): number {
  return (
    (a.priority ?? 9) - (b.priority ?? 9) ||
    (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') ||
    (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') ||
    a.id - b.id
  );
}

export type Urgency = 'overdue' | 'today' | 'd3' | 'd7' | 'later' | 'none';

export function urgencyOf(t: Task, today: string): Urgency {
  if (!t.dueDate) return 'none';
  const diff = diffDays(t.dueDate, today);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 3) return 'd3';
  if (diff <= 7) return 'd7';
  return 'later';
}

const URGENCY_COLUMNS: [Urgency, string, Column['tone']?][] = [
  ['overdue', '期限切れ', 'red'],
  ['today', '今日', 'red'],
  ['d3', '3日以内', 'amber'],
  ['d7', '7日以内'],
  ['later', 'それ以降'],
  ['none', '締切なし'],
];

export function kanbanColumns(tasks: Task[], axis: Axis, today: string, categories: Category[]): Column[] {
  const open = tasks.filter((t) => isOpen(t.status));
  const col = (key: string, label: string, list: Task[], extra: Partial<Column> = {}): Column => ({
    key,
    label,
    droppable: true,
    tasks: [...list].sort(byPriorityDue),
    ...extra,
  });

  switch (axis) {
    case 'status': {
      const done = tasks
        .filter((t) => t.status === 'done')
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
      return [
        col('todo', '未着手', open.filter((t) => t.status === 'todo')),
        col('doing', '進行中', open.filter((t) => t.status === 'doing')),
        col('waiting', '待ち', open.filter((t) => t.status === 'waiting')),
        { ...col('done', '完了（直近7日）', []), tasks: done },
      ];
    }
    case 'urgency':
      return URGENCY_COLUMNS.map(([key, label, tone]) =>
        col(key, label, open.filter((t) => urgencyOf(t, today) === key), { tone, droppable: false }),
      );
    case 'priority':
      return [
        col('1', '高', open.filter((t) => t.priority === 1), { tone: 'red' }),
        col('2', '中', open.filter((t) => t.priority === 2), { tone: 'amber' }),
        col('3', '低', open.filter((t) => t.priority === 3)),
        col('none', '未設定', open.filter((t) => t.priority === null)),
      ];
    case 'category': {
      const used = new Set(open.map((t) => t.categoryId));
      return [
        ...categories
          .filter((c) => !c.archived || used.has(c.id))
          .map((c) => col(String(c.id), c.name, open.filter((t) => t.categoryId === c.id), { color: c.color })),
        col('none', 'カテゴリなし', open.filter((t) => t.categoryId === null)),
      ];
    }
  }
}

/** 列へ落としたときに変える項目。null ならドラッグ不可 */
export function columnPatch(axis: Axis, key: string): TaskPatchInput | null {
  switch (axis) {
    case 'status':
      return { status: key as TaskPatchInput['status'] };
    case 'priority':
      return { priority: key === 'none' ? null : (Number(key) as 1 | 2 | 3) };
    case 'category':
      return { categoryId: key === 'none' ? null : Number(key) };
    case 'urgency':
      return null;
  }
}

export interface DayItem {
  task: Task;
  kind: 'do' | 'due';
  /** その日の配分時間（無ければ見積をやる日の数で割った値。どちらも無ければ null） */
  minutes: number | null;
  /** 配分時間が明示されていない（見積から割り出した） */
  estimated: boolean;
}

export interface Day {
  date: string;
  items: DayItem[];
  loadMin: number;
}

export function weekDays(tasks: Task[], start: string, days = 7): Day[] {
  const result: Day[] = Array.from({ length: days }, (_, i) => ({ date: addDays(start, i), items: [], loadMin: 0 }));
  const byDate = new Map(result.map((d) => [d.date, d]));
  for (const t of tasks) {
    if (!isOpen(t.status)) continue;
    for (const d of t.doDates) {
      const day = byDate.get(d.date);
      if (!day) continue;
      const derived = t.estimateMin ? Math.round(t.estimateMin / t.doDates.length) : null;
      const minutes = d.minutes ?? derived;
      day.items.push({ task: t, kind: 'do', minutes, estimated: d.minutes === null && minutes !== null });
      day.loadMin += minutes ?? 0;
    }
    if (t.dueDate) {
      const day = byDate.get(t.dueDate);
      if (day && !day.items.some((x) => x.task.id === t.id)) {
        day.items.push({ task: t, kind: 'due', minutes: null, estimated: false });
      }
    }
  }
  for (const day of result) {
    day.items.sort((a, b) => (a.kind === b.kind ? byPriorityDue(a.task, b.task) : a.kind === 'do' ? -1 : 1));
  }
  return result;
}

/** やる日を from から to へ移した後の一覧（to に既にあれば時間を足し合わせる） */
export function moveDoDate(
  doDates: Task['doDates'],
  from: string,
  to: string,
): { date: string; minutes: number | null }[] {
  if (from === to) return doDates;
  const moving = doDates.find((d) => d.date === from);
  if (!moving) return doDates;
  const target = doDates.find((d) => d.date === to);
  const rest = doDates.filter((d) => d.date !== from && d.date !== to);
  const merged =
    target === undefined
      ? { date: to, minutes: moving.minutes }
      : {
          date: to,
          minutes: moving.minutes === null && target.minutes === null ? null : (moving.minutes ?? 0) + (target.minutes ?? 0),
        };
  return [...rest, merged].sort((a, b) => a.date.localeCompare(b.date));
}

/** 1=重要×緊急 2=重要×緊急でない 3=緊急×重要でない 4=どちらでもない */
export function quadrantOf(t: Task, today: string): 1 | 2 | 3 | 4 {
  const important = t.priority === 1;
  const urgent = t.dueDate !== null && diffDays(t.dueDate, today) <= 3;
  if (important) return urgent ? 1 : 2;
  return urgent ? 3 : 4;
}

/** 締切はあるのにやる日が無い未完了（締切が近い順） */
export function planQueue(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => isOpen(t.status) && t.dueDate !== null && t.doDates.length === 0)
    .sort(
      (a, b) =>
        a.dueDate!.localeCompare(b.dueDate!) ||
        (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') ||
        (a.priority ?? 9) - (b.priority ?? 9),
    );
}

export interface Bottleneck {
  task: Task;
  /** このタスクを直接待っている未完了 */
  waiters: Task[];
  /** 完了するとすぐ着手できるようになる数（このタスクだけを待っているもの） */
  freed: number;
  /** 連鎖して待っている総数（間接も含む） */
  downstream: number;
}

export function bottlenecks(tasks: Task[]): Bottleneck[] {
  const open = tasks.filter((t) => isOpen(t.status));
  const byId = new Map(open.map((t) => [t.id, t]));
  const waiters = new Map<number, Task[]>();
  for (const t of open) {
    for (const d of t.dependsOn) {
      if (isOpen(d.status)) waiters.set(d.id, [...(waiters.get(d.id) ?? []), t]);
    }
  }
  const downstream = (id: number): number => {
    const seen = new Set<number>();
    const queue = [id];
    while (queue.length) {
      for (const w of waiters.get(queue.shift()!) ?? []) {
        if (!seen.has(w.id)) {
          seen.add(w.id);
          queue.push(w.id);
        }
      }
    }
    return seen.size;
  };
  return [...waiters.entries()]
    .filter(([id]) => byId.has(id))
    .map(([id, ws]) => ({
      task: byId.get(id)!,
      waiters: ws.sort((a, b) => a.id - b.id),
      freed: ws.filter((w) => w.dependsOn.filter((d) => isOpen(d.status)).length === 1).length,
      downstream: downstream(id),
    }))
    .sort((a, b) => b.downstream - a.downstream || b.freed - a.freed || byPriorityDue(a.task, b.task));
}

/** 直近の完了・中止を、終わった日ごとに（新しい日から） */
export function reviewDays(tasks: Task[], since: string): { date: string; tasks: Task[] }[] {
  // 中止には completed_at が無いので、中止した時刻として updatedAt を使う
  const finishedAt = (t: Task) => (t.status === 'done' ? t.completedAt : t.updatedAt) ?? '';
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    if (isOpen(t.status)) continue;
    const day = finishedAt(t).slice(0, 10);
    if (day < since) continue;
    groups.set(day, [...(groups.get(day) ?? []), t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => ({ date, tasks: list.sort((a, b) => finishedAt(b).localeCompare(finishedAt(a))) }));
}

// ───────────── 月（v3・design 7-11）

/** 月の表（月曜はじまり・前後の月の日も含めて週単位）。offset=0 が今月 */
export function monthGrid(today: string, offset: number): { month: string; first: string; dates: string[] } {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  const first = d.toISOString().slice(0, 10);
  const last = addDays(first, daysInMonth(d.getUTCFullYear(), d.getUTCMonth() + 1) - 1);
  const start = addDays(first, 1 - isoWeekday(first));
  const end = addDays(last, 7 - isoWeekday(last));
  const dates: string[] = [];
  for (let x = start; x <= end; x = addDays(x, 1)) dates.push(x);
  return { month: first.slice(0, 7), first, dates };
}

/** 重ねる予定を日ごとに分ける（終日の連続予定は続く日すべてに出す）。終日が先、あとは時刻順 */
export function overlayByDay(events: OverlayEvent[], dates: string[]): Map<string, OverlayEvent[]> {
  const map = new Map(dates.map((d) => [d, [] as OverlayEvent[]]));
  const lastDate = dates.at(-1) ?? '';
  for (const e of events) {
    const end = e.endDate > e.date ? e.endDate : addDays(e.date, 1);
    for (let d = e.date; d < end && d <= lastDate; d = addDays(d, 1)) map.get(d)?.push(e);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.start === null ? -1 : 0) - (b.start === null ? -1 : 0) || (a.start ?? '').localeCompare(b.start ?? ''));
  }
  return map;
}
