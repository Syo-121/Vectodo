import { CategoryService } from '../src/server/categories.ts';
import { openDb } from '../src/server/db.ts';
import { MemoService } from '../src/server/memos.ts';
import { NoteService } from '../src/server/notes.ts';
import { SettingsService } from '../src/server/settings.ts';
import { TaskService } from '../src/server/tasks.ts';
import { TemplateService } from '../src/server/templates.ts';

/** 日付を動かせる時計つきの、メモリ上の DB */
export function setup(today = '2026-10-13') {
  const clock = {
    current: today,
    today() {
      return this.current;
    },
    now() {
      return `${this.current}T12:00:00+09:00`;
    },
  };
  const db = openDb(':memory:');
  const tasks = new TaskService(db, clock);
  return {
    db,
    clock,
    tasks,
    categories: new CategoryService(db),
    settings: new SettingsService(db),
    memos: new MemoService(db, clock, tasks),
    notes: new NoteService(db, clock),
    templates: new TemplateService(db, clock, tasks),
  };
}
