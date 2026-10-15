import { describe, expect, it } from 'vitest';
import { setup } from './helpers.ts';

describe('作成と番号', () => {
  it('タイトルだけで作れて、番号は T-001 から', () => {
    const { tasks } = setup();
    const t = tasks.create({ title: '  牛乳を買う ' });
    expect(t.id).toBe(1);
    expect(t.code).toBe('T-001');
    expect(t.title).toBe('牛乳を買う');
    expect(t.status).toBe('todo');
  });
  it('取り込みでは番号を指定でき、その後の新規は続きの番号から（欠番は埋めない）', () => {
    const { tasks } = setup();
    tasks.create({ title: '移行分' }, { id: 60, legacyId: 'T-060' });
    expect(tasks.create({ title: '新規' }).id).toBe(61);
    expect(() => tasks.create({ title: '重複' }, { id: 60 })).toThrow(/既にある/);
  });
  it('締切時刻だけは入れられない', () => {
    const { tasks } = setup();
    expect(() => tasks.create({ title: 'x', dueTime: '12:00' })).toThrow(/締切日/);
  });
  it('子は親のカテゴリを引き継ぐ（明示すればそちら）', () => {
    const { tasks, categories } = setup();
    const research = categories.create({ name: '研究' });
    const other = categories.create({ name: 'その他' });
    const p = tasks.create({ title: '卒研', categoryId: research.id });
    expect(tasks.create({ title: '子', parentId: p.id }).categoryId).toBe(research.id);
    expect(tasks.create({ title: '子2', parentId: p.id, categoryId: other.id }).categoryId).toBe(other.id);
    expect(tasks.create({ title: '子3', parentId: p.id, categoryId: null }).categoryId).toBeNull();
  });
});

describe('子タスク', () => {
  it('親の完了は子と独立・進み具合は中止を数えない', () => {
    const { tasks } = setup();
    const p = tasks.create({ title: '親' });
    const a = tasks.create({ title: 'a', parentId: p.id });
    const b = tasks.create({ title: 'b', parentId: p.id });
    const c = tasks.create({ title: 'c', parentId: p.id });
    tasks.update(a.id, { status: 'done' });
    tasks.update(b.id, { status: 'done' });
    tasks.update(c.id, { status: 'canceled' });
    const parent = tasks.get(p.id);
    expect(parent.status).toBe('todo');
    expect(parent.children).toEqual({ total: 2, done: 2 });
    expect(parent.childTasks.map((t) => t.title)).toEqual(['a', 'b', 'c']);
  });
  it('自分の子孫を親にはできない', () => {
    const { tasks } = setup();
    const p = tasks.create({ title: '親' });
    const c = tasks.create({ title: '子', parentId: p.id });
    const g = tasks.create({ title: '孫', parentId: c.id });
    expect(() => tasks.update(p.id, { parentId: g.id })).toThrow(/子孫/);
    expect(() => tasks.update(p.id, { parentId: p.id })).toThrow(/子孫/);
  });
  it('削除は子孫ごと・件数を返す', () => {
    const { tasks } = setup();
    const p = tasks.create({ title: '親' });
    const c = tasks.create({ title: '子', parentId: p.id });
    tasks.create({ title: '孫', parentId: c.id });
    const other = tasks.create({ title: '別', dependsOn: [c.id] });
    expect(tasks.delete(p.id)).toEqual({ deleted: 3 });
    expect(() => tasks.get(c.id)).toThrow(/見つからない/);
    expect(tasks.get(other.id).dependsOn).toEqual([]);
  });
});

describe('依存（design 4-2）', () => {
  it('依存先が未完了なら blocked、完了か中止で外れる', () => {
    const { tasks } = setup();
    const a = tasks.create({ title: 'A' });
    const b = tasks.create({ title: 'B', dependsOn: [a.id] });
    expect(tasks.get(b.id).blocked).toBe(true);
    expect(tasks.get(a.id).dependents.map((d) => d.code)).toEqual([b.code]);
    tasks.update(a.id, { status: 'canceled' });
    expect(tasks.get(b.id).blocked).toBe(false);
  });
  it('循環は弾く（間接も）', () => {
    const { tasks } = setup();
    const a = tasks.create({ title: 'A' });
    const b = tasks.create({ title: 'B', dependsOn: [a.id] });
    const c = tasks.create({ title: 'C', dependsOn: [b.id] });
    expect(() => tasks.addDependency(a.id, c.id)).toThrow(/循環/);
    expect(() => tasks.addDependency(a.id, a.id)).toThrow(/自分自身/);
    tasks.addDependency(c.id, a.id); // 循環しない追加は通る
    expect(tasks.get(c.id).dependsOn).toHaveLength(2);
  });
});

describe('今日の画面（design 4-1）', () => {
  it('期限切れ・今日・持ち越し・締切間近・今日完了に振り分ける', () => {
    const { tasks } = setup('2026-10-13');
    const overdue = tasks.create({ title: '期限切れ', dueDate: '2026-10-12' });
    const today = tasks.create({ title: '今日', doDates: [{ date: '2026-10-13', minutes: 60 }] });
    const carried = tasks.create({ title: '持ち越し', doDates: [{ date: '2026-10-10' }] });
    tasks.create({ title: '先の予定あり', doDates: [{ date: '2026-10-10' }, { date: '2026-10-15' }] });
    const soon = tasks.create({ title: '締切間近', dueDate: '2026-10-20' });
    tasks.create({ title: '遠い締切', dueDate: '2026-10-21' });
    tasks.create({ title: '未整理' });
    const done = tasks.create({ title: '済', doDates: [{ date: '2026-10-13' }] });
    tasks.update(done.id, { status: 'done' });

    const v = tasks.today();
    expect(v.overdue.map((t) => t.id)).toEqual([overdue.id]);
    expect(v.todo.map((t) => [t.id, t.carriedOver])).toEqual([
      [today.id, false],
      [carried.id, true],
    ]);
    expect(v.dueSoon.map((t) => t.id)).toEqual([soon.id]);
    expect(v.doneToday.map((t) => t.id)).toEqual([done.id]);
  });
  it('並びは優先度 → 締切 → 番号', () => {
    const { tasks } = setup('2026-10-13');
    const d = [{ date: '2026-10-13' }];
    const low = tasks.create({ title: '低', priority: 3, doDates: d });
    const none = tasks.create({ title: '未設定', doDates: d });
    const highLate = tasks.create({ title: '高・遅', priority: 1, dueDate: '2026-10-18', doDates: d });
    const highEarly = tasks.create({ title: '高・早', priority: 1, dueDate: '2026-10-14', doDates: d });
    expect(tasks.today().todo.map((t) => t.id)).toEqual([highEarly.id, highLate.id, low.id, none.id]);
  });
});

describe('未整理と一覧', () => {
  it('未整理はトップレベルで、カテゴリ・やる日・締切が空のものだけ', () => {
    const { tasks, categories } = setup();
    const cat = categories.create({ name: '研究' });
    const inbox = tasks.create({ title: 'タイトルだけ' });
    tasks.create({ title: 'カテゴリあり', categoryId: cat.id });
    tasks.create({ title: 'やる日あり', doDates: [{ date: '2026-10-20' }] });
    tasks.create({ title: '子', parentId: inbox.id });
    expect(tasks.inbox().map((t) => t.title)).toEqual(['タイトルだけ']);
  });
  it('検索は番号の揺れも拾う・LIKE の記号はそのまま探す', () => {
    const { tasks } = setup();
    tasks.create({ title: '移行分' }, { id: 60 });
    const pct = tasks.create({ title: '100% 終わらせる' });
    tasks.create({ title: '1000 円' });
    expect(tasks.all({ q: 't60' }).map((t) => t.id)).toEqual([60]);
    expect(tasks.all({ q: '0%' }).map((t) => t.id)).toEqual([pct.id]);
  });
});

describe('締切の更新', () => {
  it('締切日を消すと時刻も消える', () => {
    const { tasks } = setup();
    const t = tasks.create({ title: 'x', dueDate: '2026-10-20', dueTime: '17:00' });
    const u = tasks.update(t.id, { dueDate: null });
    expect([u.dueDate, u.dueTime]).toEqual([null, null]);
  });
  it('完了 → 戻すと completedAt が消える', () => {
    const { tasks } = setup();
    const t = tasks.create({ title: 'x' });
    expect(tasks.update(t.id, { status: 'done' }).completedAt).not.toBeNull();
    expect(tasks.update(t.id, { status: 'todo' }).completedAt).toBeNull();
  });
});

describe('やる日', () => {
  it('置き換え・同じ日は後勝ち', () => {
    const { tasks } = setup();
    const t = tasks.create({ title: 'x', doDates: [{ date: '2026-10-14', minutes: 120 }] });
    const u = tasks.setDoDates(t.id, [
      { date: '2026-10-15', minutes: 60 },
      { date: '2026-10-16' },
      { date: '2026-10-15', minutes: 30 },
    ]);
    expect(u.doDates).toEqual([
      { date: '2026-10-15', minutes: 30, start: null },
      { date: '2026-10-16', minutes: null, start: null },
    ]);
    expect(tasks.setDoDates(t.id, []).doDates).toEqual([]);
  });

  it('時刻（今日の流れの空きに置いたもの）: 省けば今のまま・null で消す', () => {
    const { tasks } = setup();
    const t = tasks.create({ title: 'x', doDates: [{ date: '2026-10-14', minutes: 60, start: '12:00' }] });
    expect(t.doDates).toEqual([{ date: '2026-10-14', minutes: 60, start: '12:00' }]);
    // 日付と配分だけ送る画面（週の移動・明日へ回す など）が時刻を消さない
    const kept = tasks.setDoDates(t.id, [{ date: '2026-10-14', minutes: 30 }, { date: '2026-10-15' }]);
    expect(kept.doDates).toEqual([
      { date: '2026-10-14', minutes: 30, start: '12:00' },
      { date: '2026-10-15', minutes: null, start: null },
    ]);
    expect(tasks.setDoDates(t.id, [{ date: '2026-10-14', start: null }]).doDates).toEqual([
      { date: '2026-10-14', minutes: null, start: null },
    ]);
  });
});

describe('繰り返し（design 4-4）', () => {
  it('設定するとやる日が無ければ最初の回が入る・完了で次の回ができる', () => {
    const { tasks, clock } = setup('2026-10-13'); // 火
    const t = tasks.create({
      title: 'プール',
      estimateMin: 90,
      recurrence: { kind: 'weekly', weekdays: [2, 5] },
    });
    expect(t.doDates).toEqual([{ date: '2026-10-13', minutes: null, start: null }]);
    expect(t.recurrence).toMatchObject({ kind: 'weekly', weekdays: [2, 5], anchor: 'do', active: true });

    tasks.update(t.id, { status: 'done' });
    const open = tasks.all().filter((x) => x.title === 'プール');
    expect(open).toHaveLength(1);
    expect(open[0]!.doDates[0]!.date).toBe('2026-10-16');
    expect(open[0]!.estimateMin).toBe(90);
    expect(open[0]!.recurrence?.id).toBe(t.recurrence?.id);

    // サボって 10/22(木) に完了 → 次は 10/23(金)
    clock.current = '2026-10-22';
    tasks.update(open[0]!.id, { status: 'done' });
    const next = tasks.all().filter((x) => x.title === 'プール');
    expect(next.map((x) => x.doDates[0]!.date)).toEqual(['2026-10-23']);
  });
  it('締切基準（anchor=due）は締切日と時刻を引き継ぐ', () => {
    const { tasks } = setup('2026-10-13');
    const t = tasks.create({
      title: '家賃',
      dueDate: '2026-10-27',
      dueTime: '15:00',
      recurrence: { kind: 'monthly', monthDay: 27, anchor: 'due' },
    });
    tasks.update(t.id, { status: 'done' });
    const [n] = tasks.all().filter((x) => x.title === '家賃');
    expect([n!.dueDate, n!.dueTime, n!.doDates]).toEqual(['2026-11-27', '15:00', []]);
  });
  it('やる日基準で締切もあれば、同じ日数だけずらす', () => {
    const { tasks } = setup('2026-10-13');
    const t = tasks.create({
      title: '週報',
      doDates: [{ date: '2026-10-13', minutes: 30 }],
      dueDate: '2026-10-14',
      recurrence: { kind: 'weekly', weekdays: [2] },
    });
    tasks.update(t.id, { status: 'done' });
    const [n] = tasks.all().filter((x) => x.title === '週報');
    expect(n!.doDates).toEqual([{ date: '2026-10-20', minutes: 30, start: null }]);
    expect(n!.dueDate).toBe('2026-10-21');
  });
  it('中止（今回は飛ばす）でも次ができる・解除したら作らない', () => {
    const { tasks } = setup('2026-10-13');
    const t = tasks.create({ title: '掃除', recurrence: { kind: 'after_done', intervalDays: 7 } });
    tasks.update(t.id, { status: 'canceled' });
    const [n] = tasks.all().filter((x) => x.title === '掃除');
    expect(n!.doDates[0]!.date).toBe('2026-10-20');
    tasks.setRecurrence(n!.id, null);
    tasks.update(n!.id, { status: 'done' });
    expect(tasks.all().filter((x) => x.title === '掃除')).toHaveLength(0);
  });
  it('未完了の回は常に1つだけ（完了を戻して再完了しても増えない）', () => {
    const { tasks } = setup('2026-10-13');
    const t = tasks.create({ title: '洗濯', recurrence: { kind: 'interval', intervalDays: 2 } });
    tasks.update(t.id, { status: 'done' });
    tasks.update(t.id, { status: 'todo' });
    tasks.update(t.id, { status: 'done' });
    expect(tasks.all().filter((x) => x.title === '洗濯')).toHaveLength(1);
  });
});

describe('カテゴリ', () => {
  it('名前の重複を弾き、消すとタスクはカテゴリなしになる', () => {
    const { tasks, categories } = setup();
    const c = categories.create({ name: 'バイト', color: '#ff8800' });
    expect(() => categories.create({ name: 'バイト' })).toThrow(/既にある/);
    const t = tasks.create({ title: '予習', categoryId: c.id });
    categories.delete(c.id);
    expect(tasks.get(t.id).categoryId).toBeNull();
  });
});

describe('カテゴリのアーカイブ（design 4-6）', () => {
  it('アーカイブしたカテゴリのタスクは今日・一覧から隠れ、includeArchived とカテゴリ指定では見える・戻すと出る', () => {
    const { tasks, categories } = setup('2026-10-13');
    const camp = categories.create({ name: 'サークル' });
    const life = categories.create({ name: '生活' });
    const done = tasks.create({ title: '反省会', categoryId: camp.id });
    tasks.update(done.id, { status: 'done' });
    tasks.create({ title: '洗濯', categoryId: life.id, doDates: [{ date: '2026-10-13' }] });
    tasks.archiveCategory(camp.id, false);

    expect(categories.get(camp.id).archived).toBe(true);
    expect(tasks.all({ includeDone: true }).map((t) => t.title)).toEqual(['洗濯']);
    expect(tasks.today().doneToday).toHaveLength(0);
    expect(tasks.all({ includeDone: true, includeArchived: true })).toHaveLength(2);
    // アーカイブ分は完了も含めて出す（未完了だけの一覧でも、終わったカテゴリの記録が見返せる）
    expect(tasks.all({ includeArchived: true }).map((t) => t.title).sort()).toEqual(['反省会', '洗濯']);
    expect(tasks.all({ includeDone: true, categoryId: camp.id }).map((t) => t.title)).toEqual(['反省会']);
    expect(tasks.get(done.id).title).toBe('反省会'); // 詳細は開ける

    categories.update(camp.id, { archived: false });
    expect(tasks.all({ includeDone: true })).toHaveLength(2);
  });
  it('未完了が残っていると断る・cancelOpen で全部中止にして、繰り返しは次の回を作らない', () => {
    const { tasks, categories } = setup('2026-10-13');
    const camp = categories.create({ name: 'サークル' });
    const a = tasks.create({ title: '会計の締め', categoryId: camp.id });
    const r = tasks.create({ title: '週次ミーティング', categoryId: camp.id, recurrence: { kind: 'weekly', weekdays: [3] } });

    expect(() => tasks.archiveCategory(camp.id, false)).toThrow(/未完了のタスクが 2 件/);
    expect(categories.get(camp.id).archived).toBe(false);

    expect(tasks.archiveCategory(camp.id, true)).toEqual({ canceled: 2 });
    expect(tasks.get(a.id).status).toBe('canceled');
    expect(tasks.get(a.id).notes).toMatch(/カテゴリ「サークル」をアーカイブ/);
    expect(tasks.get(r.id).recurrence?.active).toBe(false);
    const all = tasks.all({ includeDone: true, includeArchived: true });
    expect(all.filter((t) => t.status !== 'canceled')).toHaveLength(0); // 次の回はできていない
  });
});

describe("ボード用の取得（design 7-8）", () => {
  it("doneSince で直近の完了・中止も返す（古い完了は返さない）", () => {
    const { tasks, clock } = setup("2026-10-01");
    const old = tasks.create({ title: "古い完了" });
    tasks.update(old.id, { status: "done" });
    clock.current = "2026-10-12";
    const recent = tasks.create({ title: "最近の完了" });
    tasks.update(recent.id, { status: "done" });
    const canceled = tasks.create({ title: "最近の中止" });
    tasks.update(canceled.id, { status: "canceled" });
    const open = tasks.create({ title: "未完了" });
    const ids = tasks.all({ doneSince: "2026-10-06" }).map((t) => t.id).sort();
    expect(ids).toEqual([recent.id, canceled.id, open.id].sort());
  });
  it("子孫の総数は何段でも正確に数える", () => {
    const { tasks } = setup();
    const a = tasks.create({ title: "a" });
    const b = tasks.create({ title: "b", parentId: a.id });
    const c = tasks.create({ title: "c", parentId: b.id });
    const d = tasks.create({ title: "d", parentId: c.id });
    tasks.create({ title: "e", parentId: d.id });
    tasks.create({ title: "b2", parentId: a.id });
    expect(tasks.get(a.id).descendantCount).toBe(5);
    expect(tasks.delete(a.id)).toEqual({ deleted: 6 });
  });
});

describe("設定", () => {
  it("既定は 6 時間・変えたら残る", () => {
    const { settings } = setup();
    expect(settings.get().dailyCapacityMin).toBe(360);
    expect(settings.update({ dailyCapacityMin: 300 }).dailyCapacityMin).toBe(300);
    expect(settings.get().dailyCapacityMin).toBe(300);
  });

  it("起きている時間帯は既定 8:00〜23:00・起きる時刻が寝る時刻以降になる変更は断る", () => {
    const { settings } = setup();
    expect([settings.get().dayStartMin, settings.get().dayEndMin]).toEqual([480, 1380]);
    expect(settings.update({ dayEndMin: 1440 }).dayEndMin).toBe(1440);
    expect(() => settings.update({ dayStartMin: 1440 })).toThrow("起きる時刻");
    expect(settings.get().dayStartMin).toBe(480);
  });
});
