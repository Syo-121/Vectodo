// 設定の読み込み。⭐ 移設で書き換えるのは config.json だけ（docs/design.md 2章）。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface Config {
  port: number;
  dbPath: string;
  backupDir: string | null;
  backupKeepDays: number;
  timezone: string;
  /** Host ヘッダで受け付けるホスト名（localhost と tailnet の名前） */
  allowedHosts: string[];
  /** Google カレンダー同期（design 4-7）。⛔ 資格情報はリポジトリの外に置く */
  gcal: {
    /** Google Cloud でダウンロードした OAuth クライアント（デスクトップアプリ）の JSON */
    clientFile: string;
    /** 認可で得たトークン（アプリが書く・0600） */
    tokenFile: string;
    /** 予定の説明欄に載せる、タスクを開くリンクの頭（スマホから開ける URL） */
    appUrl: string | null;
  };
}

type RawConfig = Partial<Omit<Config, 'gcal'>> & { gcal?: Partial<Config['gcal']> };

export function loadConfig(file = process.env.TASK_APP_CONFIG ?? path.join(PROJECT_ROOT, 'config.json')): Config {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as RawConfig;
  const resolve = (p: string) => (path.isAbsolute(p) ? p : path.join(PROJECT_ROOT, p));
  const home = (p: string) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : resolve(p));
  return {
    port: raw.port ?? 5180,
    dbPath: resolve(raw.dbPath ?? 'data/tasks.db'),
    backupDir: raw.backupDir ? resolve(raw.backupDir) : null,
    backupKeepDays: raw.backupKeepDays ?? 14,
    timezone: raw.timezone ?? 'Asia/Tokyo',
    allowedHosts: raw.allowedHosts ?? ['localhost', '127.0.0.1'],
    gcal: {
      clientFile: home(raw.gcal?.clientFile ?? '~/.config/task-app/google-client.json'),
      tokenFile: home(raw.gcal?.tokenFile ?? '~/.config/task-app/google-token.json'),
      appUrl: raw.gcal?.appUrl ?? null,
    },
  };
}
