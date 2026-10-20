// 起動: npm start（常駐は systemd の task-app.service）

import path from 'node:path';
import { serve } from '@hono/node-server';
import { systemClock } from '../shared/dates.ts';
import type { Services } from './api.ts';
import { createApp } from './app.ts';
import { scheduleBackups } from './backup.ts';
import { CategoryService } from './categories.ts';
import { loadConfig, PROJECT_ROOT } from './config.ts';
import { openDb } from './db.ts';
import { GoogleClient } from './gcal/google.ts';
import { GcalSync } from './gcal/sync.ts';
import { GoalService } from './goals.ts';
import { MemoService } from './memos.ts';
import { NoteService } from './notes.ts';
import { SettingsService } from './settings.ts';
import { TaskService } from './tasks.ts';
import { TemplateService } from './templates.ts';

const config = loadConfig();
const clock = systemClock(config.timezone);
const db = openDb(config.dbPath);
const tasks = new TaskService(db, clock);
const categories = new CategoryService(db);
const settings = new SettingsService(db);

// Google カレンダー同期（design 4-7）。同意画面からは PC のブラウザで 127.0.0.1 に戻ってくる
const google = new GoogleClient(config.gcal, `http://127.0.0.1:${config.port}/oauth/callback`);
const gcal = new GcalSync(db, tasks, categories, settings, clock, google, {
  appUrl: config.gcal.appUrl,
  timezone: config.timezone,
  pauseMs: 150,
});

const services: Services = {
  db,
  tasks,
  categories,
  settings,
  memos: new MemoService(db, clock, tasks),
  notes: new NoteService(db, clock),
  templates: new TemplateService(db, clock, tasks),
  goals: new GoalService(db, clock),
  gcal,
};

if (config.backupDir) scheduleBackups(db, clock, config.backupDir, config.backupKeepDays);
gcal.start();

const app = createApp(services, {
  allowedHosts: config.allowedHosts,
  webRoot: path.join(PROJECT_ROOT, 'dist/web'),
});

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: config.port }, (info) => {
  console.log(`task-app: http://127.0.0.1:${info.port}  db=${config.dbPath}  gcal=${google.connected() ? 'on' : 'off'}`);
});

const shutdown = () => {
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
