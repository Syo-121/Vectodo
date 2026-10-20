// シリーズ（子を持つタスク）の扱い（design 4-3）。子が残っている親は「まとめ役」で、やることは子のほう。
// 行動の画面（今日・カンバン・重要×緊急・計画待ち・MCP の今日）には親を出さず、親の締切は「いま着手できる子」に受け継がせる。
// 日付の画面（日・週・月）では、親は締切の印だけにする（やる日は子に付ける）。
// 子が全部終わった親は並べる画面から外し、「閉じる？」と聞く——ただし、いちばん上の親で締切もやる日も無いもの
// （続いていく開発のプロジェクトなど）は黙って残す。中間の親（機能・段階）は締切が無くても聞く。
// 祖先が依存待ち・待ちの子孫は、サーバが blocked（＋ waitVia）にして返す（design 4-2）。
// サーバ（今日の画面・MCP）と画面で同じものを使う純粋関数。

import { isOpen } from './constants.ts';
import type { Task } from './types.ts';

/** 子が残っている親（中身は子のほう） */
export const isContainer = (t: Task): boolean => isOpen(t.status) && t.children.total > t.children.done;

/** 子が全部終わった、まだ開いている親（中止した子は数えない） */
export const isFinishedSeries = (t: Task): boolean =>
  isOpen(t.status) && t.children.total > 0 && t.children.done === t.children.total;

/** 「閉じる？」と聞く親: 子が全部終わって、締切かやる日があるか、中間の親（さらに上に親がいる）もの */
export const askToClose = (t: Task): boolean =>
  isFinishedSeries(t) && (t.dueDate !== null || t.doDates.length > 0 || t.parentId !== null);

/** 今すぐ手を付けられる */
export const canStart = (t: Task): boolean => (t.status === 'todo' || t.status === 'doing') && !t.blocked;

const dueKey = (t: Task) => `${t.dueDate} ${t.dueTime ?? '99:99'}`;

/** 子が残っている親ごとの「いま着手できる子」（子もまた親なら、その子）。親の番号 → 子（並び順） */
export function nextSteps(tasks: Task[]): Map<number, Task[]> {
  const open = tasks.filter((t) => isOpen(t.status));
  const kids = new Map<number, Task[]>();
  for (const t of open) if (t.parentId !== null) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);
  for (const list of kids.values()) list.sort((a, b) => a.position - b.position || a.id - b.id);
  const steps = (id: number, depth: number): Task[] =>
    depth > 10
      ? []
      : (kids.get(id) ?? []).flatMap((c) =>
          isContainer(c) ? steps(c.id, depth + 1) : canStart(c) && !isFinishedSeries(c) ? [c] : [],
        );
  const map = new Map<number, Task[]>();
  for (const t of open) if (isContainer(t)) map.set(t.id, steps(t.id, 0));
  return map;
}

/**
 * 行動の画面用: 子が残っている親と、子が全部終わった親（閉じるかどうかは今日の「閉じる？」で聞く）を外し、
 * 締切の無い「いま着手できる子」に、親（さらに上の親も）の締切のうちいちばん早いものを受け継がせる（dueFrom に親の印）。
 * 待ち・依存待ちの子（祖先が待っている子孫も）は受け継がない——手を付けられるようになったら受け継ぐ。自分の締切がある子はそのまま。
 */
export function forAction(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const parentOf = (t: Task) => (t.parentId !== null ? byId.get(t.parentId) : undefined);
  const inherited = (t: Task): Task | null => {
    let best: Task | null = null;
    let cur = parentOf(t);
    for (let i = 0; cur && i < 10; i++) {
      if (isOpen(cur.status) && cur.dueDate && (!best || dueKey(cur) < dueKey(best))) best = cur;
      cur = parentOf(cur);
    }
    return best;
  };
  return tasks
    .filter((t) => !isContainer(t) && !isFinishedSeries(t))
    .map((t) => {
      if (t.dueDate || !canStart(t)) return t;
      const p = inherited(t);
      return p ? { ...t, dueDate: p.dueDate, dueTime: p.dueTime, dueFrom: { id: p.id, title: p.title } } : t;
    });
}

/** 日付の画面（日・週・月）用: 子が残っている親は締切の印だけにする（やる日は子のほうに付ける） */
export function forCalendar(tasks: Task[]): Task[] {
  return tasks.map((t) => (isContainer(t) && t.doDates.length ? { ...t, doDates: [] } : t));
}
