// タスクのサービス層。画面（API）と AI（MCP）は必ずここを通る（設計の正= docs/design.md 4章）。

import { addDays, diffDays, maxDate, type Clock } from '../shared/dates.ts';
import { formatTaskCode, parseTaskRef } from '../shared/ids.ts';
import { firstDate, nextDate, type RecurrenceRule } from '../shared/recurrence.ts';
import {
  isOpen,
  type DoDateInput,
  type RecurrenceInput,
  type Status,
  type TaskCreateInput,
  type TaskPatchInput,
} from '../shared/schemas.ts';
import { TOP_SERIES_TITLE } from '../shared/constants.ts';
import { rankNext, waitingSoon } from '../shared/next.ts';
import { askToClose, isContainer, isFinishedSeries, nextSteps } from '../shared/series.ts';
import type {
  Recurrence,
  SeriesGraph,
  SeriesSummary,
  Task,
  TaskDetail,
  TaskRef,
  TodayView,
} from '../shared/types.ts';
import { placeholders, transaction, type DB, type Param } from './db.ts';
import { badRequest, conflict, notFound } from './errors.ts';

interface TaskRow {
  id: number;
  parent_id: number | null;
  position: number;
  title: string;
  status: Status;
  category_id: number | null;
  priority: 1 | 2 | 3 | null;
  due_date: string | null;
  due_time: string | null;
  estimate_min: number | null;
  actual_min: number | null;
  notes: string;
  recurrence_id: number | null;
  legacy_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface RecurrenceRow {
  id: number;
  kind: Recurrence['kind'];
  weekdays: string | null;
  month_day: number | null;
  interval_days: number | null;
  anchor: 'do' | 'due';
  active: number;
}

const OPEN_SQL = `('todo', 'doing', 'waiting')`;
/** アーカイブしたカテゴリのタスクは、今日・一覧・ボードに出さない（design 4-6） */
const NOT_ARCHIVED_SQL = `(t.category_id IS NULL OR t.category_id NOT IN (SELECT id FROM categories WHERE archived = 1))`;

export interface ListOptions {
  categoryId?: number;
  q?: string;
  includeDone?: boolean;
  /** 未完了に加えて、この日以降に完了・中止したものも返す（YYYY-MM-DD） */
  doneSince?: string;
  /**
   * アーカイブしたカテゴリのタスクも返す。アーカイブ分は完了・中止も含めて全部（終わった記録として見返す用）。
   * categoryId を指定したときは、アーカイブ済みでもそのカテゴリを返す
   */
  includeArchived?: boolean;
}

/** 優先度が高い順 → 締切が早い順 → 番号順 */
export function byUrgency(a: Task, b: Task): number {
  return (
    (a.priority ?? 9) - (b.priority ?? 9) ||
    (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') ||
    (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') ||
    a.id - b.id
  );
}

function toRule(r: RecurrenceRow): RecurrenceRule {
  switch (r.kind) {
    case 'weekly':
      return { kind: 'weekly', weekdays: (r.weekdays ?? '').split(',').filter(Boolean).map(Number) };
    case 'monthly':
      return { kind: 'monthly', monthDay: r.month_day ?? 1 };
    case 'interval':
      return { kind: 'interval', intervalDays: r.interval_days ?? 1 };
    case 'after_done':
      return { kind: 'after_done', intervalDays: r.interval_days ?? 1 };
  }
}

function toRecurrence(r: RecurrenceRow): Recurrence {
  return {
    id: r.id,
    kind: r.kind,
    weekdays: r.weekdays ? r.weekdays.split(',').map(Number) : null,
    monthDay: r.month_day,
    intervalDays: r.interval_days,
    anchor: r.anchor,
    active: r.active === 1,
  };
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export class TaskService {
  constructor(
    private readonly db: DB,
    private readonly clock: Clock,
  ) {}

  // ───────────── 読み取り

  get(id: number): TaskDetail {
    const [task] = this.hydrate([this.row(id)]);
    const dependents = this.db
      .prepare(
        `SELECT t.id, t.title, t.status FROM dependencies d JOIN tasks t ON t.id = d.task_id
         WHERE d.depends_on_id = ? ORDER BY t.id`,
      )
      .all(id) as { id: number; title: string; status: Status }[];
    const childTasks = this.hydrate(
      this.rows('SELECT * FROM tasks WHERE parent_id = ? ORDER BY position, id', [id]),
    );
    return { ...task!, dependents: dependents.map(toRef), childTasks, descendantCount: this.countDescendants(id) };
  }

  /** 子・孫…の総数（自分は含まない） */
  private countDescendants(id: number): number {
    const { n } = this.db
      .prepare(
        `WITH RECURSIVE sub(id) AS (
           SELECT id FROM tasks WHERE parent_id = ? UNION ALL SELECT t.id FROM tasks t JOIN sub ON t.parent_id = sub.id)
         SELECT COUNT(*) AS n FROM sub`,
      )
      .get(id) as { n: number };
    return n;
  }

  today(): TodayView {
    const today = this.clock.today();
    const soon = addDays(today, 7);
    const tasks = this.hydrate(
      this.rows(
        `SELECT t.* FROM tasks t WHERE t.status IN ${OPEN_SQL} AND ${NOT_ARCHIVED_SQL} AND (
           (t.due_date IS NOT NULL AND t.due_date <= ?)
           OR EXISTS (SELECT 1 FROM task_dates d WHERE d.task_id = t.id AND d.date <= ?))`,
        [soon, today],
      ),
    );
    // 「次にやること」は日付の無い進行中や、親から受け継ぐ子も見るので、未完了の全件から並べる（design 4-10）
    const open = this.all();
    const view: TodayView = {
      today,
      now: this.clock.now().slice(11, 16),
      overdue: [],
      todo: [],
      dueSoon: [],
      doneToday: [],
      ranked: rankNext(open, today),
      waiting: waitingSoon(open, today),
      deadlines: open
        .filter((t) => t.dueDate === today && t.dueTime !== null)
        .sort((a, b) => a.dueTime!.localeCompare(b.dueTime!) || a.id - b.id),
      placed: open
        .filter((t) => t.doDates.some((d) => d.date === today && d.start))
        .sort((a, b) => startOn(a, today).localeCompare(startOn(b, today)) || a.id - b.id),
      closable: open.filter(askToClose).sort(byUrgency),
      seriesDue: [],
      steps: {},
    };
    // 子が残っている親は「まとめ役」なので、期限切れ・今日やる・締切間近には入れず、締切が近ければ「シリーズの締切」へ。
    // 子が全部終わった親は「閉じる？」（closable）に出す（design 4-3）
    for (const t of tasks) {
      if (isFinishedSeries(t)) continue;
      if (isContainer(t)) {
        if (t.dueDate && t.dueDate <= soon) view.seriesDue.push(t);
        continue;
      }
      const dates = t.doDates.map((d) => d.date);
      const hasToday = dates.includes(today);
      const carried = !hasToday && dates.length > 0 && maxDate(dates)! < today;
      if (t.dueDate && t.dueDate < today) view.overdue.push(t);
      else if (hasToday || carried) view.todo.push({ ...t, carriedOver: carried });
      else if (t.dueDate && t.dueDate <= soon) view.dueSoon.push(t);
    }
    view.overdue.sort(byUrgency);
    view.todo.sort(byUrgency);
    view.dueSoon.sort(byUrgency);
    view.seriesDue.sort(byUrgency);
    const steps = nextSteps(open);
    for (const t of view.seriesDue) view.steps[t.id] = (steps.get(t.id) ?? []).map((c) => c.code);
    view.doneToday = this.hydrate(
      this.rows(
        `SELECT t.* FROM tasks t WHERE t.status = 'done' AND substr(t.completed_at, 1, 10) = ? AND ${NOT_ARCHIVED_SQL}
         ORDER BY t.completed_at DESC`,
        [today],
      ),
    );
    return view;
  }

  /** 一覧（木構造は画面側で組む） */
  all(opts: ListOptions = {}): Task[] {
    const where: string[] = [];
    const params: Param[] = [];
    let status: string | null = null;
    if (opts.doneSince && !opts.includeDone) {
      // 中止には completed_at が無いので、中止した時刻として updated_at を見る
      status = `(t.status IN ${OPEN_SQL}
          OR (t.status = 'done' AND substr(t.completed_at, 1, 10) >= ?)
          OR (t.status = 'canceled' AND substr(t.updated_at, 1, 10) >= ?))`;
      params.push(opts.doneSince, opts.doneSince);
    } else if (!opts.includeDone) {
      status = `t.status IN ${OPEN_SQL}`;
    }
    if (opts.categoryId) {
      if (status) where.push(status);
      where.push('t.category_id = ?');
      params.push(opts.categoryId);
    } else if (opts.includeArchived) {
      // アーカイブしたカテゴリは終わった記録なので、完了・中止も含めて全部出す
      where.push(status ? `(${status} OR NOT ${NOT_ARCHIVED_SQL})` : '1');
    } else {
      if (status) where.push(status);
      where.push(NOT_ARCHIVED_SQL);
    }
    const q = opts.q?.trim();
    if (q) {
      const like = `%${escapeLike(q)}%`;
      const ref = parseTaskRef(q);
      where.push(
        `(t.title LIKE ? ESCAPE '\\' OR t.notes LIKE ? ESCAPE '\\' OR t.legacy_id = ?${ref ? ' OR t.id = ?' : ''})`,
      );
      params.push(like, like, q);
      if (ref) params.push(ref);
    }
    const sql = `SELECT t.* FROM tasks t ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY t.position, t.id`;
    return this.hydrate(this.rows(sql, params));
  }

  /** 未整理＝トップレベルで、カテゴリ・やる日・締切がどれも空の未完了タスク */
  inbox(): Task[] {
    return this.hydrate(
      this.rows(
        `SELECT t.* FROM tasks t WHERE t.status IN ${OPEN_SQL}
           AND t.parent_id IS NULL AND t.category_id IS NULL AND t.due_date IS NULL
           AND NOT EXISTS (SELECT 1 FROM task_dates d WHERE d.task_id = t.id)
         ORDER BY t.created_at DESC, t.id DESC`,
      ),
    );
  }

  /**
   * シリーズ（子を持つタスク）の一覧（v4・design 7-12）。進行中を締切順に、その後に「親なし」、終わったものは最後に新しい順。
   * 「親なし」（id 0）は、いちばん上の段のタスクどうしに依存があるときだけ出す
   */
  seriesList(): SeriesSummary[] {
    const parents = this.hydrate(
      this.rows(
        `SELECT t.* FROM tasks t WHERE EXISTS (SELECT 1 FROM tasks c WHERE c.parent_id = t.id) AND ${NOT_ARCHIVED_SQL}`,
      ),
    );
    const edges = new Map(
      (
        this.db
          .prepare(
            `SELECT p.id, COUNT(DISTINCT d.task_id || '>' || d.depends_on_id) AS n FROM tasks p
               JOIN tasks c ON c.parent_id = p.id
               JOIN dependencies d ON d.task_id = c.id OR d.depends_on_id = c.id
             GROUP BY p.id`,
          )
          .all() as { id: number; n: number }[]
      ).map((r) => [r.id, r.n]),
    );
    const summary = (t: Task): SeriesSummary => ({
      id: t.id,
      code: t.code,
      title: t.title,
      status: t.status,
      categoryId: t.categoryId,
      dueDate: t.dueDate,
      children: t.children,
      edges: edges.get(t.id) ?? 0,
    });
    const open = parents.filter((t) => isOpen(t.status));
    open.sort(
      (a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99') || a.id - b.id,
    );
    const closed = parents.filter((t) => !isOpen(t.status)).sort((a, b) => b.id - a.id);
    const top = this.topLevelGraph();
    const topSummary: SeriesSummary[] = top.edges.length
      ? [
          {
            id: 0,
            code: '',
            title: TOP_SERIES_TITLE,
            status: 'todo',
            categoryId: null,
            dueDate: null,
            children: {
              total: top.nodes.filter((t) => t.status !== 'canceled').length,
              done: top.nodes.filter((t) => t.status === 'done').length,
            },
            edges: top.edges.length,
          },
        ]
      : [];
    return [...open.map(summary), ...topSummary, ...closed.map(summary)];
  }

  /** シリーズの図の材料（v4）。id 0 は「親なし」 */
  series(id: number): SeriesGraph {
    if (id === 0) return { parent: null, ...this.topLevelGraph() };
    const [parent] = this.hydrate([this.row(id)]);
    const nodes = this.hydrate(this.rows('SELECT * FROM tasks WHERE parent_id = ? ORDER BY position, id', [id]));
    return { parent: parent!, ...this.graphOf(nodes) };
  }

  /**
   * いちばん上の段で、同じくいちばん上の段のタスクと依存でつながっているもの（両端とも終わった線しか無いものは出さない）。
   * 子との線は、その子のシリーズの図に出るのでここでは数えない（図には外のノードとして出る）
   */
  private topLevelGraph(): Omit<SeriesGraph, 'parent'> {
    const members = this.hydrate(
      this.rows(
        `SELECT t.* FROM tasks t WHERE t.parent_id IS NULL AND ${NOT_ARCHIVED_SQL} AND EXISTS (
           SELECT 1 FROM dependencies d
             JOIN tasks o ON o.id = CASE WHEN d.task_id = t.id THEN d.depends_on_id ELSE d.task_id END
           WHERE (d.task_id = t.id OR d.depends_on_id = t.id) AND o.parent_id IS NULL
             AND (t.status IN ${OPEN_SQL} OR o.status IN ${OPEN_SQL}))
         ORDER BY t.position, t.id`,
      ),
    );
    return this.graphOf(members);
  }

  /** 中身のタスクに触れている線と、線の先にある外のタスク */
  private graphOf(nodes: Task[]): Omit<SeriesGraph, 'parent'> {
    if (nodes.length === 0) return { nodes, outside: [], edges: [] };
    const ids = nodes.map((t) => t.id);
    const ph = placeholders(ids.length);
    const edges = (
      this.db
        .prepare(
          `SELECT depends_on_id AS a, task_id AS b FROM dependencies
           WHERE task_id IN (${ph}) OR depends_on_id IN (${ph}) ORDER BY depends_on_id, task_id`,
        )
        .all(...ids, ...ids) as { a: number; b: number }[]
    ).map((r) => ({ from: r.a, to: r.b }));
    const inside = new Set(ids);
    const outsideIds = [...new Set(edges.flatMap((e) => [e.from, e.to]))].filter((x) => !inside.has(x));
    const outside = outsideIds.length
      ? this.hydrate(this.rows(`SELECT * FROM tasks WHERE id IN (${placeholders(outsideIds.length)}) ORDER BY id`, outsideIds))
      : [];
    return { nodes, outside, edges };
  }

  // ───────────── 書き込み

  /** opts.id は以前の一覧（tasks.md）から取り込むとき専用（番号を引き継ぐ） */
  create(input: TaskCreateInput, opts: { id?: number; legacyId?: string } = {}): TaskDetail {
    return transaction(this.db, () => {
      const now = this.clock.now();
      const parentId = input.parentId ?? null;
      let categoryId = input.categoryId;
      if (parentId !== null) {
        const parent = this.row(parentId, '親タスク');
        if (categoryId === undefined) categoryId = parent.category_id;
      }
      if (categoryId != null) this.assertCategory(categoryId);
      if (input.dueTime && !input.dueDate) throw badRequest('締切時刻だけは入れられない（締切日も入れて）');

      const status = input.status ?? 'todo';
      const cols = [
        'parent_id', 'position', 'title', 'status', 'category_id', 'priority', 'due_date', 'due_time',
        'estimate_min', 'notes', 'legacy_id', 'created_at', 'updated_at', 'completed_at',
      ];
      const vals: Param[] = [
        parentId, this.nextPosition(parentId), input.title.trim(), status, categoryId ?? null,
        input.priority ?? null, input.dueDate ?? null, input.dueTime ?? null, input.estimateMin ?? null,
        input.notes ?? '', opts.legacyId ?? null, now, now, status === 'done' ? now : null,
      ];
      if (opts.id !== undefined) {
        if (this.exists(opts.id)) throw conflict(`${formatTaskCode(opts.id)} は既にある`);
        cols.unshift('id');
        vals.unshift(opts.id);
      }
      const res = this.db
        .prepare(`INSERT INTO tasks (${cols.join(', ')}) VALUES (${placeholders(cols.length)})`)
        .run(...vals);
      const id = Number(res.lastInsertRowid);
      if (input.doDates?.length) this.writeDoDates(id, input.doDates);
      for (const dep of input.dependsOn ?? []) this.insertDependency(id, dep);
      if (input.recurrence) this.writeRecurrence(id, input.recurrence);
      return this.get(id);
    });
  }

  update(id: number, patch: TaskPatchInput): TaskDetail {
    return transaction(this.db, () => {
      const cur = this.row(id);
      const now = this.clock.now();
      const sets: string[] = [];
      const vals: Param[] = [];
      const set = (col: string, v: Param) => {
        sets.push(`${col} = ?`);
        vals.push(v);
      };

      if (patch.title !== undefined) set('title', patch.title.trim());
      if (patch.parentId !== undefined && patch.parentId !== cur.parent_id) {
        if (patch.parentId !== null) this.assertCanBeParent(id, patch.parentId);
        set('parent_id', patch.parentId);
        set('position', patch.position ?? this.nextPosition(patch.parentId));
      } else if (patch.position !== undefined) {
        set('position', patch.position);
      }
      if (patch.categoryId !== undefined) {
        if (patch.categoryId !== null) this.assertCategory(patch.categoryId);
        set('category_id', patch.categoryId);
      }
      if (patch.priority !== undefined) set('priority', patch.priority);
      if (patch.estimateMin !== undefined) set('estimate_min', patch.estimateMin);
      if (patch.actualMin !== undefined) set('actual_min', patch.actualMin);
      if (patch.notes !== undefined) set('notes', patch.notes);

      // 締切日を消したら時刻も消す
      const dueDate = patch.dueDate !== undefined ? patch.dueDate : cur.due_date;
      const dueTime = patch.dueTime !== undefined ? patch.dueTime : dueDate === null ? null : cur.due_time;
      if (dueTime && !dueDate) throw badRequest('締切時刻だけは入れられない（締切日も入れて）');
      if (dueDate !== cur.due_date) set('due_date', dueDate);
      if (dueTime !== cur.due_time) set('due_time', dueTime);

      let spawnNext = false;
      if (patch.status !== undefined && patch.status !== cur.status) {
        set('status', patch.status);
        if (patch.status === 'done') set('completed_at', now);
        else if (cur.status === 'done') set('completed_at', null);
        spawnNext = cur.recurrence_id !== null && isOpen(cur.status) && !isOpen(patch.status);
      }

      if (sets.length > 0) {
        set('updated_at', now);
        this.db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
      }
      if (spawnNext) this.spawnNextInstance(id);
      return this.get(id);
    });
  }

  /** 子孫ごと消す。消えた件数を返す */
  delete(id: number): { deleted: number } {
    return transaction(this.db, () => {
      this.row(id);
      const deleted = 1 + this.countDescendants(id);
      this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      return { deleted };
    });
  }

  /** やる日を丸ごと置き換える */
  setDoDates(id: number, dates: DoDateInput[]): TaskDetail {
    return transaction(this.db, () => {
      this.row(id);
      this.writeDoDates(id, dates);
      this.touch(id);
      return this.get(id);
    });
  }

  addDependency(id: number, dependsOnId: number): TaskDetail {
    return transaction(this.db, () => {
      this.row(id);
      this.insertDependency(id, dependsOnId);
      this.touch(id);
      return this.get(id);
    });
  }

  /**
   * 子を並び順どおりに一列につなぐ（v4・design 7-12）。中止した子は飛ばし、既にある線はそのまま。
   * 1本でも循環になるなら、何もつながずに断る
   */
  chainChildren(parentId: number): { added: number } {
    return transaction(this.db, () => {
      this.row(parentId);
      const kids = (
        this.db
          .prepare(`SELECT id FROM tasks WHERE parent_id = ? AND status <> 'canceled' ORDER BY position, id`)
          .all(parentId) as { id: number }[]
      ).map((r) => r.id);
      const exists = this.db.prepare('SELECT 1 FROM dependencies WHERE task_id = ? AND depends_on_id = ?');
      let added = 0;
      for (let i = 1; i < kids.length; i++) {
        const [before, after] = [kids[i - 1]!, kids[i]!];
        if (exists.get(after, before) !== undefined) continue;
        this.insertDependency(after, before);
        this.touch(after);
        added++;
      }
      return { added };
    });
  }

  removeDependency(id: number, dependsOnId: number): TaskDetail {
    return transaction(this.db, () => {
      this.row(id);
      this.db.prepare('DELETE FROM dependencies WHERE task_id = ? AND depends_on_id = ?').run(id, dependsOnId);
      this.touch(id);
      return this.get(id);
    });
  }

  /** null で解除（ルールを止めて、このタスクとの紐づけを外す） */
  setRecurrence(id: number, input: RecurrenceInput | null): TaskDetail {
    return transaction(this.db, () => {
      const cur = this.row(id);
      if (input) {
        this.writeRecurrence(id, input);
      } else if (cur.recurrence_id !== null) {
        this.db.prepare('UPDATE recurrences SET active = 0 WHERE id = ?').run(cur.recurrence_id);
        this.db.prepare('UPDATE tasks SET recurrence_id = NULL WHERE id = ?').run(id);
      }
      this.touch(id);
      return this.get(id);
    });
  }

  /**
   * カテゴリのアーカイブ（design 4-6）。そのカテゴリのタスクは今日・一覧・ボードから隠れる。
   * 未完了が残っているときは cancelOpen=true のときだけ、全部中止にしてからアーカイブする
   * （隠れたまま締切が過ぎるのを防ぐ）。中止した繰り返しは次の回を作らないよう止める。
   */
  archiveCategory(categoryId: number, cancelOpen: boolean): { canceled: number } {
    return transaction(this.db, () => {
      const cat = this.db.prepare('SELECT name FROM categories WHERE id = ?').get(categoryId) as
        | { name: string }
        | undefined;
      if (!cat) throw notFound(`カテゴリ #${categoryId}`);
      const open = this.db
        .prepare(`SELECT id, recurrence_id FROM tasks WHERE category_id = ? AND status IN ${OPEN_SQL} ORDER BY id`)
        .all(categoryId) as { id: number; recurrence_id: number | null }[];
      if (open.length && !cancelOpen) {
        const codes = open.slice(0, 3).map((r) => formatTaskCode(r.id)).join('・');
        throw conflict(
          `「${cat.name}」に未完了のタスクが ${open.length} 件ある（${codes}${open.length > 3 ? ' ほか' : ''}）。中止にしてからアーカイブする`,
        );
      }
      const now = this.clock.now();
      const note = `中止: カテゴリ「${cat.name}」をアーカイブ（${this.clock.today()}）`;
      for (const r of open) {
        if (r.recurrence_id !== null) {
          this.db.prepare('UPDATE recurrences SET active = 0 WHERE id = ?').run(r.recurrence_id);
        }
        this.db
          .prepare(
            `UPDATE tasks SET status = 'canceled', updated_at = ?,
               notes = CASE WHEN notes = '' THEN ? ELSE notes || char(10) || ? END
             WHERE id = ?`,
          )
          .run(now, note, note, r.id);
      }
      this.db.prepare('UPDATE categories SET archived = 1 WHERE id = ?').run(categoryId);
      return { canceled: open.length };
    });
  }

  // ───────────── 内部

  private rows(sql: string, params: Param[] = []): TaskRow[] {
    return this.db.prepare(sql).all(...params) as unknown as TaskRow[];
  }

  private row(id: number, what = 'タスク'): TaskRow {
    const r = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    if (!r) throw notFound(`${what} ${formatTaskCode(id)}`);
    return r;
  }

  private exists(id: number): boolean {
    return this.db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(id) !== undefined;
  }

  private touch(id: number): void {
    this.db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(this.clock.now(), id);
  }

  private nextPosition(parentId: number | null): number {
    const r = this.db
      .prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM tasks WHERE parent_id IS ?')
      .get(parentId) as { p: number };
    return r.p;
  }

  private assertCategory(id: number): void {
    if (this.db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id) === undefined) {
      throw notFound(`カテゴリ #${id}`);
    }
  }

  /** 自分自身や自分の子孫を親にはできない */
  private assertCanBeParent(id: number, parentId: number): void {
    let cursor: number | null = parentId;
    while (cursor !== null) {
      if (cursor === id) throw conflict('自分自身や自分の子孫を親にはできない');
      cursor = this.row(cursor, '親タスク').parent_id;
    }
  }

  private insertDependency(id: number, dependsOnId: number): void {
    if (id === dependsOnId) throw badRequest('自分自身には依存できない');
    this.row(dependsOnId, '依存先');
    // dependsOnId が（間接的にでも）id に依存していたら循環になる
    const cycle = this.db
      .prepare(
        `WITH RECURSIVE r(x) AS (
           SELECT depends_on_id FROM dependencies WHERE task_id = ?
           UNION SELECT d.depends_on_id FROM dependencies d JOIN r ON d.task_id = r.x)
         SELECT 1 FROM r WHERE x = ? LIMIT 1`,
      )
      .get(dependsOnId, id);
    if (cycle !== undefined || dependsOnId === id) {
      throw conflict(`循環する依存になる（${formatTaskCode(dependsOnId)} は既に ${formatTaskCode(id)} の後にある）`);
    }
    this.db.prepare('INSERT OR IGNORE INTO dependencies (task_id, depends_on_id) VALUES (?, ?)').run(id, dependsOnId);
  }

  private writeDoDates(id: number, dates: DoDateInput[]): void {
    const byDate = new Map(dates.map((d) => [d.date, d]));
    const keep = [...byDate.keys()];
    if (keep.length === 0) {
      this.db.prepare('DELETE FROM task_dates WHERE task_id = ?').run(id);
      return;
    }
    this.db
      .prepare(`DELETE FROM task_dates WHERE task_id = ? AND date NOT IN (${placeholders(keep.length)})`)
      .run(id, ...keep);
    // 時刻（start）は、省いたら今のまま・null なら消す
    const upsert = this.db.prepare(
      `INSERT INTO task_dates (task_id, date, minutes, start_time) VALUES (?, ?, ?, ?)
       ON CONFLICT (task_id, date) DO UPDATE SET minutes = excluded.minutes,
         start_time = CASE WHEN ? THEN excluded.start_time ELSE start_time END`,
    );
    for (const [date, d] of byDate) upsert.run(id, date, d.minutes ?? null, d.start ?? null, d.start !== undefined ? 1 : 0);
  }

  private writeRecurrence(id: number, input: RecurrenceInput): void {
    const cur = this.row(id);
    const anchor = input.anchor ?? 'do';
    const weekdays = input.kind === 'weekly' ? [...new Set(input.weekdays)].sort().join(',') : null;
    const monthDay = input.kind === 'monthly' ? input.monthDay : null;
    const intervalDays = input.kind === 'interval' || input.kind === 'after_done' ? input.intervalDays : null;
    const values = [input.kind, weekdays, monthDay, intervalDays, anchor];

    let recId = cur.recurrence_id;
    if (recId !== null) {
      this.db
        .prepare(
          `UPDATE recurrences SET kind = ?, weekdays = ?, month_day = ?, interval_days = ?, anchor = ?, active = 1
           WHERE id = ?`,
        )
        .run(...values, recId);
    } else {
      const res = this.db
        .prepare('INSERT INTO recurrences (kind, weekdays, month_day, interval_days, anchor) VALUES (?, ?, ?, ?, ?)')
        .run(...values);
      recId = Number(res.lastInsertRowid);
      this.db.prepare('UPDATE tasks SET recurrence_id = ? WHERE id = ?').run(recId, id);
    }

    // 基準の日付がまだ無ければ、最初の回の日付を入れる
    const rule = toRule(this.recurrenceRow(recId)!);
    const first = firstDate(rule, this.clock.today());
    if (anchor === 'do') {
      const has = this.db.prepare('SELECT 1 FROM task_dates WHERE task_id = ?').get(id);
      if (has === undefined) this.writeDoDates(id, [{ date: first }]);
    } else if (cur.due_date === null) {
      this.db.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').run(first, id);
    }
  }

  private recurrenceRow(id: number): RecurrenceRow | undefined {
    return this.db.prepare('SELECT * FROM recurrences WHERE id = ?').get(id) as RecurrenceRow | undefined;
  }

  /** 繰り返しの今の回が終わったら次の回を作る（未完了の回は常に1つだけ） */
  private spawnNextInstance(id: number): void {
    const inst = this.row(id);
    if (inst.recurrence_id === null) return;
    const rec = this.recurrenceRow(inst.recurrence_id);
    if (!rec || rec.active !== 1) return;
    const otherOpen = this.db
      .prepare(`SELECT 1 FROM tasks WHERE recurrence_id = ? AND id <> ? AND status IN ${OPEN_SQL} LIMIT 1`)
      .get(rec.id, id);
    if (otherOpen !== undefined) return;

    const today = this.clock.today();
    const dates = this.db
      .prepare('SELECT date, minutes, start_time FROM task_dates WHERE task_id = ? ORDER BY date')
      .all(id) as { date: string; minutes: number | null; start_time: string | null }[];
    const current = rec.anchor === 'do' ? maxDate(dates.map((d) => d.date)) : inst.due_date;
    const next = nextDate(toRule(rec), { current, today, completedOn: today });

    const base: TaskCreateInput = {
      title: inst.title,
      parentId: inst.parent_id,
      categoryId: inst.category_id,
      priority: inst.priority,
      estimateMin: inst.estimate_min,
      notes: inst.notes,
    };
    let created: TaskDetail;
    if (rec.anchor === 'do') {
      const delta = current ? diffDays(next, current) : null;
      const dueDate = inst.due_date && delta !== null ? addDays(inst.due_date, delta) : null;
      created = this.create({
        ...base,
        doDates: [
          {
            date: next,
            minutes: dates.find((d) => d.date === current)?.minutes ?? null,
            start: dates.find((d) => d.date === current)?.start_time ?? null,
          },
        ],
        dueDate,
        dueTime: dueDate ? inst.due_time : null,
      });
    } else {
      created = this.create({ ...base, dueDate: next, dueTime: inst.due_time });
    }
    this.db.prepare('UPDATE tasks SET recurrence_id = ? WHERE id = ?').run(rec.id, created.id);
  }

  /** 行を API の形にする（やる日・依存・子の数・親の名前・繰り返しをまとめて引く） */
  private hydrate(rows: TaskRow[]): Task[] {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const ph = placeholders(ids.length);

    const dates = new Map<number, Task['doDates']>();
    for (const d of this.db
      .prepare(`SELECT task_id, date, minutes, start_time FROM task_dates WHERE task_id IN (${ph}) ORDER BY date`)
      .all(...ids) as { task_id: number; date: string; minutes: number | null; start_time: string | null }[]) {
      dates.set(d.task_id, [...(dates.get(d.task_id) ?? []), { date: d.date, minutes: d.minutes, start: d.start_time }]);
    }

    const deps = new Map<number, TaskRef[]>();
    for (const d of this.db
      .prepare(
        `SELECT d.task_id, t.id, t.title, t.status FROM dependencies d JOIN tasks t ON t.id = d.depends_on_id
         WHERE d.task_id IN (${ph}) ORDER BY t.id`,
      )
      .all(...ids) as { task_id: number; id: number; title: string; status: Status }[]) {
      deps.set(d.task_id, [...(deps.get(d.task_id) ?? []), toRef(d)]);
    }

    const kids = new Map<number, { total: number; done: number }>();
    for (const k of this.db
      .prepare(
        `SELECT parent_id, COUNT(*) AS total, SUM(status = 'done') AS done FROM tasks
         WHERE parent_id IN (${ph}) AND status <> 'canceled' GROUP BY parent_id`,
      )
      .all(...ids) as { parent_id: number; total: number; done: number }[]) {
      kids.set(k.parent_id, { total: k.total, done: k.done ?? 0 });
    }

    // 祖先（親・その上）が依存待ちか「待ち」なら、子孫も手を付けられない（design 4-2・4-3）。いちばん近いその祖先を覚える
    const waitVia = new Map<number, TaskRef>();
    for (const a of this.db
      .prepare(
        `WITH RECURSIVE up(task_id, anc_id, depth) AS (
           SELECT id, parent_id, 1 FROM tasks WHERE id IN (${ph}) AND parent_id IS NOT NULL
           UNION ALL
           SELECT up.task_id, p.parent_id, up.depth + 1 FROM up JOIN tasks p ON p.id = up.anc_id
           WHERE p.parent_id IS NOT NULL AND up.depth < 20)
         SELECT up.task_id, a.id, a.title, a.status FROM up JOIN tasks a ON a.id = up.anc_id
         WHERE a.status IN ${OPEN_SQL} AND (a.status = 'waiting' OR EXISTS (
           SELECT 1 FROM dependencies d JOIN tasks x ON x.id = d.depends_on_id
           WHERE d.task_id = a.id AND x.status IN ${OPEN_SQL}))
         ORDER BY up.task_id, up.depth`,
      )
      .all(...ids) as { task_id: number; id: number; title: string; status: Status }[]) {
      if (!waitVia.has(a.task_id)) waitVia.set(a.task_id, toRef(a));
    }

    const parentIds = [...new Set(rows.map((r) => r.parent_id).filter((x): x is number => x !== null))];
    const parentTitles = new Map<number, string>();
    if (parentIds.length) {
      for (const p of this.db
        .prepare(`SELECT id, title FROM tasks WHERE id IN (${placeholders(parentIds.length)})`)
        .all(...parentIds) as { id: number; title: string }[]) {
        parentTitles.set(p.id, p.title);
      }
    }

    const recIds = [...new Set(rows.map((r) => r.recurrence_id).filter((x): x is number => x !== null))];
    const recs = new Map<number, Recurrence>();
    if (recIds.length) {
      for (const r of this.db
        .prepare(`SELECT * FROM recurrences WHERE id IN (${placeholders(recIds.length)})`)
        .all(...recIds) as unknown as RecurrenceRow[]) {
        recs.set(r.id, toRecurrence(r));
      }
    }

    return rows.map((r) => {
      const dependsOn = deps.get(r.id) ?? [];
      const via = waitVia.get(r.id);
      return {
        id: r.id,
        code: formatTaskCode(r.id),
        parentId: r.parent_id,
        parentTitle: r.parent_id !== null ? (parentTitles.get(r.parent_id) ?? null) : null,
        position: r.position,
        title: r.title,
        status: r.status,
        categoryId: r.category_id,
        priority: r.priority,
        dueDate: r.due_date,
        dueTime: r.due_time,
        estimateMin: r.estimate_min,
        actualMin: r.actual_min,
        notes: r.notes,
        recurrence: r.recurrence_id !== null ? (recs.get(r.recurrence_id) ?? null) : null,
        legacyId: r.legacy_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        completedAt: r.completed_at,
        doDates: dates.get(r.id) ?? [],
        dependsOn,
        blocked: dependsOn.some((d) => isOpen(d.status)) || via !== undefined,
        ...(via ? { waitVia: via } : {}),
        children: kids.get(r.id) ?? { total: 0, done: 0 },
      };
    });
  }
}

const startOn = (t: Task, date: string) => t.doDates.find((d) => d.date === date)?.start ?? '';

function toRef(r: { id: number; title: string; status: Status }): TaskRef {
  return { id: r.id, code: formatTaskCode(r.id), title: r.title, status: r.status };
}
