// Google の認可（OAuth・デスクトップアプリ型＋ループバック）とカレンダー API の呼び出し（design 4-7）。
// 外部ライブラリは使わず fetch だけで書く。⛔ 資格情報とトークンはリポジトリの外（~/.config/task-app/・0600）。

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** 予定の読み書き（calendar.events）と、カレンダー一覧の読み取りだけ */
export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';

export interface GoogleFiles {
  /** Google Cloud でダウンロードしたクライアントの JSON（{"installed": {client_id, client_secret, …}}） */
  clientFile: string;
  /** 認可で得たリフレッシュトークンを置く場所 */
  tokenFile: string;
}

export class GoogleError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** 同期が使うカレンダー操作（テストでは偽物に差し替える） */
export interface CalendarApi {
  insert(calendarId: string, body: EventBody): Promise<{ id: string }>;
  update(calendarId: string, eventId: string, body: EventBody): Promise<{ id: string }>;
  move(calendarId: string, eventId: string, destination: string): Promise<void>;
  remove(calendarId: string, eventId: string): Promise<void>;
  get(calendarId: string, eventId: string): Promise<RawEvent | null>;
}

export interface EventBody {
  summary: string;
  description: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  colorId: string;
  reminders: { useDefault: false; overrides: { method: 'popup'; minutes: number }[] };
  extendedProperties: { private: Record<string, string> };
}

export interface RawEvent {
  id: string;
  status?: string;
  summary?: string;
  recurrence?: string[];
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export interface CalendarInfo {
  id: string;
  summary: string;
  primary: boolean;
  /** カレンダーの色（Google の表示色） */
  color?: string | null;
  /** Google の画面で表示にしているか（false＝チェックを外している） */
  selected?: boolean;
  hidden?: boolean;
}

interface Client {
  clientId: string;
  clientSecret: string;
}

export class GoogleClient implements CalendarApi {
  private access: { token: string; expires: number } | null = null;
  private states = new Map<string, number>();

  constructor(
    private readonly files: GoogleFiles,
    private readonly redirectUri: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  // ───────────── 認可

  /** クライアントの JSON が置いてあるか */
  configured(): boolean {
    return this.client() !== null;
  }

  /** 認可済み（リフレッシュトークンがある）か */
  connected(): boolean {
    return this.refreshToken() !== null;
  }

  /** 同意画面の URL。state は10分だけ有効 */
  authUrl(): string {
    const c = this.mustClient();
    const state = crypto.randomBytes(16).toString('hex');
    this.states.set(state, Date.now() + 10 * 60 * 1000);
    const q = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `${AUTH_URL}?${q}`;
  }

  /** 同意画面から戻ってきたコードをトークンに換えて保存する */
  async exchange(code: string, state: string): Promise<void> {
    const exp = this.states.get(state);
    this.states.delete(state);
    if (!exp || exp < Date.now()) throw new GoogleError(400, '認可の手続きが古いか、こちらで始めたものではない。もう一度「つなぐ」から');
    const c = this.mustClient();
    const json = await this.tokenRequest({
      code,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    });
    if (typeof json.refresh_token !== 'string') throw new GoogleError(500, 'リフレッシュトークンが返ってこなかった');
    writePrivate(this.files.tokenFile, {
      refresh_token: json.refresh_token,
      scope: json.scope,
      obtained_at: new Date().toISOString(),
    });
    this.access = { token: String(json.access_token), expires: Date.now() + (Number(json.expires_in) - 60) * 1000 };
  }

  disconnect(): void {
    fs.rmSync(this.files.tokenFile, { force: true });
    this.access = null;
  }

  // ───────────── カレンダー API

  /** カレンダー一覧。書き込み先を選ぶときは writer、予定を重ねて見るときは reader（購読しているものも入る） */
  async listCalendars(minAccessRole: 'writer' | 'reader' = 'writer'): Promise<CalendarInfo[]> {
    const json = (await this.call('GET', `/users/me/calendarList?minAccessRole=${minAccessRole}`)) as {
      items?: {
        id: string;
        summary?: string;
        summaryOverride?: string;
        primary?: boolean;
        backgroundColor?: string;
        selected?: boolean;
        hidden?: boolean;
      }[];
    };
    return (json.items ?? []).map((c) => ({
      id: c.id,
      summary: c.summaryOverride ?? c.summary ?? c.id,
      primary: Boolean(c.primary),
      color: c.backgroundColor ?? null,
      selected: c.selected ?? false,
      hidden: c.hidden ?? false,
    }));
  }

  /** 期間内の予定（繰り返しは1回ずつに展開）。説明欄は取らない（重ねて見るのに要らない） */
  async listEvents(calendarId: string, timeMin: string, timeMax: string): Promise<RawEvent[]> {
    const q = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      fields: 'items(id,status,summary,start,end,extendedProperties)',
    });
    const json = (await this.call('GET', `/calendars/${enc(calendarId)}/events?${q}`)) as { items?: RawEvent[] };
    return json.items ?? [];
  }

  async insert(calendarId: string, body: EventBody) {
    return (await this.call('POST', `/calendars/${enc(calendarId)}/events`, body)) as { id: string };
  }

  /** 丸ごと置き換える（終日⇔時刻ありの切り替えも確実に効く） */
  async update(calendarId: string, eventId: string, body: EventBody) {
    return (await this.call('PUT', `/calendars/${enc(calendarId)}/events/${enc(eventId)}`, body)) as { id: string };
  }

  async move(calendarId: string, eventId: string, destination: string) {
    await this.call('POST', `/calendars/${enc(calendarId)}/events/${enc(eventId)}/move?destination=${enc(destination)}`);
  }

  async remove(calendarId: string, eventId: string) {
    try {
      await this.call('DELETE', `/calendars/${enc(calendarId)}/events/${enc(eventId)}`);
    } catch (e) {
      // 既に無い予定は消せたことにする
      if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) return;
      throw e;
    }
  }

  async get(calendarId: string, eventId: string): Promise<RawEvent | null> {
    try {
      return (await this.call('GET', `/calendars/${enc(calendarId)}/events/${enc(eventId)}`)) as RawEvent;
    } catch (e) {
      if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) return null;
      throw e;
    }
  }

  // ───────────── 内部

  private async call(method: string, pathAndQuery: string, body?: unknown, retried = false): Promise<unknown> {
    const token = await this.accessToken();
    const res = await this.fetchImpl(`${API}${pathAndQuery}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && !retried) {
      this.access = null;
      return this.call(method, pathAndQuery, body, true);
    }
    if (res.status === 204) return {};
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) throw new GoogleError(res.status, `Google ${res.status}: ${json.error?.message ?? res.statusText}`);
    return json;
  }

  private async accessToken(): Promise<string> {
    if (this.access && this.access.expires > Date.now()) return this.access.token;
    const refresh = this.refreshToken();
    if (!refresh) throw new GoogleError(401, 'Google につながっていない（設定の「Google カレンダー」からつなぐ）');
    const c = this.mustClient();
    const json = await this.tokenRequest({
      refresh_token: refresh,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: 'refresh_token',
    });
    this.access = { token: String(json.access_token), expires: Date.now() + (Number(json.expires_in) - 60) * 1000 };
    return this.access.token;
  }

  private async tokenRequest(params: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      // invalid_grant＝トークンが取り消された・期限切れ（同意画面が「テスト」のままだと7日で切れる）。
      // 使えないトークンは捨てて「つながっていない」にする（画面の「今日」に、つなぎ直しを促す表示が出る）
      const why = String(json.error ?? res.status);
      if (why === 'invalid_grant' && params.grant_type === 'refresh_token') this.disconnect();
      throw new GoogleError(res.status === 400 ? 401 : res.status, `Google の認可が通らない（${why}）。設定からつなぎ直す`);
    }
    return json;
  }

  private client(): Client | null {
    try {
      const raw = JSON.parse(fs.readFileSync(this.files.clientFile, 'utf8')) as Record<string, unknown>;
      const c = (raw.installed ?? raw.web ?? raw) as { client_id?: string; client_secret?: string };
      return c.client_id && c.client_secret ? { clientId: c.client_id, clientSecret: c.client_secret } : null;
    } catch {
      return null;
    }
  }

  private mustClient(): Client {
    const c = this.client();
    if (!c) throw new GoogleError(500, `Google のクライアント情報が無い（${this.files.clientFile}）`);
    return c;
  }

  private refreshToken(): string | null {
    try {
      const t = JSON.parse(fs.readFileSync(this.files.tokenFile, 'utf8')) as { refresh_token?: string };
      return t.refresh_token ?? null;
    } catch {
      return null;
    }
  }
}

const enc = encodeURIComponent;

/** 本人だけが読める形で書く（ディレクトリ 0700・ファイル 0600） */
function writePrivate(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}
