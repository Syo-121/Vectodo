// シリーズの依存の図（v4・design 7-12）。シリーズ＝親タスク1つ。子どうしの依存を DAG で描き、
// 親をまたぐ線の先は「外」のノード（点線の枠）として出す。スマホは上→下、広い画面は左→右に流す。
// ノードの ● を押したまま後にやるタスクの上で離すと依存ができ、線を押すと外せる。上の欄から親に子タスクを足せる。
// 図の上でした操作は「戻す」「やり直す」（Ctrl+Z・Ctrl+Y）で取り消せる。

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { isOpen, STATUS_LABEL } from '../../shared/constants.ts';
import { formatTaskCode } from '../../shared/ids.ts';
import type { Category, SeriesGraph, SeriesSummary, Task } from '../../shared/types.ts';
import { api, useSeries, useSeriesList, useWrite } from '../api.ts';
import { useWideScreen } from '../media.ts';
import { useOpenTask } from '../nav.ts';
import { useLocalState } from '../storage.ts';
import { toast } from '../toast.ts';
import { cx, fmtDate, isDimmed } from '../util.ts';
import { layoutDag, missingChain, type Edge, type Point } from './dag.ts';

type Dir = 'down' | 'right';

/** ノードの大きさと間隔（main＝流れる向き・cross＝同じ段の横並び） */
const GEOM: Record<Dir, { w: number; h: number; main: number; cross: number }> = {
  down: { w: 150, h: 66, main: 40, cross: 14 },
  right: { w: 184, h: 62, main: 52, cross: 14 },
};

/** 段と列 → 左上の座標 */
function place(p: Point, dir: Dir) {
  const g = GEOM[dir];
  return dir === 'down'
    ? { x: p.slot * (g.w + g.cross), y: p.layer * (g.h + g.main) }
    : { x: p.layer * (g.w + g.main), y: p.slot * (g.h + g.cross) };
}

/** 線を SVG の path に。ノードの出口（下／右）から次の入口（上／左）へ曲線で、中継点はまっすぐ通り抜ける */
function edgePath(points: Point[], dir: Dir): { d: string; tip: { x: number; y: number } } {
  const g = GEOM[dir];
  const ends = points.map((p) => {
    const { x, y } = place(p, dir);
    return dir === 'down'
      ? { in: { x: x + g.w / 2, y }, out: { x: x + g.w / 2, y: y + g.h } }
      : { in: { x, y: y + g.h / 2 }, out: { x: x + g.w, y: y + g.h / 2 } };
  });
  let d = `M${ends[0]!.out.x},${ends[0]!.out.y}`;
  for (let i = 1; i < ends.length; i++) {
    const a = ends[i - 1]!.out;
    const b = ends[i]!.in;
    if (dir === 'down') {
      const m = (b.y - a.y) / 2;
      d += ` C${a.x},${a.y + m} ${b.x},${b.y - m} ${b.x},${b.y}`;
    } else {
      const m = (b.x - a.x) / 2;
      d += ` C${a.x + m},${a.y} ${b.x - m},${b.y} ${b.x},${b.y}`;
    }
    if (i < ends.length - 1) d += ` L${ends[i]!.out.x},${ends[i]!.out.y}`;
  }
  return { d, tip: ends[ends.length - 1]!.in };
}

function arrow(tip: { x: number; y: number }, dir: Dir): string {
  const { x, y } = tip;
  return dir === 'down'
    ? `${x - 4.5},${y - 7} ${x + 4.5},${y - 7} ${x},${y}`
    : `${x - 7},${y - 4.5} ${x - 7},${y + 4.5} ${x},${y}`;
}

/** 図の上でした操作（戻す・やり直すのため）。add は足した子タスク、chain は一列につないで増えた線 */
type Act =
  | { kind: 'link'; from: number; to: number }
  | { kind: 'unlink'; from: number; to: number }
  | { kind: 'add'; id: number; title: string }
  | { kind: 'chain'; edges: Edge[] };

function actLabel(a: Act): string {
  const c = formatTaskCode;
  if (a.kind === 'link') return `${c(a.from)} → ${c(a.to)} の線`;
  if (a.kind === 'unlink') return `${c(a.from)} → ${c(a.to)} の線を外したこと`;
  if (a.kind === 'add') return `${c(a.id)}「${a.title}」を足したこと`;
  return `一列につないだ ${a.edges.length} 本`;
}

/** 番号を付け替える（やり直しで足し直した子タスクは新しい番号になるので、後の操作もそちらを向ける） */
function remap(a: Act, from: number, to: number): Act {
  const m = (n: number) => (n === from ? to : n);
  if (a.kind === 'link' || a.kind === 'unlink') return { ...a, from: m(a.from), to: m(a.to) };
  if (a.kind === 'add') return a;
  return { ...a, edges: a.edges.map((e) => ({ from: m(e.from), to: m(e.to) })) };
}

export function SeriesView({ today, categories }: { today: string; categories: Map<number, Category> }) {
  const { data: list, isLoading } = useSeriesList();
  const [params, setParams] = useSearchParams();
  const [saved, setSaved] = useLocalState<number | null>('board.series', null);
  // 詳細の「図で見る」から /board?v=series&s=133 で来たら、それを覚えておく
  const urlId = params.get('s') !== null ? Number(params.get('s')) : null;
  const fromUrl = urlId !== null && Number.isSafeInteger(urlId) && urlId >= 0 ? urlId : null;
  useEffect(() => {
    if (fromUrl !== null) setSaved(fromUrl);
  }, [fromUrl]);
  const id = fromUrl ?? (list?.some((s) => s.id === saved) ? saved : (list?.[0]?.id ?? null));
  const { data: graph } = useSeries(id);
  // 子タスクの詳細の「シリーズの図で見る」から来たとき（&f=140）、そのタスクを光らせる
  const f = Number(params.get('f'));
  const focus = fromUrl !== null && Number.isSafeInteger(f) && f > 0 ? f : null;

  const choose = (next: number) => {
    setSaved(next);
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('s');
        n.delete('f');
        return n;
      },
      { replace: true },
    );
  };

  if (isLoading) return <p className="p-4 text-sm text-zinc-400">読み込み中…</p>;
  if (!list?.length) {
    return (
      <p className="px-4 py-6 text-sm leading-relaxed text-zinc-500">
        シリーズ（子タスクを持つタスク）がまだない。タスクの詳細で「子タスクを追加」すると、ここにシリーズとして出て、子どうしの依存を図で見られる。
      </p>
    );
  }
  return (
    <div className="px-4 pb-6">
      <SeriesPicker list={list} value={id} onChange={choose} />
      {graph && id !== null ? (
        <GraphPanel key={id} id={id} graph={graph} today={today} categories={categories} focus={focus} />
      ) : (
        <p className="py-4 text-sm text-zinc-400">読み込み中…</p>
      )}
    </div>
  );
}

function SeriesPicker({
  list,
  value,
  onChange,
}: {
  list: SeriesSummary[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  const open = list.filter((s) => s.id === 0 || isOpen(s.status));
  const closed = list.filter((s) => s.id !== 0 && !isOpen(s.status));
  const label = (s: SeriesSummary) =>
    `${s.code ? `${s.code} ` : ''}${s.title}（${s.children.done}/${s.children.total}${s.edges ? `・線 ${s.edges}` : ''}）`;
  const option = (s: SeriesSummary) => (
    <option key={s.id} value={s.id}>
      {label(s)}
    </option>
  );
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="シリーズ"
      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm md:w-auto md:min-w-80 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <optgroup label="進行中">{open.map(option)}</optgroup>
      {closed.length > 0 && <optgroup label="終わったシリーズ">{closed.map(option)}</optgroup>}
    </select>
  );
}

function GraphPanel({
  id,
  graph,
  today,
  categories,
  focus,
}: {
  id: number;
  graph: SeriesGraph;
  today: string;
  categories: Map<number, Category>;
  /** 光らせるタスク（子タスクの詳細から来たとき） */
  focus: number | null;
}) {
  const dir: Dir = useWideScreen() ? 'right' : 'down';
  const g = GEOM[dir];
  const openTask = useOpenTask();
  const addDep = useWrite((e: Edge) => api.addDep(e.to, e.from));
  const rmDep = useWrite((e: Edge) => api.removeDep(e.to, e.from));
  const chain = useWrite(() => api.chainChildren(id));

  const all = useMemo(() => new Map([...graph.nodes, ...graph.outside].map((t) => [t.id, t])), [graph]);
  const inside = useMemo(() => new Set(graph.nodes.map((t) => t.id)), [graph]);
  const layout = useMemo(
    () => layoutDag([...graph.nodes, ...graph.outside].map((t) => t.id), graph.edges),
    [graph],
  );
  const missing = graph.parent ? missingChain(graph.nodes, graph.edges) : 0;
  const parent = graph.parent;

  // 戻す・やり直す: 図の上でした操作（つなぐ・外す・子を足す・一列につなぐ）を逆に当てる。シリーズを替えると消える
  const qc = useQueryClient();
  const [hist, setHist] = useState<{ undo: Act[]; redo: Act[] }>({ undo: [], redo: [] });
  const [busy, setBusy] = useState(false);
  const record = (a: Act) => setHist((h) => ({ undo: [...h.undo, a], redo: [] }));
  /** 操作を、戻す（undo）かやり直す（redo）向きに当てる。足し直した子は新しい番号で返す */
  const apply = async (a: Act, dir: 'undo' | 'redo'): Promise<Act> => {
    const forward = dir === 'redo';
    if (a.kind === 'link' || a.kind === 'unlink') {
      const add = (a.kind === 'link') === forward;
      await (add ? api.addDep(a.to, a.from) : api.removeDep(a.to, a.from));
      return a;
    }
    if (a.kind === 'chain') {
      for (const e of a.edges) await (forward ? api.addDep(e.to, e.from) : api.removeDep(e.to, e.from));
      return a;
    }
    if (!forward) {
      await api.remove(a.id);
      return a;
    }
    const t = await api.create({ title: a.title, parentId: id });
    return { ...a, id: t.id };
  };
  const step = async (dir: 'undo' | 'redo') => {
    const stack = dir === 'undo' ? hist.undo : hist.redo;
    const a = stack[stack.length - 1];
    if (!a || busy) return;
    setBusy(true);
    try {
      const done = await apply(a, dir);
      setHist((h) => {
        const moved = done.kind === 'add' && a.kind === 'add' && done.id !== a.id;
        if (dir === 'undo') return { undo: h.undo.slice(0, -1), redo: [...h.redo, done] };
        const rest = h.redo.slice(0, -1).map((x) => (moved ? remap(x, (a as { id: number }).id, (done as { id: number }).id) : x));
        return { undo: [...h.undo, done], redo: rest };
      });
      toast(`${dir === 'undo' ? '戻した' : 'やり直した'}: ${actLabel(done)}`);
    } catch (e) {
      // 当てられなかった（ほかの画面で先に変わっていた など）ものは捨てる
      setHist((h) => (dir === 'undo' ? { ...h, undo: h.undo.slice(0, -1) } : { ...h, redo: h.redo.slice(0, -1) }));
      toast(`${dir === 'undo' ? '戻せなかった' : 'やり直せなかった'}: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    }
  };
  const stepRef = useRef(step);
  stepRef.current = step;
  // Ctrl+Z で戻す・Ctrl+Y（Ctrl+Shift+Z）でやり直す（Mac は ⌘）。文字を打っている欄の中では、その欄の取り消しのまま
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        void stepRef.current('undo');
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        void stepRef.current('redo');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 広い画面（左→右）は横に長くなるので、マウスで背景をつかんで横に動かせるようにし、
  // 開いたときは最初の未完了のところまで送っておく（終わった工程が多いシリーズ向け。手前の工程の端は見せて、左にもあると分かるように）
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    const el = scroller.current;
    if (scrolled.current || (layout.nodes.size === 0 && layout.isolated.length === 0)) return;
    // 子タスクの詳細から来たときは、そのタスクが真ん中に来るように送る（図の横とページの縦の両方）
    const target = focus !== null ? document.querySelector(`[data-node="${focus}"]`) : null;
    if (target) {
      scrolled.current = true;
      target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      return;
    }
    if (!el || dir !== 'right' || layout.nodes.size === 0) return;
    scrolled.current = true;
    const open = [...layout.nodes].filter(([nid]) => {
      const st = all.get(nid)?.status;
      return st !== 'done' && st !== 'canceled';
    });
    if (open.length === 0) return;
    const first = Math.min(...open.map(([, p]) => p.layer));
    el.scrollLeft = Math.max(0, place({ layer: first, slot: 0 }, dir).x - GEOM.right.main - 80);
  }, [layout, dir, all, focus]);

  // つなぐ: ノードの ● を押したまま、後にやるタスクの上で離すと 先→後 の線ができる（指でもマウスでも）。
  // 画面の端に寄せている間は、図（横）とページ（縦）を送る
  const [link, setLink] = useState<{ from: number; x0: number; y0: number; x: number; y: number; over: number | null } | null>(null);
  const linkRef = useRef<{ from: number; handle: HTMLElement; x: number; y: number; raf: number } | null>(null);
  const nodeAt = (x: number, y: number, from: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-node]');
    const nid = el ? Number(el.dataset.node) : null;
    return nid !== null && nid !== from ? nid : null;
  };
  const redraw = () => {
    const l = linkRef.current;
    if (!l) return;
    const r = l.handle.getBoundingClientRect();
    setLink({ from: l.from, x0: r.left + r.width / 2, y0: r.top + r.height / 2, x: l.x, y: l.y, over: nodeAt(l.x, l.y, l.from) });
  };
  const connect = (from: number, to: number) => {
    if (graph.edges.some((x) => x.from === from && x.to === to)) return toast('もうつながっている');
    addDep.mutate({ from, to }, { onSuccess: () => record({ kind: 'link', from, to }) });
  };
  const startLink = (t: Task, e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // 指がもう離れていたら何もしない
    }
    const l = { from: t.id, handle, x: e.clientX, y: e.clientY, raf: 0 };
    linkRef.current = l;
    const EDGE = 40;
    const tick = () => {
      if (linkRef.current !== l) return;
      const vy = l.y < EDGE ? -(EDGE - l.y) / 3 : l.y > window.innerHeight - EDGE ? (l.y - window.innerHeight + EDGE) / 3 : 0;
      const sc = scroller.current?.getBoundingClientRect();
      const vx = !sc ? 0 : l.x < sc.left + EDGE ? -(sc.left + EDGE - l.x) / 3 : l.x > sc.right - EDGE ? (l.x - sc.right + EDGE) / 3 : 0;
      if (vy) window.scrollBy(0, vy);
      if (vx && scroller.current) scroller.current.scrollLeft += vx;
      if (vx || vy) redraw();
      l.raf = requestAnimationFrame(tick);
    };
    l.raf = requestAnimationFrame(tick);
    const move = (ev: PointerEvent) => {
      l.x = ev.clientX;
      l.y = ev.clientY;
      redraw();
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      cancelAnimationFrame(l.raf);
      linkRef.current = null;
      setLink(null);
      if (ev.type !== 'pointerup') return;
      const to = nodeAt(ev.clientX, ev.clientY, l.from);
      if (to !== null) connect(l.from, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    redraw();
  };
  // 指でつないでいる間はページをスクロールさせない（touchmove を止めるには passive: false が要る）
  useEffect(() => {
    const stop = (e: TouchEvent) => {
      if (linkRef.current) e.preventDefault();
    };
    window.addEventListener('touchmove', stop, { passive: false });
    return () => window.removeEventListener('touchmove', stop);
  }, []);

  const onEdge = (e: Edge) => {
    const a = all.get(e.from);
    const b = all.get(e.to);
    if (confirm(`${a?.code}「${a?.title}」→ ${b?.code}「${b?.title}」の線を外す？`)) {
      rmDep.mutate(e, { onSuccess: () => record({ kind: 'unlink', from: e.from, to: e.to }) });
    }
  };
  const onChain = () => {
    const n = graph.nodes.filter((t) => t.status !== 'canceled').length;
    if (!confirm(`子 ${n} 件を並び順どおりに一列につなぐ？（線を ${missing} 本足す）`)) return;
    const before = graph.edges;
    chain.mutate(undefined, {
      onSuccess: async (r) => {
        toast(`${r.added} 本つないだ`);
        // 増えた線を覚えて、戻すときに外せるようにする
        const now = await api.series(id);
        const added = now.edges.filter((e) => !before.some((b) => b.from === e.from && b.to === e.to));
        if (added.length > 0) record({ kind: 'chain', edges: added });
      },
    });
  };

  const width = layout.slots && layout.layers ? place({ layer: layout.layers - 1, slot: layout.slots - 1 }, dir).x + g.w : 0;
  const height = layout.slots && layout.layers ? place({ layer: layout.layers - 1, slot: layout.slots - 1 }, dir).y + g.h : 0;
  const node = (t: Task, style: React.CSSProperties) => (
    <NodeCard
      key={t.id}
      t={t}
      dir={dir}
      outside={!inside.has(t.id)}
      linking={link?.from === t.id ? 'from' : link?.over === t.id ? 'over' : null}
      focused={t.id === focus}
      today={today}
      categories={categories}
      style={style}
      onOpen={() => openTask(t.id)}
      onLinkStart={startLink}
    />
  );

  return (
    <div>
      {parent && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-2 text-xs text-zinc-500">
          <span>
            完了 {parent.children.done}/{parent.children.total}
          </span>
          {parent.dueDate && <span>締切 {fmtDate(parent.dueDate, today)}</span>}
          {parent.status !== 'todo' && <span>親は{STATUS_LABEL[parent.status]}</span>}
          <button type="button" onClick={() => openTask(parent.id)} className="text-indigo-600 dark:text-indigo-400">
            親の詳細を開く
          </button>
        </div>
      )}

      {parent && <AddChild parentId={parent.id} onAdded={(t) => record({ kind: 'add', id: t.id, title: t.title })} />}

      {graph.nodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-2 text-xs text-zinc-500">
          <span>
            {dir === 'right' ? '右' : '下'}の <span className="text-indigo-500">●</span> を、後にやるタスクまでドラッグするとつながる。線を押すと外せる。
          </span>
          <span className="ml-auto flex gap-1.5">
            <UndoButton label="↶ 戻す" keys="Ctrl+Z" act={hist.undo.at(-1)} busy={busy} onClick={() => void step('undo')} />
            <UndoButton label="↷ やり直す" keys="Ctrl+Y" act={hist.redo.at(-1)} busy={busy} onClick={() => void step('redo')} />
          </span>
          {/* まだ線が1本も無いシリーズだけ（枝分かれさせた後に押して一列にしてしまわないように） */}
          {missing > 0 && graph.edges.length === 0 && (
            <button
              type="button"
              onClick={onChain}
              className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
            >
              並び順どおりに一列につなぐ
            </button>
          )}
        </div>
      )}

      {graph.nodes.length === 0 && (
        <p className="py-6 text-sm text-zinc-500">子タスクがまだない。上の欄から足すと、ここに並ぶ。</p>
      )}

      {layout.layers > 0 && (
        <div
          ref={scroller}
          className={cx('scroll-thin -mx-4 mt-3 overflow-x-auto px-4 pt-2 pb-4', dir === 'right' && 'cursor-grab select-none')}
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse' || (e.target as Element).closest('button, [data-hit], [data-handle]')) return;
            drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft };
          }}
          onPointerMove={(e) => {
            if (drag.current) e.currentTarget.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => (drag.current = null)}
        >
          <div className="relative mx-auto" style={{ width, height }}>
            <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height}>
              {layout.edges.map((e) => {
                const { d, tip } = edgePath(e.points, dir);
                const from = all.get(e.from)!;
                const hot = link !== null && (e.from === link.from || e.to === link.from);
                return (
                  <g
                    key={`${e.from}>${e.to}`}
                    className={
                      hot
                        ? 'text-indigo-500'
                        : from.status === 'done'
                          ? 'text-emerald-500/70'
                          : 'text-zinc-400 dark:text-zinc-500'
                    }
                  >
                    <path
                      d={d}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={hot ? 2.25 : 1.5}
                      strokeDasharray={from.status === 'canceled' ? '4 4' : undefined}
                    />
                    <polygon points={arrow(tip, dir)} fill="currentColor" />
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={18}
                      data-hit
                      style={{ pointerEvents: link ? 'none' : 'stroke', cursor: 'pointer' }}
                      onClick={() => onEdge(e)}
                    >
                      <title>この線を外す</title>
                    </path>
                  </g>
                );
              })}
            </svg>
            {[...layout.nodes].map(([nid, p]) => {
              const { x, y } = place(p, dir);
              return node(all.get(nid)!, { position: 'absolute', left: x, top: y, width: g.w, height: g.h });
            })}
          </div>
        </div>
      )}

      {layout.isolated.length > 0 && (
        <section className="mt-4">
          <h3 className="pb-2 text-xs font-semibold text-zinc-500">
            まだ線がないもの（{layout.isolated.length}）
          </h3>
          <div className="flex flex-wrap gap-x-5 gap-y-5 pb-3">
            {layout.isolated.map((nid) => node(all.get(nid)!, { width: g.w, height: g.h }))}
          </div>
        </section>
      )}

      {graph.nodes.length > 0 && (
        <p className="mt-5 text-[11px] leading-relaxed text-zinc-400">
          線は 先 → 後（後のものは、先のものが終わるまで着手できない）。薄いもの＝依存待ち・待ち、✓＝完了、点線の枠＝ほかのシリーズのタスク。
        </p>
      )}

      {/* つないでいる間の線（指・マウスの先まで） */}
      {link && (
        <svg className="pointer-events-none fixed inset-0 z-30 h-full w-full text-indigo-500">
          <line x1={link.x0} y1={link.y0} x2={link.x} y2={link.y} stroke="currentColor" strokeWidth={2} strokeDasharray="6 4" />
          <circle cx={link.x} cy={link.y} r={5} fill="currentColor" />
        </svg>
      )}
    </div>
  );
}

/** このシリーズ（親）に子タスクを足す。タイトルだけで Enter、続けて何件でも */
function AddChild({ parentId, onAdded }: { parentId: number; onAdded: (t: Task) => void }) {
  const [title, setTitle] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const create = useWrite(api.create);
  const submit = () => {
    const t = title.trim();
    if (!t) return;
    create.mutate(
      { title: t, parentId },
      {
        onSuccess: (task) => {
          toast(`${task.code} を足した`);
          onAdded(task);
        },
      },
    );
    setTitle('');
    input.current?.focus();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex gap-2 pt-3"
    >
      <input
        ref={input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="＋ このシリーズに子タスクを足す"
        enterKeyHint="send"
        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 md:max-w-md dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        disabled={!title.trim()}
        className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-40"
      >
        追加
      </button>
    </form>
  );
}

/** 戻す・やり直すのボタン。押すと何が戻るかを title に出す */
function UndoButton({ label, keys, act, busy, onClick }: { label: string; keys: string; act: Act | undefined; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!act || busy}
      title={act ? `${label.slice(2)}: ${actLabel(act)}（${keys}）` : `${label.slice(2)}ものは無い`}
      className="rounded-full border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 disabled:opacity-35 dark:border-zinc-700 dark:text-zinc-200"
    >
      {label}
    </button>
  );
}

function NodeCard({
  t,
  dir,
  outside,
  linking,
  focused,
  today,
  categories,
  style,
  onOpen,
  onLinkStart,
}: {
  t: Task;
  dir: Dir;
  outside: boolean;
  /** つないでいる最中: from＝ここから引いている・over＝ここで離すとつながる */
  linking: 'from' | 'over' | null;
  /** 子タスクの詳細から来たときの、そのタスク */
  focused: boolean;
  today: string;
  categories: Map<number, Category>;
  style: React.CSSProperties;
  onOpen: () => void;
  onLinkStart: (t: Task, e: React.PointerEvent<HTMLElement>) => void;
}) {
  const cat = t.categoryId !== null ? categories.get(t.categoryId) : undefined;
  const done = t.status === 'done';
  const canceled = t.status === 'canceled';
  // 枠の色・背景は1つだけ選ぶ（Tailwind は同じ種類のクラスを並べると、どちらが勝つか決まらない）
  const tone = done
    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
    : t.status === 'doing'
      ? 'border-indigo-400 bg-white dark:border-indigo-500 dark:bg-zinc-900'
      : outside
        ? 'border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/60'
        : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900';
  const ring = linking
    ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-zinc-950'
    : focused
      ? 'ring-[3px] ring-amber-400 ring-offset-2 dark:ring-offset-zinc-950'
      : t.status === 'doing'
        ? 'ring-1 ring-indigo-400'
        : null;
  return (
    <div data-node={t.id} style={style} className="relative">
      <button
        type="button"
        onClick={onOpen}
        title={`${t.code} ${t.title}`}
        className={cx(
          'flex size-full flex-col gap-1 overflow-hidden rounded-lg border px-2.5 py-2 text-left shadow-xs transition',
          tone,
          ring,
          outside && 'border-dashed',
          (isDimmed(t) || canceled) && !linking && !focused && 'opacity-50',
          linking === 'over' && 'shadow-md',
        )}
      >
        <div className="flex min-w-0 items-center gap-1 text-[10px] leading-none text-zinc-400">
          {cat && <span className="size-1.5 shrink-0 rounded-full" style={{ background: cat.color }} />}
          <span className="shrink-0">{t.code}</span>
          {done ? (
            <span className="shrink-0 text-emerald-600 dark:text-emerald-400">✓</span>
          ) : (
            t.status !== 'todo' && (
              <span className={cx('shrink-0', t.status === 'doing' && 'text-indigo-600 dark:text-indigo-400')}>
                {STATUS_LABEL[t.status]}
              </span>
            )
          )}
          {t.children.total > 0 && (
            <span className="shrink-0">
              子{t.children.done}/{t.children.total}
            </span>
          )}
          {outside ? (
            <span className="ml-auto min-w-0 truncate">{t.parentTitle ? `↑${t.parentTitle}` : 'シリーズの外'}</span>
          ) : (
            t.dueDate &&
            !done &&
            !canceled && (
              <span className={cx('ml-auto shrink-0', t.dueDate < today && 'text-red-500')}>
                ⏰{fmtDate(t.dueDate, today)}
              </span>
            )
          )}
        </div>
        <div
          className={cx(
            'line-clamp-2 text-[13px] leading-snug',
            (done || canceled) && 'text-zinc-500 dark:text-zinc-400',
            canceled && 'line-through',
          )}
        >
          {t.title}
        </div>
      </button>
      {/* 線を引く取っ手（出口の側）。押したまま、後にやるタスクの上で離す */}
      <span
        data-handle
        onPointerDown={(e) => onLinkStart(t, e)}
        title="ドラッグして、後にやるタスクの上で離すとつながる"
        className={cx(
          'absolute z-10 flex size-7 cursor-crosshair touch-none items-center justify-center',
          dir === 'right' ? 'top-1/2 -right-3.5 -translate-y-1/2' : '-bottom-3.5 left-1/2 -translate-x-1/2',
        )}
      >
        <span
          className={cx(
            'size-3 rounded-full border-2 border-indigo-500',
            linking === 'from' ? 'bg-indigo-500' : 'bg-white dark:bg-zinc-900',
          )}
        />
      </span>
    </div>
  );
}
