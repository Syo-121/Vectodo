import { describe, expect, it } from 'vitest';
import { GoogleError, type CalendarInfo, type EventBody, type RawEvent } from '../src/server/gcal/google.ts';
import { desiredFor, diff, sentOf, type PlanContext, type SyncedRow } from '../src/server/gcal/plan.ts';
import { GcalSync, type GcalApi } from '../src/server/gcal/sync.ts';
import type { Category, Task } from '../src/shared/types.ts';
import { setup } from './helpers.ts';

const TODAY = '2026-10-13';

function ctx(p: Partial<PlanContext> = {}): PlanContext {
  return {
    today: TODAY,
    categories: new Map<number, Category>([
      [1, { id: 1, name: 'バイト', color: '#f59e0b', position: 1, archived: false, gcalCalendarId: 'cal-work', hideAfterDays: null, hideFromPlan: false }],
      [2, { id: 2, name: '生活', color: '#10b981', position: 2, archived: false, gcalCalendarId: null, hideAfterDays: null, hideFromPlan: false }],
    ]),
    defaultCalendarId: 'cal-other',
    appUrl: 'https://app.example:5180',
    timezone: 'Asia/Tokyo',
    ...p,
  };
}

function task(p: Partial<Task> = {}): Task {
  return {
    id: 130,
    code: 'T-130',
    parentId: null,
    parentTitle: null,
    position: 0,
    title: '予習: 教室A 6年26',
    status: 'todo',
    categoryId: 1,
    priority: 1,
    dueDate: null,
    dueTime: null,
    estimateMin: 60,
    notes: '',
    recurrence: null,
    legacyId: null,
    actualMin: null,
    createdAt: '',
    updatedAt: '',
    completedAt: null,
    doDates: [],
    dependsOn: [],
    blocked: false,
    children: { total: 0, done: 0 },
    ...p,
  };
}

describe('あるべき予定（design 4-7）', () => {
  it('時刻つきの締切: 1時間前〜締切・通知は前日20:00と締切の2時間前・カテゴリのカレンダーへ', () => {
    const [d] = desiredFor(task({ dueDate: '2026-10-15', dueTime: '15:05' }), ctx());
    expect(d!.slot).toBe('due');
    expect(d!.spec.calendarId).toBe('cal-work');
    expect(d!.spec.summary).toBe('【締切15:05】予習: 教室A 6年26');
    expect(d!.spec.start).toEqual({ dateTime: '2026-10-15T14:05:00+09:00', timeZone: 'Asia/Tokyo' });
    expect(d!.spec.end).toEqual({ dateTime: '2026-10-15T15:05:00+09:00', timeZone: 'Asia/Tokyo' });
    // 14:05 の前日20:00 = 18h05m 前、締切の2時間前 = 開始の1時間前
    expect(d!.spec.reminders).toEqual([1085, 60]);
    expect(d!.spec.description.split('\n')).toEqual([
      'タスクID: T-130（Vectodo で管理）',
      '優先度: 高・見積 1h',
      'カテゴリ: バイト',
      'https://app.example:5180/list?t=130',
    ]);
  });
  it('日付だけの締切は終日・やる日は終日【タスク】・締切と同じ日のやる日はまとめる', () => {
    const ds = desiredFor(
      task({
        categoryId: 2,
        dueDate: '2026-10-26',
        doDates: [
          { date: '2026-10-20', minutes: 120 },
          { date: '2026-10-26', minutes: null },
        ],
      }),
      ctx(),
    );
    expect(ds.map((d) => [d.slot, d.spec.summary, d.spec.calendarId])).toEqual([
      ['due', '【締切】予習: 教室A 6年26', 'cal-other'],
      ['do:2026-10-20', '【タスク】予習: 教室A 6年26', 'cal-other'],
    ]);
    expect(ds[0]!.spec.start).toEqual({ date: '2026-10-26' });
    expect(ds[0]!.spec.end).toEqual({ date: '2026-10-27' });
    expect(ds[0]!.spec.description).toContain('この日がやる日でもある');
    expect(ds[1]!.spec.reminders).toEqual([240]);
    expect(ds[1]!.spec.description).toContain('締切: 10/26(月)');
    expect(ds[1]!.spec.description).toContain('この日の配分: 2h');
  });

  it('時刻を決めたやる日は、その時刻から配分（無ければ見積）の長さ・通知は5分前。締切と同じ日でも別の予定', () => {
    const ds = desiredFor(
      task({
        dueDate: '2026-10-14',
        dueTime: '14:55',
        estimateMin: 60,
        doDates: [
          { date: '2026-10-14', minutes: null, start: '12:00' },
          { date: '2026-10-15', minutes: 90, start: '23:30' },
        ],
      }),
      ctx(),
    );
    const at = (s: string) => ({ dateTime: `${s}:00+09:00`, timeZone: 'Asia/Tokyo' });
    expect(ds.map((d) => [d.slot, d.spec.start, d.spec.end, d.spec.reminders])).toEqual([
      ['due', at('2026-10-14T13:55'), at('2026-10-14T14:55'), [13 * 60 + 55 + 240, 60]],
      ['do:2026-10-14', at('2026-10-14T12:00'), at('2026-10-14T13:00'), [5]],
      ['do:2026-10-15', at('2026-10-15T23:30'), at('2026-10-16T01:00'), [5]],
    ]);
    expect(ds[0]!.spec.description).not.toContain('この日がやる日でもある');
  });
  it('完了は【済】・中止は【中止】で、通知は無し', () => {
    const [done] = desiredFor(task({ status: 'done', dueDate: '2026-10-15' }), ctx());
    expect(done!.closed).toBe(true);
    expect(done!.spec.summary).toBe('【済】【締切】予習: 教室A 6年26');
    expect(done!.spec.reminders).toEqual([]);
    const [canceled] = desiredFor(task({ status: 'canceled', dueDate: '2026-10-15' }), ctx());
    expect(canceled!.spec.summary.startsWith('【中止】')).toBe(true);
  });
});

describe('突き合わせ', () => {
  const row = (p: Partial<SyncedRow>): SyncedRow => ({
    taskId: 130,
    slot: 'due',
    date: '2026-10-15',
    calendarId: 'cal-work',
    eventId: 'ev1',
    sent: '',
    ...p,
  });
  it('未来の分だけ作る・過去の分は作らない', () => {
    const ds = desiredFor(
      task({ dueDate: '2026-10-15', doDates: [{ date: '2026-10-10', minutes: null }] }),
      ctx(),
    );
    expect(diff(ds, [], TODAY).map((a) => [a.type, a.type === 'create' ? a.want.slot : ''])).toEqual([['create', 'due']]);
  });
  it('中身が同じなら何もしない・変わったら直す', () => {
    const [d] = desiredFor(task({ dueDate: '2026-10-15' }), ctx());
    expect(diff([d!], [row({ sent: sentOf(d!.spec) })], TODAY)).toEqual([]);
    expect(diff([d!], [row({ sent: 'old' })], TODAY).map((a) => a.type)).toEqual(['update']);
  });
  it('過去の予定はさわらない（直さない・消さない）', () => {
    const [d] = desiredFor(task({ dueDate: '2026-10-10' }), ctx());
    expect(diff([d!], [row({ date: '2026-10-10', sent: 'old' })], TODAY)).toEqual([]);
    expect(diff([], [row({ date: '2026-10-10' })], TODAY).map((a) => a.type)).toEqual(['forget']);
  });
  it('締切ややる日を消した・タスクを消したら、今日以降の予定は消す', () => {
    expect(diff([], [row({ date: '2026-10-15' })], TODAY).map((a) => a.type)).toEqual(['delete']);
  });
  it('完了したタスクの予定は新しく作らない（あるものは【済】に直す）', () => {
    const ds = desiredFor(task({ status: 'done', dueDate: '2026-10-15' }), ctx());
    expect(diff(ds, [], TODAY)).toEqual([]);
    expect(diff(ds, [row({ sent: 'old' })], TODAY).map((a) => a.type)).toEqual(['update']);
  });
});

describe('Google の認可（偽の fetch で）', () => {
  it('同意画面の URL → コードをトークンに換えて 0600 で保存 → 次からはリフレッシュトークンで API を呼ぶ', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { GoogleClient } = await import('../src/server/gcal/google.ts');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcal-'));
    const files = { clientFile: path.join(dir, 'client.json'), tokenFile: path.join(dir, 'conf/token.json') };
    fs.writeFileSync(files.clientFile, JSON.stringify({ installed: { client_id: 'cid', client_secret: 'secret' } }));
    const seen: { url: string; body: string; auth: string }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      seen.push({ url, body: String(init?.body ?? ''), auth: String((init?.headers as Record<string, string>)?.authorization ?? '') });
      if (url.includes('oauth2.googleapis.com/token')) {
        const refresh = String(init?.body).includes('grant_type=refresh_token');
        return Response.json({ access_token: refresh ? 'at2' : 'at1', expires_in: 3600, ...(refresh ? {} : { refresh_token: 'rt' }) });
      }
      return Response.json({ id: 'ev1' });
    }) as typeof fetch;

    const g = new GoogleClient(files, 'http://127.0.0.1:5180/oauth/callback', fakeFetch);
    expect([g.configured(), g.connected()]).toEqual([true, false]);
    const url = new URL(g.authUrl());
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5180/oauth/callback');
    expect(url.searchParams.get('scope')).toContain('calendar.events');
    await expect(g.exchange('code', 'wrong-state')).rejects.toThrow(/もう一度/);
    await g.exchange('code', url.searchParams.get('state')!);
    expect(g.connected()).toBe(true);
    expect(fs.statSync(files.tokenFile).mode & 0o777).toBe(0o600);

    const g2 = new GoogleClient(files, 'http://127.0.0.1:5180/oauth/callback', fakeFetch);
    await g2.insert('cal-other', {} as EventBody);
    expect(seen.at(-2)!.body).toContain('refresh_token=rt');
    expect(seen.at(-1)!.auth).toBe('Bearer at2');
    fs.rmSync(dir, { recursive: true });
  });
});

/** 本物の Google の代わり（予定をメモリに持つ） */
class FakeGoogle implements GcalApi {
  events = new Map<string, { calendarId: string; body: EventBody | null; raw?: RawEvent }>();
  calls: string[] = [];
  private seq = 0;
  configured = () => true;
  connected = () => true;
  authUrl = () => 'https://accounts.example/auth';
  exchange = async () => {};
  disconnect = () => {};
  listCalendars = async (): Promise<CalendarInfo[]> => [
    { id: 'cal-main', summary: 'me', primary: true, selected: true, color: '#111111' },
    { id: 'cal-other', summary: 'その他', primary: false, selected: true, color: '#222222' },
    { id: 'cal-work', summary: 'バイト', primary: false, selected: true, color: '#333333' },
    { id: 'cal-memo', summary: 'データ置き場', primary: false, selected: false },
  ];
  /** 重ねて見る予定（カレンダーごと） */
  listed: Record<string, RawEvent[]> = {};
  async listEvents(calendarId: string) {
    return this.listed[calendarId] ?? [];
  }
  async insert(calendarId: string, body: EventBody) {
    const id = `ev${++this.seq}`;
    this.events.set(id, { calendarId, body });
    this.calls.push(`insert ${calendarId} ${body.summary}`);
    return { id };
  }
  async update(calendarId: string, eventId: string, body: EventBody) {
    const ev = this.events.get(eventId);
    if (!ev || ev.calendarId !== calendarId) throw new GoogleError(404, 'not found');
    ev.body = body;
    this.calls.push(`update ${calendarId} ${body.summary}`);
    return { id: eventId };
  }
  async move(calendarId: string, eventId: string, destination: string) {
    this.events.get(eventId)!.calendarId = destination;
    this.calls.push(`move ${calendarId}→${destination}`);
  }
  async remove(calendarId: string, eventId: string) {
    this.events.delete(eventId);
    this.calls.push(`remove ${calendarId} ${eventId}`);
  }
  async get(calendarId: string, eventId: string) {
    const ev = this.events.get(eventId);
    return ev && ev.calendarId === calendarId ? (ev.raw ?? null) : null;
  }
}

function syncSetup() {
  const s = setup(TODAY);
  const google = new FakeGoogle();
  const gcal = new GcalSync(s.db, s.tasks, s.categories, s.settings, s.clock, google, {
    appUrl: null,
    timezone: 'Asia/Tokyo',
  });
  return { ...s, google, gcal };
}

describe('同期（偽の Google で）', () => {
  it('つないだら書き込み先を名前で決め、作る→完了で【済】→カテゴリ変更で移す→締切を消すと予定も消す', async () => {
    const { tasks, categories, settings, google, gcal } = syncSetup();
    const gno = categories.create({ name: 'バイト' });
    const life = categories.create({ name: '生活' });
    await gcal.mapCalendars();
    expect(settings.get().gcalDefaultCalendarId).toBe('cal-other');
    expect(categories.get(gno.id).gcalCalendarId).toBe('cal-work');
    expect(categories.get(life.id).gcalCalendarId).toBeNull();

    const t = tasks.create({ title: '予習', categoryId: gno.id, dueDate: '2026-10-15', dueTime: '15:05' });
    const r1 = await gcal.run();
    expect(r1).toMatchObject({ created: 1, errors: [] });
    expect(google.calls).toEqual(['insert cal-work 【締切15:05】予習']);
    const [id] = [...google.events.keys()];
    expect(google.events.get(id!)!.body!.extendedProperties.private).toMatchObject({ vectodo: '1', slot: 'due' });

    // 何も変わっていなければ送らない
    expect(await gcal.run()).toMatchObject({ created: 0, updated: 0, deleted: 0 });

    tasks.update(t.id, { status: 'done' });
    await gcal.run();
    expect(google.events.get(id!)!.body!.summary).toBe('【済】【締切15:05】予習');
    expect(google.events.get(id!)!.body!.reminders.overrides).toEqual([]);

    tasks.update(t.id, { status: 'todo', categoryId: life.id });
    await gcal.run();
    expect(google.calls.slice(-2)).toEqual(['move cal-work→cal-other', 'update cal-other 【締切15:05】予習']);

    tasks.update(t.id, { dueDate: null, dueTime: null });
    expect(await gcal.run()).toMatchObject({ deleted: 1 });
    expect(google.events.size).toBe(0);
    expect(gcal.status().events).toBe(0);
  });
  it('繰り返しは完了すると次の回の予定ができる', async () => {
    const { tasks, google, gcal, settings } = syncSetup();
    settings.update({ gcalDefaultCalendarId: 'cal-other' });
    const t = tasks.create({
      title: '燃えるゴミ',
      dueDate: '2026-10-16',
      dueTime: '08:30',
      recurrence: { kind: 'weekly', weekdays: [2, 5], anchor: 'due' },
    });
    await gcal.run();
    tasks.update(t.id, { status: 'done' });
    await gcal.run();
    const summaries = [...google.events.values()].map((e) => `${e.body!.summary} ${JSON.stringify(e.body!.start)}`);
    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toContain('【済】【締切08:30】燃えるゴミ');
    expect(summaries[1]).toContain('【締切08:30】燃えるゴミ {"dateTime":"2026-10-20T07:30:00+09:00"');
  });
  it('重ねて見る予定: 表示中のカレンダーだけ・タスクの予定は除く・時刻は JST・終日はそのまま', async () => {
    const { google, gcal } = syncSetup();
    google.listed = {
      'cal-work': [
        { id: 'a', summary: '教室A: 6年26', start: { dateTime: '2026-10-15T07:00:00Z' }, end: { dateTime: '2026-10-15T12:15:00Z' } },
        { id: 'b', summary: '【締切15:05】予習: 教室A 6年26', start: { dateTime: '2026-10-15T05:05:00Z' } },
        { id: 'c', summary: 'アプリの予定', start: { date: '2026-10-16' }, extendedProperties: { private: { vectodo: '1' } } },
        { id: 'd', summary: '消された予定', status: 'cancelled', start: { date: '2026-10-16' } },
      ],
      'cal-other': [{ id: 'e', summary: '旅行', start: { date: '2026-10-17' }, end: { date: '2026-10-20' } }],
      'cal-memo': [{ id: 'f', summary: '買い物リスト', start: { date: '2026-10-15' } }],
    };
    const evs = await gcal.overlay('2026-10-12', '2026-10-18');
    expect(evs).toEqual([
      { id: 'a', calendar: 'バイト', color: '#333333', title: '教室A: 6年26', date: '2026-10-15', endDate: '2026-10-16', start: '16:00', end: '21:15' },
      { id: 'e', calendar: 'その他', color: '#222222', title: '旅行', date: '2026-10-17', endDate: '2026-10-20', start: null, end: null },
    ]);
  });
  it('tasks.md 時代の予定を一度だけ引き取り、二重に作らない', async () => {
    const { tasks, categories, google, gcal } = syncSetup();
    const gno = categories.create({ name: 'バイト' });
    await gcal.mapCalendars();
    google.events.set('legacy1', {
      calendarId: 'cal-work',
      body: null,
      raw: { id: 'legacy1', summary: '【締切15:05】予習: 教室A 6年26', start: { dateTime: '2026-10-15T14:05:00+09:00' } },
    });
    google.events.set('legacyPast', {
      calendarId: 'cal-work',
      body: null,
      raw: { id: 'legacyPast', summary: '【締切15:05】予習: 教室A 6年23', start: { dateTime: '2026-09-17T14:05:00+09:00' } },
    });
    tasks.create(
      {
        title: '予習: 教室A 6年26',
        categoryId: gno.id,
        dueDate: '2026-10-15',
        dueTime: '15:05',
        notes: '── tasks.md から移行（T-069・バイト 予習・2026-10-13）──\nカレンダー: 「バイト」`legacy1` ／「バイト」`legacyPast`',
      },
      { id: 69 },
    );
    const r = await gcal.run();
    expect(r).toMatchObject({ created: 0, updated: 1 });
    expect(google.calls).toEqual(['update cal-work 【締切15:05】予習: 教室A 6年26']);
    expect(google.events.get('legacy1')!.body!.extendedProperties.private.task).toBe('69');
    // 2回目以降は引き取りをしない（設定に印）
    expect(await gcal.run()).toMatchObject({ created: 0, updated: 0 });
  });
});

describe('目標をやる時間の書き出し（design 4-14）', () => {
  it('時刻つきは5分前の通知・時刻なしは終日。記録すると【済】・外すと消す・アーカイブで先の予定は消える', async () => {
    const s = setup(TODAY);
    const google = new FakeGoogle();
    const gcal = new GcalSync(s.db, s.tasks, s.categories, s.settings, s.clock, google, {
      appUrl: 'https://app.example:5180',
      timezone: 'Asia/Tokyo',
      goalPlans: () => s.goals.plans(),
    });
    await gcal.mapCalendars();
    const g = s.goals.create({ title: '回路の本', kind: 'rate', period: 'day', target: 10, unit: 'ページ' });
    const timed = s.goals.addPlan(g.id, { date: TODAY, start: '21:00', minutes: 30 });
    s.goals.addPlan(g.id, { date: '2026-10-14' });
    expect(await gcal.run()).toMatchObject({ created: 2, errors: [] });
    expect(google.calls).toEqual(['insert cal-other 【目標】回路の本', 'insert cal-other 【目標】回路の本']);
    const bodies = [...google.events.values()].map((e) => e.body!);
    expect(bodies[0]).toMatchObject({
      start: { dateTime: '2026-10-13T21:00:00+09:00' },
      end: { dateTime: '2026-10-13T21:30:00+09:00' },
      colorId: '10',
      reminders: { overrides: [{ method: 'popup', minutes: 5 }] },
      extendedProperties: { private: { vectodo: '1', task: '0', slot: `goal:${timed.id}` } },
    });
    expect(bodies[0]!.description).toBe('目標: G-001 1日に10ページ（Vectodo で管理）\nhttps://app.example:5180/goals/1');
    expect(bodies[1]).toMatchObject({ start: { date: '2026-10-14' }, end: { date: '2026-10-15' } });

    // 記録するとその日の予定が済になり、【済】にして通知を外す
    s.goals.addLog(g.id, { amount: 10 });
    google.calls = [];
    await gcal.run();
    expect(google.calls).toEqual(['update cal-other 【済】【目標】回路の本']);
    expect([...google.events.values()][0]!.body!.reminders.overrides).toEqual([]);

    // 外したら消す
    s.goals.deletePlan(timed.id);
    google.calls = [];
    await gcal.run();
    expect(google.calls).toEqual(['remove cal-other ev1']);

    // アーカイブすると先の予定は消える
    s.goals.update(g.id, { archived: true });
    google.calls = [];
    await gcal.run();
    expect(google.calls).toEqual(['remove cal-other ev2']);
  });
});
