import type { z } from 'zod';
import type { zCategoryCreate, zCategoryPatch } from '../shared/schemas.ts';
import type { Category } from '../shared/types.ts';
import type { DB, Param } from './db.ts';
import { conflict, notFound } from './errors.ts';

interface CategoryRow {
  id: number;
  name: string;
  color: string;
  position: number;
  archived: number;
  gcal_calendar_id: string | null;
  hide_after_days: number | null;
  hide_from_plan: number;
}

function toCategory(r: CategoryRow): Category {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    position: r.position,
    archived: r.archived === 1,
    gcalCalendarId: r.gcal_calendar_id,
    hideAfterDays: r.hide_after_days,
    hideFromPlan: r.hide_from_plan === 1,
  };
}

export class CategoryService {
  constructor(private readonly db: DB) {}

  list(includeArchived = false): Category[] {
    const rows = this.db
      .prepare(`SELECT * FROM categories ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY position, id`)
      .all() as unknown as CategoryRow[];
    return rows.map(toCategory);
  }

  get(id: number): Category {
    const r = this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow | undefined;
    if (!r) throw notFound(`カテゴリ #${id}`);
    return toCategory(r);
  }

  create(input: z.infer<typeof zCategoryCreate>): Category {
    this.assertNameFree(input.name);
    const { p } = this.db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM categories').get() as {
      p: number;
    };
    const res = this.db
      .prepare('INSERT INTO categories (name, color, position) VALUES (?, ?, ?)')
      .run(input.name, input.color ?? '#8a8a8a', p);
    return this.get(Number(res.lastInsertRowid));
  }

  update(id: number, patch: z.infer<typeof zCategoryPatch>): Category {
    this.get(id);
    if (patch.name !== undefined) this.assertNameFree(patch.name, id);
    const sets: string[] = [];
    const vals: Param[] = [];
    if (patch.name !== undefined) (sets.push('name = ?'), vals.push(patch.name));
    if (patch.color !== undefined) (sets.push('color = ?'), vals.push(patch.color));
    if (patch.position !== undefined) (sets.push('position = ?'), vals.push(patch.position));
    if (patch.archived !== undefined) (sets.push('archived = ?'), vals.push(patch.archived ? 1 : 0));
    if (patch.gcalCalendarId !== undefined) (sets.push('gcal_calendar_id = ?'), vals.push(patch.gcalCalendarId));
    if (patch.hideAfterDays !== undefined) (sets.push('hide_after_days = ?'), vals.push(patch.hideAfterDays));
    if (patch.hideFromPlan !== undefined) (sets.push('hide_from_plan = ?'), vals.push(patch.hideFromPlan ? 1 : 0));
    if (sets.length) this.db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
    return this.get(id);
  }

  /** 消すとそのカテゴリのタスクは「カテゴリなし」になる */
  delete(id: number): void {
    this.get(id);
    this.db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  }

  private assertNameFree(name: string, exceptId?: number): void {
    const r = this.db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number } | undefined;
    if (r && r.id !== exceptId) throw conflict(`カテゴリ「${name}」は既にある`);
  }
}
