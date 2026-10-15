// Google カレンダーへの一方向同期の実行役（設計の正= docs/design.md 4-7）。
// 書き込みのたびに少し待ってから走り、10分ごとにも全体を見直す（通信に失敗しても次で追いつく）。

import { addDays, type Clock } from '../../shared/dates.ts';
import type { OverlayEvent } from '../../shared/types.ts';
import type { CategoryService } from '../categories.ts';
import type { DB } from '../db.ts';
import type { SettingsService } from '../settings.ts';
import type { TaskService } from '../tasks.ts';
import { GoogleError, type CalendarApi, type CalendarInfo, type EventBody, type RawEvent } from './google.ts';
import { desiredFor, diff, keyOf, sentOf, type Action, type Desired, type SyncedRow } from './plan.ts';

/** 同期が使う Google 側の操作（本物は GoogleClient・テストは偽物） */
export interface GcalApi extends CalendarApi {
  configured(): boolean;
  connected(): boolean;
  authUrl(): string;
  exchange(code: string, state: string): Promise<void>;
  disconnect(): void;
  listCalendars(minAccessRole?: 'writer' | 'reader'): Promise<CalendarInfo[]>;
  listEvents(calendarId: string, timeMin: string, timeMax: string): Promise<RawEvent[]>;
}

export type { OverlayEvent };

export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

export interface GcalStatus {
  configured: boolean;
  connected: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastResult: SyncResult | null;
  lastError: string | null;
  /** アプリが覚えている予定の数 */
  events: number;
}

interface Options {
  /** 予定の説明欄に載せる、タスクを開くリンクの頭（例 https://…:5180） */
  appUrl: string | null;
  timezone: string;
  /** 書き込みから同期までの待ち（まとめて送るため） */
  debounceMs?: number;
  /** 予定1件ごとの間隔（Google の流量制限よけ） */
  pauseMs?: number;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const gone = (e: unknown) => e instanceof GoogleError && (e.status === 404 || e.status === 410);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GcalSync {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<SyncResult | null> | null = null;
  private again = false;
  private lastRunAt: string | null = null;
  private lastResult: SyncResult | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly db: DB,
    private readonly tasks: TaskService,
    private readonly categories: CategoryService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
    private readonly api: GcalApi,
    private readonly opts: Options,
  ) {}

  status(): GcalStatus {
    const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM gcal_events').get() as { n: number };
    return {
      configured: this.api.configured(),
      connected: this.api.connected(),
      running: this.running !== null,
      lastRunAt: this.lastRunAt,
      lastResult: this.lastResult,
      lastError: this.lastError,
      events: n,
    };
  }

  /** 書き込みのあとに呼ぶ。少し待ってから同期する（続けて書いても1回にまとまる） */
  kick(): void {
    if (!this.api.connected()) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, this.opts.debounceMs ?? 2000);
    this.timer.unref?.();
  }

  /** 定期的な見直しを始める（日付が変わったぶん・失敗したぶんを拾う） */
  start(intervalMs = 10 * 60 * 1000): void {
    setInterval(() => this.kick(), intervalMs).unref();
    this.kick();
  }

  /** 1回同期する。走っている最中に呼ばれたら、終わったあとにもう1回走る */
  run(): Promise<SyncResult | null> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        if (!this.api.connected()) return null;
        do {
          this.again = false;
          await this.adoptLegacyOnce();
          this.lastResult = await this.syncOnce();
        } while (this.again);
        this.lastError = this.lastResult.errors[0] ?? null;
        return this.lastResult;
      } catch (e) {
        this.lastError = msg(e);
        console.error('gcal sync failed:', e);
        return null;
      } finally {
        this.lastRunAt = this.clock.now();
        this.running = null;
      }
    })();
    return this.running;
  }

  // ───────────── つなぐ・切る

  authUrl(): string {
    return this.api.authUrl();
  }

  /** 同意画面から戻ってきたとき。書き込み先のカレンダーを名前で決めてから、最初の同期を走らせる */
  async connect(code: string, state: string): Promise<void> {
    await this.api.exchange(code, state);
    await this.mapCalendars();
    void this.run();
  }

  disconnect(): void {
    this.api.disconnect();
  }

  calendars(): Promise<CalendarInfo[]> {
    return this.api.listCalendars();
  }

  /**
   * まだ決まっていない書き込み先を、カレンダーの名前で決める。
   * 既定は「その他」（無ければメイン）。カテゴリはカレンダー名が同じ（か、それで始まる）ものへ。
   */
  async mapCalendars(): Promise<void> {
    const cals = await this.api.listCalendars();
    if (!this.settings.get().gcalDefaultCalendarId) {
      const def = cals.find((c) => c.summary === 'その他') ?? cals.find((c) => c.primary);
      if (def) this.settings.update({ gcalDefaultCalendarId: def.id });
    }
    for (const cat of this.categories.list(true)) {
      if (cat.gcalCalendarId) continue;
      const hit = cals.find((c) => c.summary === cat.name) ?? cals.find((c) => c.summary.startsWith(cat.name));
      if (hit) this.categories.update(cat.id, { gcalCalendarId: hit.id });
    }
  }

  // ───────────── 予定を重ねて見る（v3・design 7-11）

  private overlayCache = new Map<string, { at: number; events: OverlayEvent[] }>();

  /**
   * 期間内の Google の予定（Google の画面で表示にしているカレンダーだけ）。
   * アプリが書き出したタスクの予定と、以前の管理方法（tasks.md）で入れたタスクの予定（【タスク】【締切…】）は除く（タスクは画面のデータで出す）。
   * 5分だけ覚えておく（画面を行き来するたびに Google を叩かない）。
   */
  async overlay(from: string, to: string, fresh = false): Promise<OverlayEvent[]> {
    if (!this.api.connected()) return [];
    const key = `${from}|${to}`;
    const hit = this.overlayCache.get(key);
    if (!fresh && hit && Date.now() - hit.at < 5 * 60_000) return hit.events;

    const cals = (await this.api.listCalendars('reader')).filter((c) => c.selected !== false && !c.hidden);
    const timeMin = `${from}T00:00:00+09:00`;
    const timeMax = `${addDays(to, 1)}T00:00:00+09:00`;
    const lists = await Promise.all(
      cals.map(async (c) => {
        try {
          return (await this.api.listEvents(c.id, timeMin, timeMax)).map((e) => ({ c, e }));
        } catch (e) {
          console.error(`overlay: ${c.summary}:`, msg(e));
          return [];
        }
      }),
    );
    const tz = this.opts.timezone;
    const events = lists
      .flat()
      .filter(({ e }) => e.status !== 'cancelled' && e.extendedProperties?.private?.vectodo !== '1')
      .filter(({ e }) => !/^(【(済|中止)】)?【(タスク|締切)/.test(e.summary ?? ''))
      .map(({ c, e }): OverlayEvent | null => {
        const base = { id: e.id, calendar: c.summary, color: c.color ?? null, title: e.summary ?? '（無題）' };
        if (e.start?.date) {
          return { ...base, date: e.start.date, endDate: e.end?.date ?? addDays(e.start.date, 1), start: null, end: null };
        }
        if (!e.start?.dateTime) return null;
        const s = jst(e.start.dateTime, tz);
        const en = e.end?.dateTime ? jst(e.end.dateTime, tz) : s;
        return { ...base, date: s.date, endDate: addDays(s.date, 1), start: s.time, end: en.time };
      })
      .filter((x): x is OverlayEvent => x !== null)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? ''));
    if (this.overlayCache.size > 30) this.overlayCache.clear();
    this.overlayCache.set(key, { at: Date.now(), events });
    return events;
  }

  // ───────────── 同期の本体

  private async syncOnce(): Promise<SyncResult> {
    const today = this.clock.today();
    const def = this.settings.get().gcalDefaultCalendarId;
    if (!def) throw new Error('書き込み先のカレンダー（既定）が決まっていない。設定で選ぶ');
    const ctx = {
      today,
      categories: new Map(this.categories.list(true).map((c) => [c.id, c])),
      defaultCalendarId: def,
      appUrl: this.opts.appUrl,
      timezone: this.opts.timezone,
    };
    const desired = this.tasks.all({ includeDone: true, includeArchived: true }).flatMap((t) => desiredFor(t, ctx));
    const actions = diff(desired, this.rows(), today);
    const result: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [] };
    for (const a of actions) {
      try {
        await this.apply(a);
        if (a.type === 'create') result.created++;
        if (a.type === 'update') result.updated++;
        if (a.type === 'delete') result.deleted++;
      } catch (e) {
        result.errors.push(`${label(a)}: ${msg(e)}`);
        // 認可が切れていたら残りも全部失敗するので止める
        if (e instanceof GoogleError && e.status === 401) break;
      }
      if (a.type !== 'forget' && this.opts.pauseMs) await sleep(this.opts.pauseMs);
    }
    return result;
  }

  private async apply(a: Action): Promise<void> {
    if (a.type === 'forget') return this.deleteRow(a.row);
    if (a.type === 'delete') {
      await this.api.remove(a.row.calendarId, a.row.eventId);
      return this.deleteRow(a.row);
    }
    const want = a.want;
    const body = toBody(want);
    if (a.type === 'create') {
      const ev = await this.api.insert(want.spec.calendarId, body);
      return this.saveRow(want, ev.id);
    }
    // update: カテゴリの書き込み先が変わっていたら、先に予定ごと移す
    let eventId = a.row.eventId;
    let cal = a.row.calendarId;
    try {
      if (cal !== want.spec.calendarId) {
        await this.api.move(cal, eventId, want.spec.calendarId);
        cal = want.spec.calendarId;
      }
      await this.api.update(cal, eventId, body);
    } catch (e) {
      if (!gone(e)) throw e;
      // Google 側で消されていた: 完了済みなら覚えるのをやめるだけ、未完了なら作り直す
      if (want.closed) return this.deleteRow(a.row);
      eventId = (await this.api.insert(want.spec.calendarId, body)).id;
    }
    this.saveRow(want, eventId);
  }

  /**
   * tasks.md の時代に作った予定を一度だけ引き取る（design 9-3）。
   * 移したタスクのメモ欄の「カレンダー: 「<カレンダー名>」`eventId`」を読み、今の締切・やる日と同じ日の予定なら
   * それをアプリの予定として覚える（作り直して二重にしない）。中身は次の同期で今の形に書き換わる。
   */
  private async adoptLegacyOnce(): Promise<void> {
    if (this.settings.get().gcalLegacyAdoptedAt) return;
    const cals = await this.api.listCalendars();
    const byName = (name: string) =>
      cals.find((c) => c.summary === name) ?? cals.find((c) => c.summary.startsWith(name) || name.startsWith(c.summary));
    const has = new Set(this.rows().map((r) => keyOf(r.taskId, r.slot)));
    for (const t of this.tasks.all()) {
      if (!t.notes.includes('tasks.md から移行')) continue;
      for (const m of t.notes.matchAll(/「([^」]+)」`([a-z0-9_]+)`/g)) {
        const cal = byName(m[1]!);
        if (!cal) continue;
        const ev = await this.api.get(cal.id, m[2]!);
        if (!ev || ev.status === 'cancelled' || ev.recurrence) continue;
        const date = ev.start?.date ?? ev.start?.dateTime?.slice(0, 10);
        const summary = ev.summary ?? '';
        if (!date || /^【(済|中止)】/.test(summary)) continue;
        let slot: string | null = null;
        if (summary.includes('【締切') && date === t.dueDate) slot = 'due';
        else if (summary.includes('【タスク】') && date !== t.dueDate && t.doDates.some((d) => d.date === date)) {
          slot = `do:${date}`;
        }
        if (!slot || has.has(keyOf(t.id, slot))) continue;
        has.add(keyOf(t.id, slot));
        this.db
          .prepare(
            `INSERT INTO gcal_events (task_id, slot, date, calendar_id, event_id, sent, synced_at)
             VALUES (?, ?, ?, ?, ?, '', ?)`,
          )
          .run(t.id, slot, date, cal.id, ev.id, this.clock.now());
      }
    }
    this.settings.update({ gcalLegacyAdoptedAt: this.clock.now() });
  }

  // ───────────── gcal_events

  private rows(): SyncedRow[] {
    return (
      this.db.prepare('SELECT * FROM gcal_events').all() as {
        task_id: number;
        slot: string;
        date: string;
        calendar_id: string;
        event_id: string;
        sent: string;
      }[]
    ).map((r) => ({
      taskId: r.task_id,
      slot: r.slot,
      date: r.date,
      calendarId: r.calendar_id,
      eventId: r.event_id,
      sent: r.sent,
    }));
  }

  private saveRow(want: Desired, eventId: string): void {
    this.db
      .prepare(
        `INSERT INTO gcal_events (task_id, slot, date, calendar_id, event_id, sent, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (task_id, slot) DO UPDATE SET date = excluded.date, calendar_id = excluded.calendar_id,
           event_id = excluded.event_id, sent = excluded.sent, synced_at = excluded.synced_at`,
      )
      .run(want.taskId, want.slot, want.date, want.spec.calendarId, eventId, sentOf(want.spec), this.clock.now());
  }

  private deleteRow(r: SyncedRow): void {
    this.db.prepare('DELETE FROM gcal_events WHERE task_id = ? AND slot = ?').run(r.taskId, r.slot);
  }
}

/** ISO の日時を、指定のタイムゾーンの日付と時刻に（2026-10-15T22:30:00Z → 2026-10-16 07:30） */
function jst(dateTime: string, tz: string): { date: string; time: string } {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(dateTime));
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}

function toBody(d: Desired): EventBody {
  const s = d.spec;
  return {
    summary: s.summary,
    description: s.description,
    start: s.start,
    end: s.end,
    colorId: s.colorId,
    reminders: { useDefault: false, overrides: s.reminders.map((minutes) => ({ method: 'popup', minutes })) },
    // アプリが作った予定の印（消してよいのはこの印のある予定だけ）
    extendedProperties: { private: { vectodo: '1', task: String(d.taskId), slot: d.slot } },
  };
}

function label(a: Action): string {
  const r = a.type === 'create' ? a.want : a.type === 'update' ? a.want : a.row;
  return `T-${String(r.taskId).padStart(3, '0')} ${r.slot}`;
}
