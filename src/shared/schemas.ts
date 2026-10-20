// 入力の形。画面・API・MCP で共有する（設計の正= docs/design.md 3章）。

import { z } from 'zod';
import { NOTE_COLORS, STATUSES } from './constants.ts';
import { isValidDate } from './dates.ts';

export * from './constants.ts';

export const zStatus = z.enum(STATUSES);
export const zDate = z.string().refine(isValidDate, '日付は YYYY-MM-DD で');
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '時刻は HH:MM で');
export const zPriority = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const zId = z.number().int().positive();

export const zDoDate = z.object({
  date: zDate,
  minutes: z.number().int().positive().nullable().optional(),
  /** その日の時刻。省くと今の時刻を残す（日付だけ送る画面が時刻を消さないように）・null で消す */
  start: zTime.nullable().optional(),
});
export type DoDateInput = z.infer<typeof zDoDate>;

const zAnchor = z.enum(['do', 'due']).optional();
export const zRecurrenceInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('weekly'),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1),
    anchor: zAnchor,
  }),
  z.object({ kind: z.literal('monthly'), monthDay: z.number().int().min(1).max(31), anchor: zAnchor }),
  z.object({ kind: z.literal('interval'), intervalDays: z.number().int().min(1), anchor: zAnchor }),
  z.object({ kind: z.literal('after_done'), intervalDays: z.number().int().min(1), anchor: zAnchor }),
]);
export type RecurrenceInput = z.infer<typeof zRecurrenceInput>;

const taskFields = {
  title: z.string().trim().min(1, 'タイトルは必須').max(500),
  parentId: zId.nullable(),
  status: zStatus,
  categoryId: zId.nullable(),
  priority: zPriority.nullable(),
  dueDate: zDate.nullable(),
  dueTime: zTime.nullable(),
  estimateMin: z.number().int().positive().nullable(),
  notes: z.string().max(100_000),
};

export const zTaskCreate = z.object({
  ...taskFields,
  parentId: taskFields.parentId.optional(),
  status: taskFields.status.optional(),
  categoryId: taskFields.categoryId.optional(),
  priority: taskFields.priority.optional(),
  dueDate: taskFields.dueDate.optional(),
  dueTime: taskFields.dueTime.optional(),
  estimateMin: taskFields.estimateMin.optional(),
  notes: taskFields.notes.optional(),
  doDates: z.array(zDoDate).optional(),
  dependsOn: z.array(zId).optional(),
  recurrence: zRecurrenceInput.optional(),
});
export type TaskCreateInput = z.infer<typeof zTaskCreate>;

export const zTaskPatch = z
  .object({ ...taskFields, position: z.number(), actualMin: z.number().int().positive().max(24 * 60 * 7).nullable() })
  .partial();
export type TaskPatchInput = z.infer<typeof zTaskPatch>;

export const zCategoryCreate = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
export const zCategoryPatch = z
  .object({
    name: z.string().trim().min(1).max(50),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    position: z.number(),
    archived: z.boolean(),
    /** archived=true のとき、残っている未完了のタスクを全部中止にしてからアーカイブする */
    cancelOpen: z.boolean(),
    /** Google カレンダーの書き込み先（null で既定のカレンダー） */
    gcalCalendarId: z.string().min(1).nullable(),
    /** 締切（無ければやる日）が今日から N 日より先の未完了を画面で隠す（null で隠さない・design 4-9） */
    hideAfterDays: z.number().int().min(0).max(365).nullable(),
    /** ボードの「計画待ち」に出さない */
    hideFromPlan: z.boolean(),
  })
  .partial();

export const zView = z.enum(['today', 'all', 'inbox']);

export const zMemoBody = z.string().trim().min(1, '本文は必須').max(20_000);
export const zMemoCreate = z.object({ body: zMemoBody });
export const zMemoPatch = z
  .object({
    body: zMemoBody,
    status: z.enum(['open', 'done']),
    destination: z.string().trim().max(200).nullable(),
  })
  .partial();
export type MemoPatchInput = z.infer<typeof zMemoPatch>;
export const zMemoStatusFilter = z.enum(['open', 'done', 'all']);

// テンプレート（design 3-6d・4-8）
export const zTemplateName = z.string().trim().min(1, '名前は必須').max(40);
export const zTemplateSave = z.object({
  taskId: z.union([z.number(), z.string()]),
  name: zTemplateName,
  /** 同じ名前があれば中身を置き換える（無いと 409） */
  overwrite: z.boolean().optional(),
});
export const zTemplatePatch = z.object({ name: zTemplateName });
export const zTemplateApply = z.object({
  /** 親のタイトル。省略すると、テンプレートの親の名前（日付で始まっていたなら基準日を付ける） */
  title: z.string().trim().min(1).max(500).optional(),
  /** 基準日。省略すると日付を入れない */
  date: zDate.nullable().optional(),
});
export type TemplateApplyInput = z.infer<typeof zTemplateApply>;

// ノート（design 3-6e）
export const zNoteItem = z.object({ text: z.string().max(2000), done: z.boolean() });
const noteFields = {
  title: z.string().max(500),
  body: z.string().max(50_000),
  kind: z.enum(['text', 'list']),
  items: z.array(zNoteItem).max(500),
  color: z.enum(NOTE_COLORS).nullable(),
  labels: z.array(z.string().trim().min(1).max(30)).max(20),
  pinned: z.boolean(),
  archived: z.boolean(),
};
export const zNoteCreate = z.object(noteFields).partial();
export type NoteCreateInput = z.infer<typeof zNoteCreate>;
export const zNotePatch = z.object(noteFields).partial();
export type NotePatchInput = z.infer<typeof zNotePatch>;
/** 書き足す（Claude 用）: text は行ごとに・items はチェックリストの項目として */
export const zNoteAppend = z.object({
  text: z.string().max(20_000).optional(),
  items: z.array(z.string().trim().min(1).max(2000)).max(100).optional(),
});
export type NoteAppendInput = z.infer<typeof zNoteAppend>;

// 目標（design 3-6f・4-13）
export const zGoalPeriod = z.enum(['day', 'week', 'month']);
const zAmount = z.number().positive().max(1_000_000);
const goalFields = {
  title: z.string().trim().min(1, '名前は必須').max(200),
  kind: z.enum(['rate', 'total']),
  period: zGoalPeriod.nullable(),
  target: zAmount,
  unit: z.string().trim().max(20),
  startDate: zDate,
  endDate: zDate.nullable(),
  notes: z.string().max(20_000),
  position: z.number(),
  archived: z.boolean(),
};
export const zGoalCreate = z.object({
  title: goalFields.title,
  kind: goalFields.kind,
  period: goalFields.period.optional(),
  target: goalFields.target,
  unit: goalFields.unit.optional(),
  /** 省くと、期間ごとなら今の期間の頭（今週の月曜・今月1日）、期限までなら今日 */
  startDate: goalFields.startDate.optional(),
  endDate: goalFields.endDate.optional(),
  notes: goalFields.notes.optional(),
});
export type GoalCreateInput = z.infer<typeof zGoalCreate>;
export const zGoalPatch = z.object(goalFields).partial();
export type GoalPatchInput = z.infer<typeof zGoalPatch>;
export const zGoalLogCreate = z.object({
  /** 省くと今日 */
  date: zDate.optional(),
  /** 省くと 1 */
  amount: zAmount.optional(),
  note: z.string().trim().max(500).optional(),
});
export type GoalLogInput = z.infer<typeof zGoalLogCreate>;
