// 依存の図（DAG）の並べ方（v4・design 7-12）。画面の向きに関係ない「段（layer）」と「列（slot）」で返す。
// 段＝依存の深さ（先にやるものほど前）、列＝同じ段の中の位置。線が交わりにくいよう重心法で並べ替え、
// 2段以上またぐ線は間の段に中継点を置いて、途中のノードの上を通らないようにする。

export interface Edge {
  from: number;
  to: number;
}

export interface Point {
  layer: number;
  slot: number;
}

export interface DagLayout {
  /** 線でつながっているノードの位置 */
  nodes: Map<number, Point>;
  /** 線ごとの通り道（始点・中継点…・終点） */
  edges: { from: number; to: number; points: Point[] }[];
  /** 線が1本もつながっていないノード（渡した順のまま。図の外に並べる） */
  isolated: number[];
  layers: number;
  /** 列の幅（いちばん右の列 + 1） */
  slots: number;
}

/** 正の数＝ノード、負の数＝中継点 */
type Key = number;

const range = (from: number, to: number, step = 1): number[] => {
  const out: number[] = [];
  for (let i = from; step > 0 ? i < to : i > to; i += step) out.push(i);
  return out;
};
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** ids は並べたい順（子の並び順）。ids に無いノードへの線は無視する */
export function layoutDag(ids: number[], edges: Edge[]): DagLayout {
  const known = new Set(ids);
  const seen = new Set<string>();
  const es = edges.filter((e) => {
    const k = `${e.from}>${e.to}`;
    if (e.from === e.to || !known.has(e.from) || !known.has(e.to) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const linked = new Set(es.flatMap((e) => [e.from, e.to]));
  const order = ids.filter((id) => linked.has(id));
  const isolated = ids.filter((id) => !linked.has(id));
  if (order.length === 0) return { nodes: new Map(), edges: [], isolated, layers: 0, slots: 0 };

  // 1. 段: 先にやるものが無ければ 0、あれば（先にやるものの段の最大）+1
  const preds = new Map<number, number[]>(order.map((id) => [id, []]));
  const succs = new Map<number, number[]>(order.map((id) => [id, []]));
  for (const e of es) {
    preds.get(e.to)!.push(e.from);
    succs.get(e.from)!.push(e.to);
  }
  const layerOf = new Map<Key, number>();
  const indeg = new Map(order.map((id) => [id, preds.get(id)!.length]));
  const queue = order.filter((id) => indeg.get(id) === 0);
  for (const id of queue) layerOf.set(id, 0);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const s of succs.get(id)!) {
      layerOf.set(s, Math.max(layerOf.get(s) ?? 0, layerOf.get(id)! + 1));
      indeg.set(s, indeg.get(s)! - 1);
      if (indeg.get(s) === 0) queue.push(s);
    }
  }
  // 循環（サーバが弾くので本来は無い）で残ったものは、後ろの段に1つずつ置く
  let last = queue.length ? Math.max(...queue.map((id) => layerOf.get(id)!)) : -1;
  for (const id of order) if (!queue.includes(id)) layerOf.set(id, ++last);

  // 2. 中継点: 2段以上またぐ線は、間の段ごとに仮のノードを置く
  const up = new Map<Key, Key[]>();
  const down = new Map<Key, Key[]>();
  const link = (a: Key, b: Key) => {
    down.set(a, [...(down.get(a) ?? []), b]);
    up.set(b, [...(up.get(b) ?? []), a]);
  };
  const rank = new Map<Key, number>(order.map((id, i) => [id, i]));
  let dummy = 0;
  const chains = es.map((e) => {
    const keys: Key[] = [e.from];
    for (let l = layerOf.get(e.from)! + 1; l < layerOf.get(e.to)!; l++) {
      const d = --dummy;
      layerOf.set(d, l);
      rank.set(d, rank.get(e.from)! + 0.5);
      keys.push(d);
    }
    keys.push(e.to);
    for (let i = 1; i < keys.length; i++) link(keys[i - 1]!, keys[i]!);
    return { ...e, keys };
  });

  const L = Math.max(...layerOf.values()) + 1;
  let rows: Key[][] = Array.from({ length: L }, () => []);
  for (const [k, l] of layerOf) rows[l]!.push(k);
  for (const r of rows) r.sort((a, b) => rank.get(a)! - rank.get(b)!);

  /** 隣の段（fromAbove なら1つ前の段、でなければ1つ後の段）にいる、線でつながった相手 */
  const neighbors = (k: Key, l: number, fromAbove: boolean) =>
    ((fromAbove ? up : down).get(k) ?? []).filter((x) => layerOf.get(x) === (fromAbove ? l - 1 : l + 1));

  // 3. 段の中の順番: 上下に何往復か重心で並べ替え、交差が最も少なかったものを使う
  const indexOf = () => {
    const m = new Map<Key, number>();
    for (const r of rows) r.forEach((k, i) => m.set(k, i));
    return m;
  };
  const crossings = () => {
    const p = indexOf();
    let n = 0;
    for (let l = 0; l + 1 < L; l++) {
      const segs: [number, number][] = [];
      for (const k of rows[l]!) for (const d of neighbors(k, l, false)) segs.push([p.get(k)!, p.get(d)!]);
      for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          if ((segs[i]![0] - segs[j]![0]) * (segs[i]![1] - segs[j]![1]) < 0) n++;
        }
      }
    }
    return n;
  };
  let best = rows.map((r) => [...r]);
  let bestCross = crossings();
  for (let iter = 0; iter < 8 && bestCross > 0; iter++) {
    const fromAbove = iter % 2 === 0;
    for (const l of fromAbove ? range(1, L) : range(L - 2, -1, -1)) {
      const p = indexOf();
      const bary = new Map<Key, number>();
      rows[l]!.forEach((k, i) => {
        const ns = neighbors(k, l, fromAbove);
        bary.set(k, ns.length ? avg(ns.map((x) => p.get(x)!)) : i);
      });
      rows[l]!.sort((a, b) => bary.get(a)! - bary.get(b)!);
    }
    const c = crossings();
    if (c < bestCross) {
      bestCross = c;
      best = rows.map((r) => [...r]);
    }
  }
  rows = best;

  // 4. 列: 線の相手の平均に寄せつつ、同じ段の中は 1 以上あける（左詰めと右詰めの平均を取る）
  const width = Math.max(...rows.map((r) => r.length));
  const slot = new Map<Key, number>();
  for (const r of rows) r.forEach((k, i) => slot.set(k, (width - r.length) / 2 + i));
  for (let iter = 0; iter < 6; iter++) {
    const fromAbove = iter % 2 === 0;
    for (const l of fromAbove ? range(1, L) : range(L - 2, -1, -1)) {
      const r = rows[l]!;
      const want = r.map((k) => {
        const ns = neighbors(k, l, fromAbove);
        return ns.length ? avg(ns.map((x) => slot.get(x)!)) : slot.get(k)!;
      });
      const left = [...want];
      for (let i = 1; i < r.length; i++) left[i] = Math.max(left[i]!, left[i - 1]! + 1);
      const right = [...want];
      for (let i = r.length - 2; i >= 0; i--) right[i] = Math.min(right[i]!, right[i + 1]! - 1);
      r.forEach((k, i) => slot.set(k, (left[i]! + right[i]!) / 2));
    }
  }
  const min = Math.min(...slot.values());
  const at = (k: Key): Point => ({ layer: layerOf.get(k)!, slot: slot.get(k)! - min });

  return {
    nodes: new Map(order.map((id) => [id, at(id)])),
    edges: chains.map((c) => ({ from: c.from, to: c.to, points: c.keys.map(at) })),
    isolated,
    layers: L,
    slots: Math.max(...slot.values()) - min + 1,
  };
}

/** 並び順どおりに一列につなぐとき、まだ無い線（v4・サーバの chainChildren と同じ数え方） */
export function missingChain(nodes: { id: number; status: string }[], edges: Edge[]): number {
  const kids = nodes.filter((t) => t.status !== 'canceled');
  const has = new Set(edges.map((e) => `${e.from}>${e.to}`));
  let n = 0;
  for (let i = 1; i < kids.length; i++) if (!has.has(`${kids[i - 1]!.id}>${kids[i]!.id}`)) n++;
  return n;
}
