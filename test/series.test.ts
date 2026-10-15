import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.ts';
import type { SeriesGraph, SeriesSummary } from '../src/shared/types.ts';
import { layoutDag, missingChain } from '../src/web/board/dag.ts';
import { setup } from './helpers.ts';

describe('シリーズ（v4・design 7-12）', () => {
  it('子を持つタスクだけが並ぶ・進行中は締切順、終わったものは後ろ・アーカイブしたカテゴリは出ない', () => {
    const { tasks, categories } = setup();
    const late = tasks.create({ title: '遅い', dueDate: '2026-11-30' });
    const soon = tasks.create({ title: '早い', dueDate: '2026-10-20' });
    const done = tasks.create({ title: '済んだ' });
    const lone = tasks.create({ title: '子なし' });
    const old = categories.create({ name: '昔の' });
    const archived = tasks.create({ title: 'アーカイブ', categoryId: old.id });
    for (const p of [late, soon, done, archived]) tasks.create({ title: '子', parentId: p.id });
    tasks.update(done.id, { status: 'done' });
    categories.update(old.id, { archived: true });

    const list = tasks.seriesList();
    expect(list.map((s) => s.title)).toEqual(['早い', '遅い', '済んだ']);
    expect(list.some((s) => s.id === lone.id)).toBe(false);
    expect(list[0]!.children).toEqual({ total: 1, done: 0 });
  });

  it('図の材料: 子は全状態を並び順どおり・線の先の外のタスクも返す', () => {
    const { tasks } = setup();
    const p = tasks.create({ title: 'ブログ' });
    const a = tasks.create({ title: 'ネタ', parentId: p.id });
    const b = tasks.create({ title: '執筆', parentId: p.id });
    const c = tasks.create({ title: '公開', parentId: p.id });
    const other = tasks.create({ title: 'ドメイン取得' });
    tasks.addDependency(b.id, a.id);
    tasks.addDependency(c.id, other.id);
    tasks.update(a.id, { status: 'done' });

    const g = tasks.series(p.id);
    expect(g.parent!.id).toBe(p.id);
    expect(g.nodes.map((t) => t.title)).toEqual(['ネタ', '執筆', '公開']);
    expect(g.outside.map((t) => t.title)).toEqual(['ドメイン取得']);
    expect(g.edges).toEqual([
      { from: a.id, to: b.id },
      { from: other.id, to: c.id },
    ]);
    expect(tasks.seriesList()[0]!.edges).toBe(2);
  });

  it('「親なし」は、いちばん上の段どうしに依存があるときだけ出る（両端とも終わった線は数えない）', () => {
    const { tasks } = setup();
    const p = tasks.create({ title: '親' });
    const kid = tasks.create({ title: '子', parentId: p.id });
    tasks.create({ title: '子を待つ', dependsOn: [kid.id] }); // 子との線は親のシリーズに出るので「親なし」は作らない
    expect(tasks.seriesList().map((s) => s.id)).toEqual([p.id]);

    const a = tasks.create({ title: 'A' });
    const b = tasks.create({ title: 'B', dependsOn: [a.id] });
    tasks.create({ title: '関係ない' });
    expect(tasks.seriesList().map((s) => s.id)).toEqual([p.id, 0]);
    const g = tasks.series(0);
    expect(g.parent).toBeNull();
    expect(g.nodes.map((t) => t.title)).toEqual(['A', 'B']);

    tasks.update(a.id, { status: 'done' });
    tasks.update(b.id, { status: 'done' });
    expect(tasks.seriesList().map((s) => s.id)).toEqual([p.id]);
  });

  it('並び順どおりに一列につなぐ: 中止は飛ばし、既にある線はそのまま、循環になるなら1本もつながない', () => {
    const { tasks } = setup();
    const p = tasks.create({ title: '親' });
    const [a, b, x, c] = ['a', 'b', 'x', 'c'].map((title) => tasks.create({ title, parentId: p.id }));
    tasks.update(x!.id, { status: 'canceled' });
    tasks.addDependency(b!.id, a!.id);
    expect(tasks.chainChildren(p.id)).toEqual({ added: 1 });
    expect(tasks.get(c!.id).dependsOn.map((d) => d.id)).toEqual([b!.id]);
    expect(tasks.chainChildren(p.id)).toEqual({ added: 0 });

    const q = tasks.create({ title: '親2' });
    const [d, e, f] = ['d', 'e', 'f'].map((title) => tasks.create({ title, parentId: q.id }));
    tasks.addDependency(d!.id, f!.id); // f → d があると、d → e → f は循環になる
    expect(() => tasks.chainChildren(q.id)).toThrow(/循環/);
    expect(tasks.get(e!.id).dependsOn).toEqual([]);
  });

  it('API: 一覧・図・一列につなぐ（親なしは 0）', async () => {
    const s = setup();
    const app = createApp(s, { allowedHosts: ['localhost'] });
    const H = { host: 'localhost:5180', 'content-type': 'application/json' };
    const p = s.tasks.create({ title: '親' });
    s.tasks.create({ title: 'a', parentId: p.id });
    s.tasks.create({ title: 'b', parentId: p.id });

    const chained = await app.request(`/api/tasks/${p.id}/chain-children`, { method: 'POST', headers: H, body: '{}' });
    expect(await chained.json()).toEqual({ added: 1 });
    const list = (await (await app.request('/api/series', { headers: H })).json()) as SeriesSummary[];
    expect(list.map((x) => [x.code, x.edges])).toEqual([[p.code, 1]]);
    const g = (await (await app.request(`/api/series/${p.code}`, { headers: H })).json()) as SeriesGraph;
    expect(g.edges).toHaveLength(1);
    const top = (await (await app.request('/api/series/0', { headers: H })).json()) as SeriesGraph;
    expect(top).toEqual({ parent: null, nodes: [], outside: [], edges: [] });
    expect((await app.request('/api/series/999', { headers: H })).status).toBe(404);
  });
});

describe('依存の図の並べ方（dag.ts）', () => {
  it('一列: 段が 0,1,2… で、列はそろう', () => {
    const l = layoutDag([1, 2, 3], [
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ]);
    expect([1, 2, 3].map((id) => l.nodes.get(id))).toEqual([
      { layer: 0, slot: 0 },
      { layer: 1, slot: 0 },
      { layer: 2, slot: 0 },
    ]);
    expect(l.layers).toBe(3);
    expect(l.slots).toBe(1);
    expect(l.isolated).toEqual([]);
  });

  it('線の無いものは図の外へ・知らないノードへの線と重複は無視', () => {
    const l = layoutDag([1, 2, 3], [
      { from: 1, to: 2 },
      { from: 1, to: 2 },
      { from: 3, to: 99 },
    ]);
    expect(l.isolated).toEqual([3]);
    expect(l.edges).toHaveLength(1);
  });

  it('段は最長の道で決まる・2段またぐ線は中継点を通り、途中のノードとは別の列を通る', () => {
    // 1 → 2 → 3 と、1 → 3 の近道
    const l = layoutDag([1, 2, 3], [
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 1, to: 3 },
    ]);
    expect(l.nodes.get(3)!.layer).toBe(2);
    const skip = l.edges.find((e) => e.from === 1 && e.to === 3)!;
    expect(skip.points).toHaveLength(3);
    expect(skip.points[1]!.layer).toBe(1);
    expect(skip.points[1]!.slot).not.toBe(l.nodes.get(2)!.slot);
  });

  it('同じ段の中は 1 以上あき、交差が減るように並べ替える', () => {
    // a1→b2, a2→b1 は渡した順のままだと交差する
    const l = layoutDag([1, 2, 3, 4], [
      { from: 1, to: 4 },
      { from: 2, to: 3 },
    ]);
    const s = (id: number) => l.nodes.get(id)!.slot;
    expect(Math.abs(s(1) - s(2))).toBeGreaterThanOrEqual(1);
    expect(Math.abs(s(3) - s(4))).toBeGreaterThanOrEqual(1);
    expect(Math.sign(s(1) - s(2))).toBe(Math.sign(s(4) - s(3)));
    expect(Math.min(...[...l.nodes.values()].map((p) => p.slot))).toBe(0);
  });

  it('分かれて合流する形（ひし形）', () => {
    const l = layoutDag([1, 2, 3, 4], [
      { from: 1, to: 2 },
      { from: 1, to: 3 },
      { from: 2, to: 4 },
      { from: 3, to: 4 },
    ]);
    expect([1, 2, 3, 4].map((id) => l.nodes.get(id)!.layer)).toEqual([0, 1, 1, 2]);
    // 起点と合流点は、分かれた2つの真ん中に来る
    const mid = (l.nodes.get(2)!.slot + l.nodes.get(3)!.slot) / 2;
    expect(l.nodes.get(1)!.slot).toBeCloseTo(mid);
    expect(l.nodes.get(4)!.slot).toBeCloseTo(mid);
  });

  it('一列につなぐときに足りない線の数（中止は飛ばす）', () => {
    const nodes = [
      { id: 1, status: 'done' },
      { id: 2, status: 'canceled' },
      { id: 3, status: 'todo' },
      { id: 4, status: 'todo' },
    ];
    expect(missingChain(nodes, [])).toBe(2);
    expect(missingChain(nodes, [{ from: 1, to: 3 }])).toBe(1);
  });
});
