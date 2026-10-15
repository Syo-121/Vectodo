// API の呼び出しと React Query のフック。書き込んだら tasks 系のキャッシュを全部捨てて取り直す。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DoDateInput,
  MemoPatchInput,
  NoteCreateInput,
  NotePatchInput,
  RecurrenceInput,
  TaskCreateInput,
  TaskPatchInput,
} from '../shared/schemas.ts';
import type {
  Category,
  Memo,
  Note,
  NoteLabel,
  OverlayEvent,
  SeriesGraph,
  SeriesSummary,
  Task,
  TaskDetail,
  Template,
  TodayView,
} from '../shared/types.ts';
import { noteResponse, noteUnreachable } from './offline.ts';
import { toast } from './toast.ts';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

/** つながらなかった（電波がない・PC が止まっている）。サーバが返した失敗とは分ける */
export const isUnreachable = (e: unknown): boolean => e instanceof ApiError && e.status === 0;

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // つながらない（電波がない・PC が止まっている）。読み取りは、端末に残した中身も無かったときにここへ来る
    if (method === 'GET') {
      noteUnreachable();
      throw new ApiError('つながっていない（この画面はまだ端末に残っていない）', 0);
    }
    throw new ApiError('つながっていないので保存できなかった（つながってからもう一度）', 0);
  }
  if (method === 'GET') noteResponse(res);
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new ApiError(json?.error ?? `HTTP ${res.status}`, res.status);
  return json as T;
}

export const api = {
  today: () => req<TodayView>('GET', '/tasks?view=today'),
  inbox: () => req<Task[]>('GET', '/tasks?view=inbox'),
  all: (p: AllParams = {}) => {
    const qs = new URLSearchParams({ view: 'all' });
    if (p.q) qs.set('q', p.q);
    if (p.includeDone) qs.set('includeDone', 'true');
    if (p.doneSince) qs.set('doneSince', p.doneSince);
    if (p.categoryId) qs.set('category', String(p.categoryId));
    if (p.includeArchived) qs.set('includeArchived', 'true');
    return req<Task[]>('GET', `/tasks?${qs}`);
  },
  get: (id: number) => req<TaskDetail>('GET', `/tasks/${id}`),
  create: (input: TaskCreateInput) => req<TaskDetail>('POST', '/tasks', input),
  update: (id: number, patch: TaskPatchInput) => req<TaskDetail>('PATCH', `/tasks/${id}`, patch),
  remove: (id: number) => req<{ deleted: number }>('DELETE', `/tasks/${id}`),
  setDates: (id: number, dates: DoDateInput[]) => req<TaskDetail>('PUT', `/tasks/${id}/dates`, dates),
  addDep: (id: number, dependsOnId: number) =>
    req<TaskDetail>('POST', `/tasks/${id}/dependencies`, { dependsOnId }),
  removeDep: (id: number, dependsOnId: number) =>
    req<TaskDetail>('DELETE', `/tasks/${id}/dependencies/${dependsOnId}`),
  chainChildren: (id: number) => req<{ added: number }>('POST', `/tasks/${id}/chain-children`, {}),
  seriesList: () => req<SeriesSummary[]>('GET', '/series'),
  series: (id: number) => req<SeriesGraph>('GET', `/series/${id}`),
  templates: () => req<Template[]>('GET', '/templates'),
  /** 同じ名前があると 409（overwrite=true で置き換える） */
  saveTemplate: (taskId: number, name: string, overwrite = false) =>
    req<Template>('POST', '/templates', { taskId, name, overwrite }),
  renameTemplate: (id: number, name: string) => req<Template>('PATCH', `/templates/${id}`, { name }),
  deleteTemplate: (id: number) => req<{ ok: true }>('DELETE', `/templates/${id}`),
  applyTemplate: (id: number, p: { title?: string; date?: string | null }) =>
    req<TaskDetail>('POST', `/templates/${id}/apply`, p),
  setRecurrence: (id: number, r: RecurrenceInput | null) =>
    r ? req<TaskDetail>('PUT', `/tasks/${id}/recurrence`, r) : req<TaskDetail>('DELETE', `/tasks/${id}/recurrence`),
  categories: (includeArchived = false) =>
    req<Category[]>('GET', `/categories${includeArchived ? '?includeArchived=true' : ''}`),
  createCategory: (c: { name: string; color?: string }) => req<Category>('POST', '/categories', c),
  /** archived=true は、未完了が残っていると 409。cancelOpen=true で全部中止にしてからアーカイブする */
  updateCategory: (
    id: number,
    p: Partial<Pick<Category, 'name' | 'color' | 'position' | 'archived' | 'gcalCalendarId' | 'hideAfterDays' | 'hideFromPlan'>> & { cancelOpen?: boolean },
  ) => req<Category>('PATCH', `/categories/${id}`, p),
  gcalStatus: () => req<GcalStatus>('GET', '/gcal/status'),
  gcalConnect: () => req<{ url: string }>('GET', '/gcal/connect'),
  gcalCalendars: () => req<CalendarInfo[]>('GET', '/gcal/calendars'),
  gcalSync: () => req<GcalStatus>('POST', '/gcal/sync', {}),
  gcalDisconnect: () => req<GcalStatus>('POST', '/gcal/disconnect', {}),
  gcalEvents: (from: string, to: string) =>
    req<{ connected: boolean; events: OverlayEvent[] }>('GET', `/gcal/events?from=${from}&to=${to}`),
  deleteCategory: (id: number) => req<{ ok: true }>('DELETE', `/categories/${id}`),
  memos: (status: 'open' | 'done' | 'all' = 'open') => req<Memo[]>('GET', `/memos?status=${status}`),
  createMemo: (body: string) => req<Memo>('POST', '/memos', { body }),
  updateMemo: (id: number, patch: MemoPatchInput) => req<Memo>('PATCH', `/memos/${id}`, patch),
  deleteMemo: (id: number) => req<{ ok: true }>('DELETE', `/memos/${id}`),
  memoToTask: (id: number) => req<{ memo: Memo; task: TaskDetail }>('POST', `/memos/${id}/to-task`, {}),
  notes: (archived = false) => req<Note[]>('GET', `/notes${archived ? '?archived=1' : ''}`),
  noteLabels: () => req<NoteLabel[]>('GET', '/notes/labels'),
  createNote: (input: NoteCreateInput) => req<Note>('POST', '/notes', input),
  updateNote: (id: number, patch: NotePatchInput) => req<Note>('PATCH', `/notes/${id}`, patch),
  deleteNote: (id: number) => req<{ ok: true }>('DELETE', `/notes/${id}`),
  settings: () => req<AppSettings>('GET', '/settings'),
  updateSettings: (p: Partial<AppSettings>) => req<AppSettings>('PATCH', '/settings', p),
};

export interface AllParams {
  q?: string;
  includeDone?: boolean;
  /** 未完了に加えて、この日以降に完了・中止したもの */
  doneSince?: string;
  categoryId?: number;
  /** アーカイブしたカテゴリのタスクも */
  includeArchived?: boolean;
}

export interface AppSettings {
  dailyCapacityMin: number;
  dayStartMin: number;
  dayEndMin: number;
  gcalDefaultCalendarId: string | null;
}

/** Google カレンダー同期の状態（design 4-7・サーバの gcal/sync.ts と同じ形） */
export interface GcalStatus {
  configured: boolean;
  connected: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastResult: { created: number; updated: number; deleted: number; errors: string[] } | null;
  lastError: string | null;
  events: number;
}

export interface CalendarInfo {
  id: string;
  summary: string;
  primary: boolean;
}

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: api.settings });
export const useMemos = (status: 'open' | 'done' | 'all' = 'open') =>
  useQuery({ queryKey: ['memos', status], queryFn: () => api.memos(status) });
/** ノート（design 3-6e）。書き込んだら notes を全部取り直す */
export const useNotes = (archived = false) => useQuery({ queryKey: ['notes', archived], queryFn: () => api.notes(archived) });
export const useNoteLabels = () => useQuery({ queryKey: ['notes', 'labels'], queryFn: api.noteLabels });
/** メモの書き込み（タスク化でタスク側も変わるので両方取り直す） */
export const useMemoWrite = <A, R>(fn: (a: A) => Promise<R>) => useWrite(fn, [['memos'], ['tasks']]);

export const useToday = () => useQuery({ queryKey: ['tasks', 'today'], queryFn: api.today });
export const useInbox = () => useQuery({ queryKey: ['tasks', 'inbox'], queryFn: api.inbox });
export const useAllTasks = (p: AllParams) =>
  useQuery({ queryKey: ['tasks', 'all', p], queryFn: () => api.all(p) });
/** シリーズ（依存の図・v4）。tasks の下に置いて、書き込んだら一緒に取り直す */
export const useSeriesList = () => useQuery({ queryKey: ['tasks', 'series'], queryFn: api.seriesList });
/** テンプレート（design 4-8）。書き込んだらテンプレートとタスクの両方を取り直す */
export const useTemplates = () => useQuery({ queryKey: ['templates'], queryFn: api.templates });
export const useTemplateWrite = <A, R>(fn: (a: A) => Promise<R>) => useWrite(fn, [['templates'], ['tasks']]);
export const useSeries = (id: number | null) =>
  useQuery({ queryKey: ['tasks', 'series', id], queryFn: () => api.series(id!), enabled: id !== null });
export const useTask = (id: number | null) =>
  useQuery({ queryKey: ['tasks', 'detail', id], queryFn: () => api.get(id!), enabled: id !== null });
/** 重ねて見る Google の予定（v3）。サーバも5分覚えているので、ここでも5分は取り直さない */
export const useOverlay = (from: string, to: string, enabled: boolean) =>
  useQuery({
    queryKey: ['gcal', 'events', from, to],
    queryFn: () => api.gcalEvents(from, to),
    enabled,
    staleTime: 5 * 60_000,
    retry: 0,
  });
export const useCategories = (includeArchived = false) =>
  useQuery({ queryKey: ['categories', includeArchived], queryFn: () => api.categories(includeArchived) });

/** 書き込み用。終わったら（失敗でも）取り直し、失敗したらトーストで知らせる */
export function useWrite<A, R>(fn: (a: A) => Promise<R>, keys: string[][] = [['tasks']]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // 失敗したときも取り直す（先に動かして見せた画面を元に戻すため）
    onSettled: () => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k }))),
    onError: (e) => toast(e instanceof Error ? e.message : String(e), 'error'),
  });
}

export const useCategoryWrite = <A, R>(fn: (a: A) => Promise<R>) => useWrite(fn, [['categories'], ['tasks']]);
