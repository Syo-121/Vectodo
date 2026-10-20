// 目標と、その記録（設計の正= docs/design.md 3-6f・4-13）。進み具合は shared/goals.ts で毎回計算する。

import type { Clock } from '../shared/dates.ts';
import { defaultStart, goalProgress } from '../shared/goals.ts';
import { formatGoalCode, parseGoalRef } from '../shared/ids.ts';
import type { GoalCreateInput, GoalLogInput, GoalPatchInput } from '../shared/schemas.ts';
import type { Goal, GoalDetail, GoalLog } from '../shared/types.ts';
import { placeholders, type DB, type Param } from './db.ts';
import { badRequest, notFound } from './errors.ts';

interface GoalRow {
  id: number;
  title: string;
  kind: 'rate' | 'total';
  period: Goal['period'];
  target: number;
  unit: string;
  start_date: string;
  end_date: string | null;
  notes: string;
  position: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

interface LogRow {
  id: number;
  goal_id: number;
  date: string;
  amount: number;
  note: string;
  created_at: string;
}

const toLog = (r: LogRow): GoalLog => ({
  id: r.id,
  goalId: r.goal_id,
  date: r.date,
  amount: r.amount,
  note: r.note,
  createdAt: r.created_at,
});

/** 形の決まり: 期間ごと（rate）は期間が要る・期限まで（total）は期限が要る・終わる日は数え始める日より後 */
function check(g: Pick<Goal, 'kind' | 'period' | 'startDate' | 'endDate'>): void {
  if (g.kind === 'rate' && !g.period) throw badRequest('期間ごとの目標には期間（day・week・month）が要る');
  if (g.kind === 'total' && !g.endDate) throw badRequest('期限までの目標には期限が要る');
  if (g.endDate && g.endDate < g.startDate) throw badRequest('期限（終わる日）が数え始める日より前');
}

export class GoalService {
  constructor(
    private readonly db: DB,
    private readonly clock: Clock,
  ) {}

  private hydrate(rows: GoalRow[]): Goal[] {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const logs = this.db
      .prepare(
        `SELECT goal_id, date, SUM(amount) AS amount FROM goal_logs
         WHERE goal_id IN (${placeholders(ids.length)}) GROUP BY goal_id, date`,
      )
      .all(...ids) as { goal_id: number; date: string; amount: number }[];
    const today = this.clock.today();
    return rows.map((r) => {
      const rule = {
        kind: r.kind,
        period: r.kind === 'rate' ? r.period : null,
        target: r.target,
        unit: r.unit,
        startDate: r.start_date,
        endDate: r.end_date,
      };
      return {
        id: r.id,
        code: formatGoalCode(r.id),
        title: r.title,
        ...rule,
        notes: r.notes,
        position: r.position,
        archived: r.archived === 1,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        progress: goalProgress(
          rule,
          logs.filter((l) => l.goal_id === r.id),
          today,
        ),
      };
    });
  }

  /** 並び順（position）→ 作った順。アーカイブしたものは archived=true のときだけ */
  list(opts: { archived?: boolean } = {}): Goal[] {
    const rows = this.db
      .prepare('SELECT * FROM goals WHERE archived = ? ORDER BY position, id')
      .all(opts.archived ? 1 : 0) as unknown as GoalRow[];
    return this.hydrate(rows);
  }

  get(id: number): GoalDetail {
    const r = this.db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow | undefined;
    if (!r) throw notFound(`目標 ${formatGoalCode(id)}`);
    const logs = this.db
      .prepare('SELECT * FROM goal_logs WHERE goal_id = ? ORDER BY date DESC, id DESC')
      .all(id) as unknown as LogRow[];
    return { ...this.hydrate([r])[0]!, logs: logs.map(toLog) };
  }

  /** 番号（G-001・1）か名前で探す（MCP 用）。名前は完全に一致するもの、無ければ含むものが1つだけのとき */
  resolve(ref: string | number): number {
    const id = parseGoalRef(ref);
    if (id !== null) return this.get(id).id;
    const name = String(ref).trim();
    const all = [...this.list(), ...this.list({ archived: true })];
    const exact = all.filter((g) => g.title === name);
    const hits = exact.length ? exact : all.filter((g) => g.title.includes(name));
    if (hits.length === 1) return hits[0]!.id;
    const names = (hits.length ? hits : all).map((g) => `${g.code} ${g.title}`).join('・') || '（なし）';
    throw badRequest(`目標「${name}」が${hits.length ? '1つに決まらない' : '見つからない'}。いまあるのは: ${names}`);
  }

  create(input: GoalCreateInput): GoalDetail {
    const today = this.clock.today();
    const period = input.kind === 'rate' ? (input.period ?? null) : null;
    const g = {
      kind: input.kind,
      period,
      startDate: input.startDate ?? defaultStart(input.kind, period, today),
      endDate: input.endDate ?? null,
    };
    check(g);
    const now = this.clock.now();
    const pos = (this.db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM goals').get() as { p: number }).p;
    const res = this.db
      .prepare(
        `INSERT INTO goals (title, kind, period, target, unit, start_date, end_date, notes, position, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(input.title, g.kind, g.period, input.target, input.unit ?? '回', g.startDate, g.endDate, input.notes ?? '', pos, now, now);
    return this.get(Number(res.lastInsertRowid));
  }

  update(id: number, patch: GoalPatchInput): GoalDetail {
    const cur = this.get(id);
    const kind = patch.kind ?? cur.kind;
    const next = {
      kind,
      period: kind === 'rate' ? (patch.period !== undefined ? patch.period : cur.period) : null,
      startDate: patch.startDate ?? cur.startDate,
      endDate: patch.endDate !== undefined ? patch.endDate : cur.endDate,
    };
    check(next);
    const sets: string[] = [];
    const vals: Param[] = [];
    const set = (col: string, v: Param) => (sets.push(`${col} = ?`), vals.push(v));
    if (patch.title !== undefined) set('title', patch.title);
    if (patch.kind !== undefined || patch.period !== undefined) {
      set('kind', next.kind);
      set('period', next.period);
    }
    if (patch.target !== undefined) set('target', patch.target);
    if (patch.unit !== undefined) set('unit', patch.unit);
    if (patch.startDate !== undefined) set('start_date', patch.startDate);
    if (patch.endDate !== undefined) set('end_date', patch.endDate);
    if (patch.notes !== undefined) set('notes', patch.notes);
    if (patch.position !== undefined) set('position', patch.position);
    if (patch.archived !== undefined) set('archived', patch.archived ? 1 : 0);
    if (sets.length) {
      set('updated_at', this.clock.now());
      this.db.prepare(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
    }
    return this.get(id);
  }

  delete(id: number): void {
    this.get(id);
    this.db.prepare('DELETE FROM goals WHERE id = ?').run(id);
  }

  /**
   * 記録を足す（量の既定は 1・日付の既定は今日）。先の日付と、数え始める日より前は断る
   * （期間ごとの目標は、数え始める日を含む期間の頭からなら受け付ける＝週の途中から始めても今週の分を入れられる）
   */
  addLog(id: number, input: GoalLogInput): GoalDetail {
    const g = this.get(id);
    const today = this.clock.today();
    const date = input.date ?? today;
    if (date > today) throw badRequest('先の日付には記録できない');
    const from = g.kind === 'rate' && g.period ? defaultStart('rate', g.period, g.startDate) : g.startDate;
    if (date < from) throw badRequest(`数え始める日（${from}）より前には記録できない`);
    this.db
      .prepare('INSERT INTO goal_logs (goal_id, date, amount, note, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, date, input.amount ?? 1, input.note ?? '', this.clock.now());
    return this.get(id);
  }

  /** 記録を消す（画面だけ・MCP には持たせない） */
  deleteLog(logId: number): GoalDetail {
    const r = this.db.prepare('SELECT goal_id FROM goal_logs WHERE id = ?').get(logId) as { goal_id: number } | undefined;
    if (!r) throw notFound(`記録 #${logId}`);
    this.db.prepare('DELETE FROM goal_logs WHERE id = ?').run(logId);
    return this.get(r.goal_id);
  }
}
