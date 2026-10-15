// シリーズの依存の図（v4・design 7-12）。シリーズ＝親タスク1つ。子どうしの依存を DAG で描き、
// 親をまたぐ線の先は「外」のノード（点線の枠）として出す。スマホは上→下、広い画面は左→右に流す。
// 「つなぐ・外す」の間は、先→後の順に2つ押すと依存ができ、線を押すと外せる。

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { isOpen, STATUS_LABEL } from '../../shared/constants.ts';
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

  const choose = (next: number) => {
    setSaved(next);
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('s');
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
        <GraphPanel key={id} id={id} graph={graph} today={today} categories={categories} />
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
}: {
  id: number;
  graph: SeriesGraph;
  today: string;
  categories: Map<number, Category>;
}) {
  const dir: Dir = useWideScreen() ? 'right' : 'down';
  const g = GEOM[dir];
  const openTask = useOpenTask();
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
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

  // 広い画面（左→右）は横に長くなるので、マウスで背景をつかんで横に動かせるようにし、
  // 開いたときは最初の未完了のところまで送っておく（終わった工程が多いシリーズ向け。手前の工程の端は見せて、左にもあると分かるように）
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el || dir !== 'right' || scrolled.current || layout.nodes.size === 0) return;
    scrolled.current = true;
    const open = [...layout.nodes].filter(([nid]) => {
      const st = all.get(nid)?.status;
      return st !== 'done' && st !== 'canceled';
    });
    if (open.length === 0) return;
    const first = Math.min(...open.map(([, p]) => p.layer));
    el.scrollLeft = Math.max(0, place({ layer: first, slot: 0 }, dir).x - GEOM.right.main - 80);
  }, [layout, dir, all]);

  const onTap = (t: Task) => {
    if (!editing) return openTask(t.id);
    if (sel === null) return setSel(t.id);
    if (sel === t.id) return setSel(null);
    const e = { from: sel, to: t.id };
    if (graph.edges.some((x) => x.from === e.from && x.to === e.to)) {
      toast('もうつながっている');
      return setSel(t.id);
    }
    // つないだら、押したほうを次の「先」にする（続けて押すと一列につながる）
    addDep.mutate(e, { onSuccess: () => setSel(t.id) });
  };
  const onEdge = (e: Edge) => {
    const a = all.get(e.from);
    const b = all.get(e.to);
    if (confirm(`${a?.code}「${a?.title}」→ ${b?.code}「${b?.title}」の線を外す？`)) rmDep.mutate(e);
  };
  const onChain = () => {
    const n = graph.nodes.filter((t) => t.status !== 'canceled').length;
    if (!confirm(`子 ${n} 件を並び順どおりに一列につなぐ？（線を ${missing} 本足す）`)) return;
    chain.mutate(undefined, { onSuccess: (r) => toast(`${r.added} 本つないだ`) });
  };

  const width = layout.slots && layout.layers ? place({ layer: layout.layers - 1, slot: layout.slots - 1 }, dir).x + g.w : 0;
  const height = layout.slots && layout.layers ? place({ layer: layout.layers - 1, slot: layout.slots - 1 }, dir).y + g.h : 0;
  const node = (t: Task, style: React.CSSProperties) => (
    <NodeCard
      key={t.id}
      t={t}
      outside={!inside.has(t.id)}
      selected={sel === t.id}
      editing={editing}
      today={today}
      categories={categories}
      style={style}
      onTap={onTap}
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

      {graph.nodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-3">
          <button
            type="button"
            onClick={() => {
              setEditing(!editing);
              setSel(null);
            }}
            className={cx(
              'rounded-full px-3 py-1.5 text-sm',
              editing
                ? 'bg-indigo-600 text-white'
                : 'border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200',
            )}
          >
            {editing ? '✓ つなぎ終わる' : 'つなぐ・外す'}
          </button>
          {missing > 0 && (editing || graph.edges.length === 0) && (
            <button
              type="button"
              onClick={onChain}
              className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
            >
              並び順どおりに一列につなぐ
            </button>
          )}
        </div>
      )}
      {editing && (
        <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs leading-relaxed text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200">
          {sel === null
            ? '先にやるタスクを押す。線を押すと外せる。'
            : `「${all.get(sel)?.title}」の後にやるタスクを押す（同じものをもう一度押すと選び直し）。`}
        </p>
      )}

      {graph.nodes.length === 0 && (
        <p className="py-6 text-sm text-zinc-500">子タスクがまだない。親の詳細で子を足すと、ここに並ぶ。</p>
      )}

      {layout.layers > 0 && (
        <div
          ref={scroller}
          className={cx('scroll-thin -mx-4 mt-3 overflow-x-auto px-4 py-2', dir === 'right' && 'cursor-grab select-none')}
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse' || (e.target as Element).closest('button, [data-hit]')) return;
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
                const hot = sel !== null && (e.from === sel || e.to === sel);
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
                    {editing && (
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={18}
                        data-hit
                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                        onClick={() => onEdge(e)}
                      >
                        <title>この線を外す</title>
                      </path>
                    )}
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
          <div className="flex flex-wrap gap-3">
            {layout.isolated.map((nid) => node(all.get(nid)!, { width: g.w, height: g.h }))}
          </div>
        </section>
      )}

      {graph.nodes.length > 0 && (
        <p className="mt-5 text-[11px] leading-relaxed text-zinc-400">
          線は 先 → 後（後のものは、先のものが終わるまで着手できない）。薄いもの＝依存待ち・待ち、✓＝完了、点線の枠＝ほかのシリーズのタスク。
        </p>
      )}
    </div>
  );
}

function NodeCard({
  t,
  outside,
  selected,
  editing,
  today,
  categories,
  style,
  onTap,
}: {
  t: Task;
  outside: boolean;
  selected: boolean;
  editing: boolean;
  today: string;
  categories: Map<number, Category>;
  style: React.CSSProperties;
  onTap: (t: Task) => void;
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
  const ring = selected
    ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-zinc-950'
    : t.status === 'doing'
      ? 'ring-1 ring-indigo-400'
      : null;
  return (
    <button
      type="button"
      onClick={() => onTap(t)}
      style={style}
      title={`${t.code} ${t.title}`}
      className={cx(
        'flex flex-col gap-1 overflow-hidden rounded-lg border px-2.5 py-2 text-left shadow-xs transition',
        tone,
        ring,
        outside && 'border-dashed',
        (isDimmed(t) || canceled) && !selected && 'opacity-50',
        editing && !selected && 'hover:shadow-md',
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
  );
}
