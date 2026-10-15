// ノート（設計の正= docs/design.md 3-6e）。Google Keep のような自由なメモ。受信箱のクイックメモ（memos.ts）とは別。

import type { Clock } from '../shared/dates.ts';
import { formatNoteCode } from '../shared/ids.ts';
import type { NoteAppendInput, NoteCreateInput, NotePatchInput } from '../shared/schemas.ts';
import type { Note, NoteItem, NoteLabel } from '../shared/types.ts';
import type { DB, Param } from './db.ts';
import { badRequest, notFound } from './errors.ts';

interface NoteRow {
  id: number;
  title: string;
  body: string;
  kind: 'text' | 'list';
  items: string;
  color: Note['color'];
  labels: string;
  pinned: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

function toNote(r: NoteRow): Note {
  return {
    id: r.id,
    code: formatNoteCode(r.id),
    title: r.title,
    body: r.body,
    kind: r.kind,
    items: JSON.parse(r.items) as NoteItem[],
    color: r.color,
    labels: JSON.parse(r.labels) as string[],
    pinned: r.pinned === 1,
    archived: r.archived === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** ラベルは前後の空白を落とし、同じものは1つに */
const cleanLabels = (labels: string[]) => [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
const isEmpty = (n: Pick<Note, 'title' | 'body' | 'items'>) =>
  !n.title.trim() && !n.body.trim() && !n.items.some((i) => i.text.trim());

export class NoteService {
  constructor(
    private readonly db: DB,
    private readonly clock: Clock,
  ) {}

  /** 固定したものが先、あとは新しい順。q はタイトル・本文・チェックリスト・ラベルから探す */
  list(opts: { archived?: boolean; q?: string; label?: string } = {}): Note[] {
    const where = ['archived = ?'];
    const params: Param[] = [opts.archived ? 1 : 0];
    const q = opts.q?.trim();
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push(`(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' OR items LIKE ? ESCAPE '\\' OR labels LIKE ? ESCAPE '\\')`);
      params.push(like, like, like, like);
    }
    if (opts.label) {
      where.push('EXISTS (SELECT 1 FROM json_each(notes.labels) WHERE value = ?)');
      params.push(opts.label);
    }
    const rows = this.db
      .prepare(`SELECT * FROM notes WHERE ${where.join(' AND ')} ORDER BY pinned DESC, id DESC`)
      .all(...params) as unknown as NoteRow[];
    return rows.map(toNote);
  }

  get(id: number): Note {
    const r = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined;
    if (!r) throw notFound(`ノート ${formatNoteCode(id)}`);
    return toNote(r);
  }

  /** 使っているラベルと件数（アーカイブしたノートは数えない） */
  labels(): NoteLabel[] {
    return this.db
      .prepare(
        `SELECT j.value AS label, COUNT(*) AS count FROM notes, json_each(notes.labels) j
         WHERE notes.archived = 0 GROUP BY j.value ORDER BY j.value`,
      )
      .all() as unknown as NoteLabel[];
  }

  create(input: NoteCreateInput): Note {
    const note = {
      title: input.title ?? '',
      body: input.body ?? '',
      kind: input.kind ?? (input.items?.length ? 'list' : 'text'),
      items: input.items ?? [],
    };
    if (isEmpty(note)) throw badRequest('空のノートは作らない');
    const now = this.clock.now();
    const res = this.db
      .prepare(
        `INSERT INTO notes (title, body, kind, items, color, labels, pinned, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        note.title,
        note.body,
        note.kind,
        JSON.stringify(note.items),
        input.color ?? null,
        JSON.stringify(cleanLabels(input.labels ?? [])),
        input.pinned ? 1 : 0,
        input.archived ? 1 : 0,
        now,
        now,
      );
    return this.get(Number(res.lastInsertRowid));
  }

  update(id: number, patch: NotePatchInput): Note {
    this.get(id);
    const sets: string[] = [];
    const vals: Param[] = [];
    const set = (col: string, v: Param) => (sets.push(`${col} = ?`), vals.push(v));
    if (patch.title !== undefined) set('title', patch.title);
    if (patch.body !== undefined) set('body', patch.body);
    if (patch.kind !== undefined) set('kind', patch.kind);
    if (patch.items !== undefined) set('items', JSON.stringify(patch.items));
    if (patch.color !== undefined) set('color', patch.color);
    if (patch.labels !== undefined) set('labels', JSON.stringify(cleanLabels(patch.labels)));
    if (patch.pinned !== undefined) set('pinned', patch.pinned ? 1 : 0);
    if (patch.archived !== undefined) set('archived', patch.archived ? 1 : 0);
    if (sets.length) {
      set('updated_at', this.clock.now());
      this.db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
    }
    return this.get(id);
  }

  /**
   * 書き足す（Claude 用・消したり書き換えたりはしない）。
   * チェックリストには、行ごとに未チェックの項目として足す。文章のノートには、本文の末尾に行として足す
   */
  append(id: number, input: NoteAppendInput): Note {
    const note = this.get(id);
    const lines = [...(input.text?.split(/\r?\n/) ?? []), ...(input.items ?? [])].map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) throw badRequest('足すものが無い');
    if (note.kind === 'list') {
      return this.update(id, { items: [...note.items, ...lines.map((text) => ({ text, done: false }))] });
    }
    const body = note.body.trimEnd();
    return this.update(id, { body: [body, ...lines].filter(Boolean).join('\n') });
  }

  delete(id: number): void {
    this.get(id);
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  }
}
