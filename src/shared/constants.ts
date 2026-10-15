// 状態・優先度の定数。画面が zod を読み込まずに済むよう schemas.ts から分けてある。

export const STATUSES = ['todo', 'doing', 'waiting', 'done', 'canceled'] as const;
export const OPEN_STATUSES = ['todo', 'doing', 'waiting'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  todo: '未着手',
  doing: '進行中',
  waiting: '待ち',
  done: '完了',
  canceled: '中止',
};
export const PRIORITY_LABEL: Record<number, string> = { 1: '高', 2: '中', 3: '低' };

/** ノートの色（Google Keep と同じ並び・design 3-6e） */
export const NOTE_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'gray'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

/** 依存の図で、親を持たないタスクどうしをまとめた仮のシリーズ（id 0・v4） */
export const TOP_SERIES_TITLE = '親なし（いちばん上の段）';

export function isOpen(status: Status): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}
