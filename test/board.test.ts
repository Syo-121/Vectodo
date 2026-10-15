import { describe, expect, it } from 'vitest';
import type { OverlayEvent, Task } from '../src/shared/types.ts';
import {
  bottlenecks,
  columnPatch,
  kanbanColumns,
  monthGrid,
  moveDoDate,
  overlayByDay,
  planQueue,
  quadrantOf,
  reviewDays,
  urgencyOf,
  weekDays,
} from '../src/web/board/logic.ts';

const TODAY = '2026-10-13';
let seq = 100;
function task(p: Partial<Task> = {}): Task {
  const id = p.id ?? ++seq;
  return {
    id,
    code: `T-${id}`,
    parentId: null,
    parentTitle: null,
    position: 0,
    title: `t${id}`,
    status: 'todo',
    categoryId: null,
    priority: null,
    dueDate: null,
    dueTime: null,
    estimateMin: null,
    notes: '',
    recurrence: null,
    legacyId: null,
    actualMin: null,
    createdAt: `${TODAY}T09:00:00+09:00`,
    updatedAt: `${TODAY}T09:00:00+09:00`,
    completedAt: null,
    doDates: [],
    dependsOn: [],
    blocked: false,
    children: { total: 0, done: 0 },
    ...p,
  };
}
const ref = (t: Task) => ({ id: t.id, code: t.code, title: t.title, status: t.status });

describe('緊急度', () => {
  it('締切までの日数で区切る', () => {
    expect(urgencyOf(task({ dueDate: '2026-10-12' }), TODAY)).toBe('overdue');
    expect(urgencyOf(task({ dueDate: TODAY }), TODAY)).toBe('today');
    expect(urgencyOf(task({ dueDate: '2026-10-16' }), TODAY)).toBe('d3');
    expect(urgencyOf(task({ dueDate: '2026-10-20' }), TODAY)).toBe('d7');
    expect(urgencyOf(task({ dueDate: '2026-10-21' }), TODAY)).toBe('later');
    expect(urgencyOf(task(), TODAY)).toBe('none');
  });
});

describe('カンバン', () => {
  it('状態の列: 完了は直近のものを新しい順・中止は出さない', () => {
    const a = task({ status: 'doing' });
    const d1 = task({ status: 'done', completedAt: '2026-10-12T10:00:00+09:00' });
    const d2 = task({ status: 'done', completedAt: '2026-10-13T08:00:00+09:00' });
    const c = task({ status: 'canceled' });
    const cols = kanbanColumns([a, d1, d2, c], 'status', TODAY, []);
    expect(cols.map((x) => [x.key, x.tasks.map((t) => t.id)])).toEqual([
      ['todo', []],
      ['doing', [a.id]],
      ['waiting', []],
      ['done', [d2.id, d1.id]],
    ]);
  });
  it('カテゴリの列: アーカイブ済みは使われているときだけ', () => {
    const cats = [
      { id: 1, name: '研究', color: '#000000', position: 1, archived: false, gcalCalendarId: null, hideAfterDays: null, hideFromPlan: false },
      { id: 2, name: '試験', color: '#000000', position: 2, archived: true, gcalCalendarId: null, hideAfterDays: null, hideFromPlan: false },
      { id: 3, name: '旧', color: '#000000', position: 3, archived: true, gcalCalendarId: null, hideAfterDays: null, hideFromPlan: false },
    ];
    const cols = kanbanColumns([task({ categoryId: 2 }), task()], 'category', TODAY, cats);
    expect(cols.map((c) => c.label)).toEqual(['研究', '試験', 'カテゴリなし']);
  });
  it('列へ落としたときの変更・緊急度は不可', () => {
    expect(columnPatch('status', 'waiting')).toEqual({ status: 'waiting' });
    expect(columnPatch('priority', '2')).toEqual({ priority: 2 });
    expect(columnPatch('priority', 'none')).toEqual({ priority: null });
    expect(columnPatch('category', '5')).toEqual({ categoryId: 5 });
    expect(columnPatch('urgency', 'today')).toBeNull();
    expect(kanbanColumns([], 'urgency', TODAY, []).every((c) => !c.droppable)).toBe(true);
  });
});

describe('週', () => {
  it('やる日と締切を日ごとに・合計は配分時間、無ければ見積を割る', () => {
    const a = task({ doDates: [{ date: TODAY, minutes: 120 }] });
    const b = task({ estimateMin: 180, doDates: [{ date: TODAY, minutes: null }, { date: '2026-10-14', minutes: null }] });
    const c = task({ dueDate: TODAY });
    const both = task({ dueDate: '2026-10-14', doDates: [{ date: '2026-10-14', minutes: 30 }] });
    const outside = task({ doDates: [{ date: '2026-10-20', minutes: 60 }] });
    const done = task({ status: 'done', doDates: [{ date: TODAY, minutes: 60 }] });
    const days = weekDays([a, b, c, both, outside, done], TODAY);
    expect(days).toHaveLength(7);
    expect(days[0]!.items.map((i) => [i.task.id, i.kind, i.minutes, i.estimated])).toEqual([
      [a.id, 'do', 120, false],
      [b.id, 'do', 90, true],
      [c.id, 'due', null, false],
    ]);
    expect(days[0]!.loadMin).toBe(210);
    // 同じ日にやる日と締切があれば、やる日のカード1枚だけ（並びは締切があるほうが先）
    expect(days[1]!.items.map((i) => [i.task.id, i.kind])).toEqual([
      [both.id, 'do'],
      [b.id, 'do'],
    ]);
    expect(days[6]!.date).toBe('2026-10-19');
  });
  it('やる日を移す・移した先にあれば時間を足す', () => {
    const dates = [
      { date: '2026-10-13', minutes: 60 },
      { date: '2026-10-15', minutes: 30 },
    ];
    expect(moveDoDate(dates, '2026-10-13', '2026-10-14')).toEqual([
      { date: '2026-10-14', minutes: 60 },
      { date: '2026-10-15', minutes: 30 },
    ]);
    expect(moveDoDate(dates, '2026-10-13', '2026-10-15')).toEqual([{ date: '2026-10-15', minutes: 90 }]);
    expect(moveDoDate(dates, '2026-10-13', '2026-10-13')).toBe(dates);
  });
});

describe('重要×緊急・計画待ち', () => {
  it('重要＝優先度「高」、緊急＝締切3日以内（期限切れ含む）', () => {
    expect(quadrantOf(task({ priority: 1, dueDate: '2026-10-16' }), TODAY)).toBe(1);
    expect(quadrantOf(task({ priority: 1, dueDate: '2026-10-17' }), TODAY)).toBe(2);
    expect(quadrantOf(task({ priority: 1 }), TODAY)).toBe(2);
    expect(quadrantOf(task({ priority: 2, dueDate: '2026-10-01' }), TODAY)).toBe(3);
    expect(quadrantOf(task({ priority: 3 }), TODAY)).toBe(4);
  });
  it('計画待ちは締切ありでやる日なしの未完了だけ、締切が近い順', () => {
    const late = task({ dueDate: '2026-10-20' });
    const soon = task({ dueDate: '2026-10-15' });
    const planned = task({ dueDate: '2026-10-14', doDates: [{ date: TODAY, minutes: null }] });
    const noDue = task();
    const done = task({ dueDate: '2026-10-14', status: 'done' });
    expect(planQueue([late, soon, planned, noDue, done]).map((t) => t.id)).toEqual([soon.id, late.id]);
  });
});

describe('ボトルネック', () => {
  it('待たれている数・すぐ着手できる数・連鎖の総数', () => {
    const a = task();
    const x = task();
    const b = task({ dependsOn: [ref(a)] });
    const c = task({ dependsOn: [ref(a), ref(x)] });
    const d = task({ dependsOn: [ref(b)] });
    const doneDep = task({ status: 'done' });
    const e = task({ dependsOn: [ref(doneDep)] });
    const list = bottlenecks([a, x, b, c, d, doneDep, e]);
    const top = list[0]!;
    expect(top.task.id).toBe(a.id);
    expect(top.waiters.map((w) => w.id)).toEqual([b.id, c.id]);
    expect(top.freed).toBe(1); // b だけ（c は x も待っている）
    expect(top.downstream).toBe(3); // b・c・d
    expect(list.some((x2) => x2.task.id === doneDep.id)).toBe(false);
    // b は d を待たせているが、自分も a 待ちなので出さない（d は a の連鎖に入っている）
    expect(list.some((x2) => x2.task.id === b.id)).toBe(false);
    expect(list.map((x2) => x2.task.id)).toEqual([a.id, x.id]);
  });

  it('状態が「待ち」のものは、連鎖が長くても後ろに回す', () => {
    const w = task({ status: 'waiting' });
    const w1 = task({ dependsOn: [ref(w)] });
    const w2 = task({ dependsOn: [ref(w1)] });
    const r = task();
    const r1 = task({ dependsOn: [ref(r)] });
    expect(bottlenecks([w, w1, w2, r, r1]).map((x) => x.task.id)).toEqual([r.id, w.id]);
  });
});

describe('振り返り', () => {
  it('終わった日ごとに新しい順（中止は更新日で）', () => {
    const d1 = task({ status: 'done', completedAt: '2026-10-12T20:00:00+09:00' });
    const d2 = task({ status: 'done', completedAt: '2026-10-13T08:00:00+09:00' });
    const c = task({ status: 'canceled', updatedAt: '2026-10-12T10:00:00+09:00' });
    const old = task({ status: 'done', completedAt: '2026-10-01T10:00:00+09:00' });
    const days = reviewDays([d1, d2, c, old, task()], '2026-10-07');
    expect(days.map((d) => [d.date, d.tasks.map((t) => t.id)])).toEqual([
      ['2026-10-13', [d2.id]],
      ['2026-10-12', [d1.id, c.id]],
    ]);
  });
});

describe("月（v3・design 7-11）", () => {
  it("月曜はじまりで、前後の月の日も含めて週単位に並べる", () => {
    const g = monthGrid("2026-10-14", 0);
    expect(g.month).toBe("2026-10");
    expect(g.dates[0]).toBe("2026-09-28"); // 10/1 は木曜 → その週の月曜
    expect(g.dates.at(-1)).toBe("2026-11-01"); // 10/31 は土曜 → その週の日曜
    expect(g.dates).toHaveLength(35);
    expect(monthGrid("2026-10-14", 2).month).toBe("2026-12");
    expect(monthGrid("2026-10-14", 3).first).toBe("2027-01-01");
  });
  it("重ねる予定: 終日の連続予定は続く日すべてへ・終日が先で時刻順", () => {
    const ev = (p: Partial<OverlayEvent>): OverlayEvent => ({
      id: Math.random().toString(),
      calendar: "c",
      color: null,
      title: "t",
      date: "2026-10-15",
      endDate: "2026-10-16",
      start: null,
      end: null,
      ...p,
    });
    const trip = ev({ title: "旅行", date: "2026-10-17", endDate: "2026-10-20" });
    const late = ev({ title: "バイト", start: "16:00" });
    const early = ev({ title: "授業", start: "09:00" });
    const allDay = ev({ title: "祝日" });
    const m = overlayByDay([late, trip, early, allDay], ["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"]);
    expect(m.get("2026-10-15")!.map((e) => e.title)).toEqual(["祝日", "授業", "バイト"]);
    expect([...m.entries()].filter(([, l]) => l.some((e) => e.title === "旅行")).map(([d]) => d)).toEqual([
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
    ]);
  });
});
