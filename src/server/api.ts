// REST API（設計の正= docs/design.md 5章）。

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { diffDays } from '../shared/dates.ts';
import { parseGoalRef, parseMemoRef, parseNoteRef, parseTaskRef } from '../shared/ids.ts';
import {
  zCategoryCreate,
  zCategoryPatch,
  zDate,
  zDoDate,
  zGoalCreate,
  zGoalLogCreate,
  zGoalPatch,
  zMemoCreate,
  zMemoPatch,
  zMemoStatusFilter,
  zNoteAppend,
  zNoteCreate,
  zNotePatch,
  zRecurrenceInput,
  zTaskCreate,
  zTaskPatch,
  zTemplateApply,
  zTemplatePatch,
  zTemplateSave,
  zView,
} from '../shared/schemas.ts';
import type { CategoryService } from './categories.ts';
import { transaction, type DB } from './db.ts';
import { AppError, badRequest } from './errors.ts';
import { GoogleError } from './gcal/google.ts';
import type { GcalSync } from './gcal/sync.ts';
import type { GoalService } from './goals.ts';
import type { MemoService } from './memos.ts';
import type { NoteService } from './notes.ts';
import { zSettingsPatch, type SettingsService } from './settings.ts';
import type { TaskService } from './tasks.ts';
import type { TemplateService } from './templates.ts';

export interface Services {
  db: DB;
  tasks: TaskService;
  categories: CategoryService;
  settings: SettingsService;
  memos: MemoService;
  notes: NoteService;
  templates: TemplateService;
  goals: GoalService;
  /** Google カレンダー同期（v2・design 4-7）。テストなどでは無い */
  gcal?: GcalSync;
}

function needGcal(s: Services): GcalSync {
  if (!s.gcal) throw badRequest('Google カレンダー同期は動いていない');
  return s.gcal;
}

function noteId(c: Context): number {
  const id = parseNoteRef(c.req.param('id') ?? '');
  if (id === null) throw badRequest('ノート番号が読めない');
  return id;
}

function goalId(c: Context): number {
  const id = parseGoalRef(c.req.param('id') ?? '');
  if (id === null) throw badRequest('目標の番号が読めない');
  return id;
}

function memoId(c: Context): number {
  const id = parseMemoRef(c.req.param('id') ?? '');
  if (id === null) throw badRequest('メモ番号が読めない');
  return id;
}

function taskId(c: Context, name = 'id'): number {
  const id = parseTaskRef(c.req.param(name) ?? '');
  if (id === null) throw badRequest('タスク番号が読めない');
  return id;
}

function intParam(c: Context, name: string): number {
  const n = Number(c.req.param(name));
  if (!Number.isSafeInteger(n) || n <= 0) throw badRequest(`${name} が読めない`);
  return n;
}

async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw badRequest('JSON が読めない');
  }
  return schema.parse(json);
}

export function createApi(s: Services): Hono {
  const api = new Hono();

  api.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: err.message }, err.status);
    if (err instanceof GoogleError) return c.json({ error: err.message }, 502);
    if (err instanceof z.ZodError) {
      return c.json({ error: '入力の形が正しくない', issues: err.issues }, 400);
    }
    console.error(err);
    return c.json({ error: 'サーバ内部のエラー' }, 500);
  });

  api.get('/health', (c) => {
    s.db.prepare('SELECT 1').get();
    return c.json({ ok: true });
  });

  // ── タスク
  api.get('/tasks', (c) => {
    const view = zView.parse(c.req.query('view') ?? 'all');
    if (view === 'today') return c.json(s.tasks.today());
    if (view === 'inbox') return c.json(s.tasks.inbox());
    const category = c.req.query('category');
    return c.json(
      s.tasks.all({
        categoryId: category ? Number(category) : undefined,
        q: c.req.query('q'),
        includeDone: c.req.query('includeDone') === 'true',
        doneSince: c.req.query('doneSince') ? zDate.parse(c.req.query('doneSince')) : undefined,
        includeArchived: c.req.query('includeArchived') === 'true',
      }),
    );
  });
  api.get('/tasks/:id', (c) => c.json(s.tasks.get(taskId(c))));
  api.post('/tasks', async (c) => c.json(s.tasks.create(await body(c, zTaskCreate)), 201));
  api.patch('/tasks/:id', async (c) => c.json(s.tasks.update(taskId(c), await body(c, zTaskPatch))));
  api.delete('/tasks/:id', (c) => c.json(s.tasks.delete(taskId(c))));

  api.put('/tasks/:id/dates', async (c) =>
    c.json(s.tasks.setDoDates(taskId(c), await body(c, z.array(zDoDate)))),
  );
  api.post('/tasks/:id/dependencies', async (c) => {
    const { dependsOnId } = await body(c, z.object({ dependsOnId: z.union([z.number(), z.string()]) }));
    const dep = parseTaskRef(dependsOnId);
    if (dep === null) throw badRequest('依存先の番号が読めない');
    return c.json(s.tasks.addDependency(taskId(c), dep));
  });
  api.delete('/tasks/:id/dependencies/:dependsOnId', (c) =>
    c.json(s.tasks.removeDependency(taskId(c), taskId(c, 'dependsOnId'))),
  );
  api.post('/tasks/:id/chain-children', (c) => c.json(s.tasks.chainChildren(taskId(c))));

  // ── シリーズ（依存の図・v4）。id 0 は「親なし」
  api.get('/series', (c) => c.json(s.tasks.seriesList()));
  api.get('/series/:id', (c) => c.json(s.tasks.series(c.req.param('id') === '0' ? 0 : taskId(c))));
  api.put('/tasks/:id/recurrence', async (c) =>
    c.json(s.tasks.setRecurrence(taskId(c), await body(c, zRecurrenceInput))),
  );
  api.delete('/tasks/:id/recurrence', (c) => c.json(s.tasks.setRecurrence(taskId(c), null)));

  // ── テンプレート（design 4-8）
  api.get('/templates', (c) => c.json(s.templates.list()));
  api.post('/templates', async (c) => {
    const { taskId: raw, name, overwrite } = await body(c, zTemplateSave);
    const id = parseTaskRef(raw);
    if (id === null) throw badRequest('タスク番号が読めない');
    return c.json(s.templates.saveFromTask(id, name, overwrite), 201);
  });
  api.patch('/templates/:id', async (c) =>
    c.json(s.templates.rename(intParam(c, 'id'), (await body(c, zTemplatePatch)).name)),
  );
  api.delete('/templates/:id', (c) => {
    s.templates.delete(intParam(c, 'id'));
    return c.json({ ok: true });
  });
  api.post('/templates/:id/apply', async (c) =>
    c.json(s.templates.apply(intParam(c, 'id'), await body(c, zTemplateApply)), 201),
  );

  // ── メモ
  api.get('/memos', (c) =>
    c.json(s.memos.list({ status: zMemoStatusFilter.parse(c.req.query('status') ?? 'open'), q: c.req.query('q') })),
  );
  api.post('/memos', async (c) => c.json(s.memos.create((await body(c, zMemoCreate)).body), 201));
  api.patch('/memos/:id', async (c) => c.json(s.memos.update(memoId(c), await body(c, zMemoPatch))));
  api.delete('/memos/:id', (c) => {
    s.memos.delete(memoId(c));
    return c.json({ ok: true });
  });
  api.post('/memos/:id/to-task', async (c) => {
    const extra = await body(c, zTaskCreate.partial());
    return c.json(s.memos.toTask(memoId(c), extra), 201);
  });

  // ── ノート（design 3-6e）
  api.get('/notes', (c) =>
    c.json(
      s.notes.list({
        archived: c.req.query('archived') === '1',
        q: c.req.query('q'),
        label: c.req.query('label') || undefined,
      }),
    ),
  );
  api.get('/notes/labels', (c) => c.json(s.notes.labels()));
  api.post('/notes', async (c) => c.json(s.notes.create(await body(c, zNoteCreate)), 201));
  api.patch('/notes/:id', async (c) => c.json(s.notes.update(noteId(c), await body(c, zNotePatch))));
  api.post('/notes/:id/append', async (c) => c.json(s.notes.append(noteId(c), await body(c, zNoteAppend))));
  api.delete('/notes/:id', (c) => {
    s.notes.delete(noteId(c));
    return c.json({ ok: true });
  });

  // ── 目標（design 3-6f・4-13）
  api.get('/goals', (c) => c.json(s.goals.list({ archived: c.req.query('archived') === '1' })));
  api.get('/goals/:id', (c) => c.json(s.goals.get(goalId(c))));
  api.post('/goals', async (c) => c.json(s.goals.create(await body(c, zGoalCreate)), 201));
  api.patch('/goals/:id', async (c) => c.json(s.goals.update(goalId(c), await body(c, zGoalPatch))));
  api.delete('/goals/:id', (c) => {
    s.goals.delete(goalId(c));
    return c.json({ ok: true });
  });
  api.post('/goals/:id/logs', async (c) => c.json(s.goals.addLog(goalId(c), await body(c, zGoalLogCreate)), 201));
  api.delete('/goals/:id/logs/:logId', (c) => c.json(s.goals.deleteLog(intParam(c, 'logId'))));

  // ── 設定
  api.get('/settings', (c) => c.json(s.settings.get()));
  api.patch('/settings', async (c) => c.json(s.settings.update(await body(c, zSettingsPatch))));

  // ── カテゴリ
  api.get('/categories', (c) => c.json(s.categories.list(c.req.query('includeArchived') === 'true')));
  api.post('/categories', async (c) => c.json(s.categories.create(await body(c, zCategoryCreate)), 201));
  api.patch('/categories/:id', async (c) => {
    const id = intParam(c, 'id');
    const { cancelOpen, ...patch } = await body(c, zCategoryPatch);
    return c.json(
      transaction(s.db, () => {
        // アーカイブは未完了の扱いを確かめてから（design 4-6）
        if (patch.archived === true) s.tasks.archiveCategory(id, cancelOpen ?? false);
        return s.categories.update(id, patch);
      }),
    );
  });
  api.delete('/categories/:id', (c) => {
    s.categories.delete(intParam(c, 'id'));
    return c.json({ ok: true });
  });

  // ── Google カレンダー（design 4-7）
  api.get('/gcal/status', (c) =>
    c.json(
      s.gcal?.status() ?? {
        configured: false,
        connected: false,
        running: false,
        lastRunAt: null,
        lastResult: null,
        lastError: null,
        events: 0,
      },
    ),
  );
  /** 同意画面の URL（画面がそこへ移動する。戻り先は /oauth/callback） */
  api.get('/gcal/connect', (c) => c.json({ url: needGcal(s).authUrl() }));
  api.get('/gcal/calendars', async (c) => c.json(await needGcal(s).calendars()));
  /** 画面に重ねる Google の予定（v3・design 7-11）。つながっていなければ空 */
  api.get('/gcal/events', async (c) => {
    const from = zDate.parse(c.req.query('from'));
    const to = zDate.parse(c.req.query('to'));
    if (to < from || diffDays(to, from) > 62) throw badRequest('期間は62日まで');
    if (!s.gcal) return c.json({ connected: false, events: [] });
    const connected = s.gcal.status().connected;
    return c.json({ connected, events: await s.gcal.overlay(from, to, c.req.query('fresh') === '1') });
  });
  api.post('/gcal/sync', async (c) => {
    const g = needGcal(s);
    await g.mapCalendars().catch(() => undefined);
    await g.run();
    return c.json(g.status());
  });
  api.post('/gcal/disconnect', (c) => {
    const g = needGcal(s);
    g.disconnect();
    return c.json(g.status());
  });

  return api;
}
