// SQLite（node:sqlite）の接続とマイグレーション。

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { PROJECT_ROOT } from './config.ts';

export type DB = DatabaseSync;
export type Param = SQLInputValue;

const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'migrations');

export function openDb(dbPath: string): DB {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

/** migrations/NNN_*.sql を番号順に、未適用のものだけ適用する */
export function migrate(db: DB): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_version').all() as { version: number }[]).map((r) => r.version),
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const version = Number.parseInt(file, 10);
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    transaction(db, () => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
        version,
        new Date().toISOString(),
      );
    });
  }
}

const inTransaction = new WeakSet<DB>();

/** 入れ子で呼ばれたら外側のトランザクションに相乗りする */
export function transaction<T>(db: DB, fn: () => T): T {
  if (inTransaction.has(db)) return fn();
  db.exec('BEGIN');
  inTransaction.add(db);
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    inTransaction.delete(db);
  }
}

export function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ');
}
