// テンプレート（設計の正= docs/design.md 3-6d・4-8）。今あるタスク（親・子・孫・依存）の形を覚えて、まとめて作り直す。
// 日付は親の日付（締切、無ければやる日の最後の日）を基準日にした「◯日前・後」で覚え、適用するときの基準日から逆算する。

import { addDays, diffDays, maxDate, type Clock } from '../shared/dates.ts';
import type { TemplateApplyInput } from '../shared/schemas.ts';
import { defaultTitle, stripDatePrefix } from '../shared/templates.ts';
import type { Task, TaskDetail, Template, TemplateBody, TemplateNode } from '../shared/types.ts';
import { transaction, type DB } from './db.ts';
import { conflict, notFound } from './errors.ts';
import type { TaskService } from './tasks.ts';

interface TemplateRow {
  id: number;
  name: string;
  body: string;
  source_task_id: number | null;
  created_at: string;
  updated_at: string;
}

function toTemplate(r: TemplateRow): Template {
  return {
    id: r.id,
    name: r.name,
    body: JSON.parse(r.body) as TemplateBody,
    sourceTaskId: r.source_task_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class TemplateService {
  constructor(
    private readonly db: DB,
    private readonly clock: Clock,
    private readonly tasks: TaskService,
  ) {}

  list(): Template[] {
    return (this.db.prepare('SELECT * FROM templates ORDER BY name').all() as unknown as TemplateRow[]).map(toTemplate);
  }

  /** 番号か名前で引く */
  get(ref: number | string): Template {
    const r = (
      typeof ref === 'number'
        ? this.db.prepare('SELECT * FROM templates WHERE id = ?').get(ref)
        : (this.db.prepare('SELECT * FROM templates WHERE name = ?').get(ref.trim()) ??
          (/^\d+$/.test(ref.trim()) ? this.db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(ref)) : undefined))
    ) as TemplateRow | undefined;
    if (!r) {
      const names = this.list().map((t) => t.name);
      throw notFound(`テンプレート「${ref}」${names.length ? `（あるのは: ${names.join('・')}）` : ''}`);
    }
    return toTemplate(r);
  }

  /**
   * 今あるタスクの形を覚える。子・孫・依存（中の2つをつなぐものだけ）・カテゴリ・優先度・見積・メモを写す。
   * 中止した子（とその下）は入れない。状態・繰り返しは写さない。同じ名前があると、overwrite でなければ断る
   */
  saveFromTask(taskId: number, name: string, overwrite = false): Template {
    const root = this.tasks.get(taskId);
    const base = root.dueDate ?? maxDate(root.doDates.map((d) => d.date));
    const anchor: TemplateBody['anchor'] = root.dueDate ? 'due' : base ? 'do' : null;
    let next = 0;
    const keyOf = new Map<number, number>();
    const links: [number, number][] = [];
    const node = (t: Task, children: Task[]): TemplateNode => {
      const key = next++;
      keyOf.set(t.id, key);
      for (const d of t.dependsOn) links.push([t.id, d.id]);
      return {
        key,
        title: t.title,
        categoryId: t.categoryId,
        priority: t.priority,
        estimateMin: t.estimateMin,
        notes: t.notes,
        dueOffset: base && t.dueDate ? diffDays(t.dueDate, base) : null,
        dueTime: base && t.dueDate ? t.dueTime : null,
        doOffsets: base ? t.doDates.map((d) => ({ offset: diffDays(d.date, base), minutes: d.minutes })) : [],
        children: children
          .filter((c) => c.status !== 'canceled')
          .map((c) => node(c, this.tasks.get(c.id).childTasks)),
      };
    };
    const top = node(root, root.childTasks);
    const { title, datePrefix } = stripDatePrefix(top.title);
    top.title = title;
    const body: TemplateBody = {
      root: top,
      deps: links.filter(([a, b]) => keyOf.has(a) && keyOf.has(b)).map(([a, b]) => [keyOf.get(a)!, keyOf.get(b)!]),
      anchor,
      datePrefix,
    };

    const label = name.trim();
    return transaction(this.db, () => {
      const now = this.clock.now();
      const json = JSON.stringify(body);
      const same = this.db.prepare('SELECT id FROM templates WHERE name = ?').get(label) as { id: number } | undefined;
      if (same) {
        if (!overwrite) throw conflict(`テンプレート「${label}」は既にある（置き換えるなら上書きで）`);
        this.db
          .prepare('UPDATE templates SET body = ?, source_task_id = ?, updated_at = ? WHERE id = ?')
          .run(json, taskId, now, same.id);
        return this.get(same.id);
      }
      const res = this.db
        .prepare('INSERT INTO templates (name, body, source_task_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(label, json, taskId, now, now);
      return this.get(Number(res.lastInsertRowid));
    });
  }

  rename(id: number, name: string): Template {
    const cur = this.get(id);
    const label = name.trim();
    const same = this.db.prepare('SELECT id FROM templates WHERE name = ? AND id <> ?').get(label, cur.id);
    if (same !== undefined) throw conflict(`テンプレート「${label}」は既にある`);
    this.db.prepare('UPDATE templates SET name = ?, updated_at = ? WHERE id = ?').run(label, this.clock.now(), cur.id);
    return this.get(cur.id);
  }

  delete(id: number): void {
    this.get(id);
    this.db.prepare('DELETE FROM templates WHERE id = ?').run(id);
  }

  /**
   * テンプレートからまとめて作る（全部か、何も作らないか）。date を渡すと、覚えた「◯日前・後」から日付を入れる。
   * 消えた・アーカイブしたカテゴリは「なし」にする（作ったタスクが隠れないように）
   */
  apply(ref: number | string, input: TemplateApplyInput = {}): TaskDetail {
    const tpl = this.get(ref);
    const { root, deps } = tpl.body;
    const date = input.date ?? null;
    const usable = new Set(
      (this.db.prepare('SELECT id FROM categories WHERE archived = 0').all() as { id: number }[]).map((c) => c.id),
    );
    return transaction(this.db, () => {
      const idOf = new Map<number, number>();
      const make = (n: TemplateNode, parentId: number | null) => {
        const due = date && n.dueOffset !== null ? addDays(date, n.dueOffset) : null;
        const created = this.tasks.create({
          title: parentId === null ? (input.title ?? defaultTitle(tpl.body, date)) : n.title,
          parentId,
          categoryId: n.categoryId !== null && usable.has(n.categoryId) ? n.categoryId : null,
          priority: n.priority,
          estimateMin: n.estimateMin,
          notes: n.notes,
          dueDate: due,
          dueTime: due ? n.dueTime : null,
          doDates: date ? n.doOffsets.map((o) => ({ date: addDays(date, o.offset), minutes: o.minutes })) : [],
        });
        idOf.set(n.key, created.id);
        for (const c of n.children) make(c, created.id);
      };
      make(root, null);
      for (const [after, before] of deps) this.tasks.addDependency(idOf.get(after)!, idOf.get(before)!);
      return this.tasks.get(idOf.get(root.key)!);
    });
  }
}
