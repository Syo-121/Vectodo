// DB の日次バックアップ（設計の正= docs/design.md 8章）。
// backupDir に tasks-YYYY-MM-DD.db を1日1つ書き出し、新しい順に keepDays 個だけ残す。

import fs from 'node:fs';
import path from 'node:path';
import type { Clock } from '../shared/dates.ts';
import type { DB } from './db.ts';

export function backupIfNeeded(db: DB, clock: Clock, dir: string, keepDays: number): string | null {
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `tasks-${clock.today()}.db`);
  let made: string | null = null;
  if (!fs.existsSync(target)) {
    const tmp = `${target}.tmp`;
    fs.rmSync(tmp, { force: true });
    db.prepare('VACUUM INTO ?').run(tmp);
    fs.renameSync(tmp, target);
    made = target;
  }
  const old = fs
    .readdirSync(dir)
    .filter((f) => /^tasks-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .reverse()
    .slice(keepDays);
  for (const f of old) fs.rmSync(path.join(dir, f));
  return made;
}

export function scheduleBackups(db: DB, clock: Clock, dir: string, keepDays: number): void {
  const run = () => {
    try {
      const made = backupIfNeeded(db, clock, dir, keepDays);
      if (made) console.log(`backup: ${made}`);
    } catch (e) {
      console.error('backup failed:', e);
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000).unref();
}
