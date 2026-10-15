// クイックメモ（設計の正= docs/design.md 3-6b）。

import type { Clock } from '../shared/dates.ts';
import { formatMemoCode } from '../shared/ids.ts';
import type { MemoPatchInput, TaskCreateInput } from '../shared/schemas.ts';
import type { Memo, TaskDetail } from '../shared/types.ts';
import { transaction, type DB, type Param } from './db.ts';
import { notFound } from './errors.ts';
import type { TaskService } from './tasks.ts';

interface MemoRow {
  id: number;
  body: string;
  status: 'open' | 'done';
  destination: string | null;
  task_id: number | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

function toMemo(r: MemoRow): Memo {
  return {
    id: r.id,
    code: formatMemoCode(r.id),
    body: r.body,
    status: r.status,
    destination: r.destination,
    taskId: r.task_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    processedAt: r.processed_at,
  };
}

/** 1行目をタイトル、残りをメモ欄に */
export function splitMemo(body: string): { title: string; notes: string } {
  const [first = '', ...rest] = body.trim().split(/\r?\n/);
  const title = first.trim();
  return title.length <= 500
    ? { title, notes: rest.join('\n').trim() }
    : { title: `${title.slice(0, 80)}…`, notes: body.trim() };
}

export class MemoService {
  constructor(
    private readonly db: DB,
    private readonly clock: Clock,
    private readonly tasks: TaskService,
  ) {}

  /** 未処理は新しい順、済は処理した順（新しい順） */
  list(opts: { status?: 'open' | 'done' | 'all'; q?: string } = {}): Memo[] {
    const status = opts.status ?? 'open';
    const where: string[] = [];
    const params: Param[] = [];
    if (status !== 'all') {
      where.push('status = ?');
      params.push(status);
    }
    const q = opts.q?.trim();
    if (q) {
      where.push(`(body LIKE ? ESCAPE '\\' OR destination LIKE ? ESCAPE '\\')`);
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      params.push(like, like);
    }
    const order = status === 'done' ? 'processed_at DESC, id DESC' : 'created_at DESC, id DESC';
    const rows = this.db
      .prepare(`SELECT * FROM memos ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order}`)
      .all(...params) as unknown as MemoRow[];
    return rows.map(toMemo);
  }

  get(id: number): Memo {
    const r = this.db.prepare('SELECT * FROM memos WHERE id = ?').get(id) as MemoRow | undefined;
    if (!r) throw notFound(`メモ ${formatMemoCode(id)}`);
    return toMemo(r);
  }

  create(body: string): Memo {
    const now = this.clock.now();
    const res = this.db
      .prepare('INSERT INTO memos (body, created_at, updated_at) VALUES (?, ?, ?)')
      .run(body.trim(), now, now);
    return this.get(Number(res.lastInsertRowid));
  }

  update(id: number, patch: MemoPatchInput): Memo {
    const cur = this.get(id);
    const now = this.clock.now();
    const sets: string[] = [];
    const vals: Param[] = [];
    const set = (col: string, v: Param) => (sets.push(`${col} = ?`), vals.push(v));
    if (patch.body !== undefined) set('body', patch.body.trim());
    if (patch.destination !== undefined) set('destination', patch.destination || null);
    if (patch.status !== undefined && patch.status !== cur.status) {
      set('status', patch.status);
      set('processed_at', patch.status === 'done' ? now : null);
    }
    if (sets.length) {
      set('updated_at', now);
      this.db.prepare(`UPDATE memos SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
    }
    return this.get(id);
  }

  delete(id: number): void {
    this.get(id);
    this.db.prepare('DELETE FROM memos WHERE id = ?').run(id);
  }

  /** メモからタスクを作り、メモは「済・タスク T-xxx」にする */
  toTask(id: number, extra: Omit<TaskCreateInput, 'title'> & { title?: string } = {}): { memo: Memo; task: TaskDetail } {
    return transaction(this.db, () => {
      const memo = this.get(id);
      const { title, notes } = splitMemo(memo.body);
      const task = this.tasks.create({ ...extra, title: extra.title ?? title, notes: extra.notes ?? notes });
      const now = this.clock.now();
      this.db
        .prepare(
          `UPDATE memos SET status = 'done', destination = ?, task_id = ?, processed_at = ?, updated_at = ? WHERE id = ?`,
        )
        .run(`タスク ${task.code}`, task.id, now, now, id);
      return { memo: this.get(id), task };
    });
  }

  openCount(): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM memos WHERE status = 'open'`).get() as { n: number }).n;
  }
}
