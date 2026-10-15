// ノート（design 7-13・3-6e）: Google Keep のような自由なメモ。受信箱のクイックメモ（振り分けて「済」にするもの）とは別に、残しておくもの。
// 上に「メモを入力…」（☑ でチェックリスト）、その下にカードを並べる（固定したものが先）。カードを押すと開いて書き直せる（書いたそばから保存）。
// 色・固定・ラベル・アーカイブ・削除。上の検索とラベルで絞る。

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { NOTE_COLORS, type NoteColor } from '../../shared/constants.ts';
import type { Note, NoteItem } from '../../shared/types.ts';
import { api, useNoteLabels, useNotes } from '../api.ts';
import { PageHeader } from '../components/Layout.tsx';
import { useKeyboardViewport, useMediaQuery } from '../media.ts';
import { noteFontPx, useNoteFont } from '../noteFont.ts';
import { useOffline } from '../offline.ts';
import { enqueue, useOutbox, withPendingChecks } from '../outbox.ts';
import { useLocalState } from '../storage.ts';
import { toast } from '../toast.ts';
import { cx } from '../util.ts';

/** カードと開いたときの地の色 */
const BG: Record<NoteColor, string> = {
  red: 'bg-red-100 border-red-200 dark:bg-red-950/60 dark:border-red-900',
  orange: 'bg-orange-100 border-orange-200 dark:bg-orange-950/60 dark:border-orange-900',
  yellow: 'bg-yellow-100 border-yellow-200 dark:bg-yellow-950/50 dark:border-yellow-900',
  green: 'bg-green-100 border-green-200 dark:bg-green-950/60 dark:border-green-900',
  teal: 'bg-teal-100 border-teal-200 dark:bg-teal-950/60 dark:border-teal-900',
  blue: 'bg-sky-100 border-sky-200 dark:bg-sky-950/60 dark:border-sky-900',
  purple: 'bg-purple-100 border-purple-200 dark:bg-purple-950/60 dark:border-purple-900',
  pink: 'bg-pink-100 border-pink-200 dark:bg-pink-950/60 dark:border-pink-900',
  brown: 'bg-[#efe3d6] border-[#e0cdb8] dark:bg-[#3a2a1c] dark:border-[#4d3826]',
  gray: 'bg-zinc-200 border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700',
};
const PLAIN = 'bg-white border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800';
/** 色を選ぶ丸 */
const SWATCH: Record<NoteColor, string> = {
  red: '#fca5a5',
  orange: '#fdba74',
  yellow: '#fde047',
  green: '#86efac',
  teal: '#5eead4',
  blue: '#7dd3fc',
  purple: '#d8b4fe',
  pink: '#f9a8d4',
  brown: '#d6b896',
  gray: '#d4d4d8',
};
const COLOR_LABEL: Record<NoteColor, string> = {
  red: '赤',
  orange: 'オレンジ',
  yellow: '黄',
  green: '緑',
  teal: '青緑',
  blue: '青',
  purple: '紫',
  pink: 'ピンク',
  brown: '茶',
  gray: '灰',
};

type Draft = Pick<Note, 'title' | 'body' | 'kind' | 'items' | 'color' | 'labels' | 'pinned' | 'archived'>;
const EMPTY: Draft = { title: '', body: '', kind: 'text', items: [], color: null, labels: [], pinned: false, archived: false };
const isEmpty = (d: Draft) => !d.title.trim() && !d.body.trim() && !d.items.some((i) => i.text.trim());

function matches(n: Note, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [n.title, n.body, ...n.items.map((i) => i.text), ...n.labels].some((x) => x.toLowerCase().includes(s));
}

export function NotesPage() {
  const [q, setQ] = useState('');
  const [label, setLabel] = useLocalState<string | null>('notes.label', null);
  const [archived, setArchived] = useState(false);
  const { data: saved = [], isLoading } = useNotes(archived);
  // 溜めているチェック（つながったら送る）を重ねて見せる
  const pending = useOutbox();
  const notes = withPendingChecks(saved, pending);
  const { data: labels = [] } = useNoteLabels();
  // 開いているノート（new＝新しく書く・kind で文章かチェックリストか）
  const [open, setOpen] = useState<{ note: Note | null; kind: Draft['kind'] } | null>(null);
  const offline = useOffline() !== null;
  const md = useMediaQuery('(min-width: 768px)');
  const lg = useMediaQuery('(min-width: 1024px)');
  const shown = notes.filter((n) => (label === null || n.labels.includes(label)) && matches(n, q));
  const pinned = shown.filter((n) => n.pinned);
  const others = shown.filter((n) => !n.pinned);
  const cols = lg ? 4 : md ? 3 : 2;

  const chip = (on: boolean) =>
    cx(
      'shrink-0 rounded-full border px-3 py-1 text-xs',
      on
        ? 'border-indigo-600 bg-indigo-600 text-white'
        : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300',
    );

  return (
    <div>
      <PageHeader title={archived ? 'アーカイブ' : 'ノート'}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="検索"
          className="w-32 rounded-md border border-zinc-300 bg-transparent px-2.5 py-1.5 text-sm sm:w-56 dark:border-zinc-700"
        />
      </PageHeader>

      <div className="scroll-thin flex gap-1.5 overflow-x-auto px-4 pb-3">
        <button type="button" className={chip(label === null && !archived)} onClick={() => (setLabel(null), setArchived(false))}>
          すべて
        </button>
        {labels.map((l) => (
          <button
            key={l.label}
            type="button"
            className={chip(label === l.label)}
            onClick={() => setLabel(label === l.label ? null : l.label)}
          >
            🏷 {l.label} <span className="opacity-60">{l.count}</span>
          </button>
        ))}
        <button type="button" className={chip(archived)} onClick={() => setArchived(!archived)}>
          🗄 アーカイブ
        </button>
      </div>

      {!archived && (
        <div className="mx-auto mb-5 max-w-xl px-4">
          <div className={cx('flex items-center rounded-xl border shadow-sm', PLAIN, offline && 'pointer-events-none opacity-50')}>
            <button
              type="button"
              disabled={offline}
              onClick={() => setOpen({ note: null, kind: 'text' })}
              className="flex-1 px-4 py-3 text-left text-sm text-zinc-400"
            >
              メモを入力…
            </button>
            <button
              type="button"
              disabled={offline}
              onClick={() => setOpen({ note: null, kind: 'list' })}
              className="px-4 py-3 text-lg text-zinc-500"
              aria-label="チェックリストを書く"
              title="チェックリスト"
            >
              ☑
            </button>
          </div>
        </div>
      )}

      {isLoading && <p className="px-4 text-sm text-zinc-400">読み込み中…</p>}
      {!isLoading && shown.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-zinc-400">
          {q || label ? '当てはまるノートは無い' : archived ? 'アーカイブしたノートは無い' : 'ノートはまだ無い。上の「メモを入力…」から書ける'}
        </p>
      )}
      {pinned.length > 0 && (
        <Section title="📌 固定" notes={pinned} cols={cols} onOpen={(n) => setOpen({ note: n, kind: n.kind })} />
      )}
      {others.length > 0 && (
        <Section
          title={pinned.length > 0 ? 'その他' : undefined}
          notes={others}
          cols={cols}
          onOpen={(n) => setOpen({ note: n, kind: n.kind })}
        />
      )}
      <p className="px-4 pt-4 text-center text-[11px] text-zinc-400">
        Claude もノートを読んで書き足せる（消す・書き換えるのは画面だけ）。⛔ パスワード・カード番号などは書かない。
      </p>

      {open && (
        <NoteEditor
          key={open.note?.id ?? 'new'}
          note={open.note}
          kind={open.kind}
          allLabels={labels.map((l) => l.label)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** カードを横に cols 列、左上から右へ並べる（Keep と同じ読み順） */
function Section({
  title,
  notes,
  cols,
  onOpen,
}: {
  title?: string;
  notes: Note[];
  cols: number;
  onOpen: (n: Note) => void;
}) {
  const columns = Array.from({ length: cols }, (_, i) => notes.filter((_, j) => j % cols === i));
  return (
    <section className="mb-5 px-4">
      {title && <h2 className="px-1 pb-2 text-[11px] font-semibold tracking-wide text-zinc-500">{title}</h2>}
      <div className="flex items-start gap-3">
        {columns.map((col, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col gap-3">
            {col.map((n) => (
              <NoteCard key={n.id} note={n} onOpen={() => onOpen(n)} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * カード: どこを押しても開く。チェックリストのチェックは見るだけで、付けるのは開いてから
 * （2026-10-15 本人要望: 開こうとしてチェックを付けてしまうことがある）
 */
function NoteCard({ note: n, onOpen }: { note: Note; onOpen: () => void }) {
  const open = n.items.map((x, i) => ({ ...x, i })).filter((x) => !x.done && x.text.trim());
  const done = n.items.filter((x) => x.done && x.text.trim()).length;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={cx(
        'cursor-pointer rounded-xl border p-3 transition hover:shadow-md',
        n.color ? BG[n.color] : PLAIN,
      )}
    >
      {n.title && <div className="mb-1 font-semibold leading-snug break-words">{n.title}</div>}
      {n.kind === 'text' ? (
        <div className="line-clamp-[12] text-sm leading-relaxed whitespace-pre-wrap break-words text-zinc-700 dark:text-zinc-300">
          {n.body}
        </div>
      ) : (
        <div className="space-y-0.5 text-sm">
          {open.slice(0, 8).map((x) => (
            <div key={x.i} className="flex items-start gap-2">
              <input type="checkbox" checked={false} readOnly tabIndex={-1} aria-hidden="true" className="pointer-events-none mt-1 shrink-0" />
              <span className="min-w-0 break-words">{x.text}</span>
            </div>
          ))}
          {open.length > 8 && <div className="pl-5 text-xs text-zinc-500">… ほか {open.length - 8} 件</div>}
          {done > 0 && <div className="pt-1 text-xs text-zinc-500">✓ チェック済み {done} 件</div>}
        </div>
      )}
      {n.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {n.labels.map((l) => (
            <span key={l} className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** チェックリストの項目の見た目。項目は折り返すので、チェックと × は1行目の高さに合わせる。
 * 文字の大きさは開いたノートの CSS 変数 --note-fs（設定の 小・中・大＝noteFont.ts） */
const ITEM = 'min-w-0 flex-1 bg-transparent py-1 text-[length:var(--note-fs)] leading-snug outline-none';
const CHECK = 'mt-[calc(var(--note-fs)*0.6875-5px)] size-[18px] shrink-0 accent-indigo-600';
const REMOVE = 'shrink-0 px-1.5 py-1 text-[length:var(--note-fs)] leading-snug text-zinc-400 opacity-60 group-hover:opacity-100';

/** 並べ替えで、指が上下の端からこの距離に入ったらノートを送る */
const EDGE = 48;

/** 並べ替えのつまみ（点が 2×3） */
function Grip() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" className="block">
      {[2, 7, 12].flatMap((y) => [2, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
    </svg>
  );
}

/** 欄の高さを中身に合わせる（折り返した行も数える）。測るために一度縮めるので、ずれたスクロールの位置を戻す */
function fitHeight(el: HTMLTextAreaElement) {
  const sc = el.closest<HTMLElement>('[data-note-scroll]');
  const top = sc?.scrollTop ?? 0;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
  if (sc) sc.scrollTop = top;
}

/** 画面の端で折り返して、中身の高さまで伸びる入力欄（ノートのタイトル・本文・チェックリストの項目） */
function GrowText({ ref, value, className, ...rest }: ComponentProps<'textarea'> & { value: string }) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    if (own.current) fitHeight(own.current);
  }, [value]);
  return (
    <textarea
      {...rest}
      ref={(el) => {
        own.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      value={value}
      className={cx('block resize-none overflow-hidden break-words', className)}
    />
  );
}

/**
 * 開いたノート: 書いたそばから保存する（0.6秒待って・新しいノートは中身が入ったら作る）。閉じるときは残りを保存して、空の項目を片付ける。
 * スマホは画面いっぱい、広い画面は真ん中に
 */
function NoteEditor({
  note,
  kind,
  allLabels,
  onClose,
}: {
  note: Note | null;
  kind: Draft['kind'];
  allLabels: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => (note ? { ...note } : { ...EMPTY, kind, items: kind === 'list' ? [{ text: '', done: false }] : [] }));
  const [panel, setPanel] = useState<'color' | 'label' | null>(null);
  const [showDone, setShowDone] = useState(true);
  const id = useRef<number | null>(note?.id ?? null);
  const latest = useRef(d);
  latest.current = d;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<number | undefined>(undefined);
  // 書き換えたか（開いて閉じただけなら保存しない＝「編集」の時刻を動かさない）
  const dirty = useRef(false);
  const itemRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  // 次に書く場所（項目の番号と、何文字目に置くか）
  const [focusAt, setFocusAt] = useState<{ i: number; at: number | 'end' } | null>(kind === 'list' && !note ? { i: 0, at: 'end' } : null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const keyboard = useKeyboardViewport();
  const [font] = useNoteFont();
  const fs = noteFontPx(font);
  // つながっていないときは読むだけ（端末に残しておいた中身を見せている・design 7-9）。チェックだけは溜めておける
  const ro = useOffline() !== null;
  const checkOffline = (i: number, done: boolean) => {
    if (id.current === null) return;
    enqueue({ kind: 'noteCheck', noteId: id.current, index: i, text: d.items[i]!.text, done });
    setD((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, done } : it)) }));
  };

  // タイトル・本文・項目は画面の端で折り返して中身の高さまで伸びる（GrowText）。スクロールは開いたノート全体の1つだけ。
  // 幅が変わる（画面を回す・キーボードが出る）と折り返しが変わるので、ぜんぶ測り直す
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const ro = new ResizeObserver(() => sc.querySelectorAll('textarea').forEach(fitHeight));
    ro.observe(sc);
    return () => ro.disconnect();
  }, []);

  /** 今の中身を保存する（順番に・新しいノートは中身が入ってから作る） */
  const save = (draft: Draft) => {
    queue.current = queue.current
      .then(async () => {
        if (id.current === null) {
          if (isEmpty(draft)) return;
          id.current = (await api.createNote(draft)).id;
        } else {
          await api.updateNote(id.current, draft);
        }
      })
      .catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error'))
      .finally(() => qc.invalidateQueries({ queryKey: ['notes'] }));
    return queue.current;
  };

  useEffect(() => {
    if (!dirty.current) return;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(latest.current), 600);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  useEffect(() => {
    if (focusAt === null) return;
    const el = itemRefs.current[focusAt.i];
    if (el) {
      el.focus();
      const p = focusAt.at === 'end' ? el.value.length : focusAt.at;
      el.setSelectionRange(p, p);
    }
    setFocusAt(null);
  }, [focusAt]);

  const close = () => {
    clearTimeout(timer.current);
    // 空の項目は片付けてから保存
    const cleaned = { ...latest.current, items: latest.current.items.filter((i) => i.text.trim()) };
    if (!ro && (dirty.current || cleaned.items.length !== latest.current.items.length)) void save(cleaned);
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const set = (p: Partial<Draft>) => {
    if (ro) return;
    dirty.current = true;
    setD((x) => ({ ...x, ...p }));
  };
  const setItem = (i: number, p: Partial<NoteItem>) => set({ items: d.items.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const insertAfter = (i: number) => {
    const items = [...d.items];
    items.splice(i + 1, 0, { text: '', done: false });
    set({ items });
    setFocusAt({ i: i + 1, at: 0 });
  };
  /** 項目の文字を変える。改行が入ったら（貼り付け・スマホのキーボードの改行）そこで項目を分けて、書いていた場所へ */
  const changeItem = (i: number, text: string, caret: number) => {
    if (!text.includes('\n')) return setItem(i, { text });
    const lines = text.split('\n');
    const items = [...d.items];
    items.splice(i, 1, ...lines.map((t) => ({ text: t, done: items[i]!.done })));
    set({ items });
    // 書いていた場所＝改行の数で何番目の項目か、その中の何文字目か
    const before = text.slice(0, caret).split('\n');
    setFocusAt({ i: i + before.length - 1, at: before[before.length - 1]!.length });
  };
  /** Enter: 書いている場所で項目を分ける（後ろの文字は次の項目へ・末尾なら空の項目を足す） */
  const splitItem = (i: number, el: HTMLTextAreaElement) => {
    const items = [...d.items];
    const cur = items[i]!;
    items.splice(i, 1, { ...cur, text: el.value.slice(0, el.selectionStart) }, { text: el.value.slice(el.selectionEnd), done: cur.done });
    set({ items });
    setFocusAt({ i: i + 1, at: 0 });
  };
  // 項目の並べ替え: 左のつまみを押したまま上下へ（指でもマウスでも）。指が下の行の真ん中を越えたら入れ替える。
  // 上下の端に寄せている間はノートを送る
  const [dragging, setDragging] = useState<number | null>(null);
  const drag = useRef<{ i: number; y: number; wait: boolean; raf: number } | null>(null);
  const moveItem = (from: number, to: number) => {
    dirty.current = true;
    setD((x) => {
      const items = [...x.items];
      const [it] = items.splice(from, 1);
      items.splice(to, 0, it!);
      return { ...x, items };
    });
  };
  const dragTo = (y: number) => {
    const g = drag.current;
    const sc = scrollRef.current;
    if (!g || g.wait || !sc) return;
    for (const row of sc.querySelectorAll<HTMLElement>('[data-open-item]')) {
      const r = row.getBoundingClientRect();
      if (y < r.top || y >= r.bottom) continue;
      const to = Number(row.dataset.openItem);
      const mid = (r.top + r.bottom) / 2;
      if ((to > g.i && y > mid) || (to < g.i && y < mid)) {
        moveItem(g.i, to);
        g.i = to;
        // 入れ替えた行が描き直されるまで次を待つ
        g.wait = true;
        setDragging(to);
      }
      return;
    }
  };
  useLayoutEffect(() => {
    if (drag.current) drag.current.wait = false;
  }, [d.items]);
  const startDrag = (i: number) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || ro) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 指がもう離れていたら何もしない
    }
    const g = { i, y: e.clientY, wait: false, raf: 0 };
    drag.current = g;
    setDragging(i);
    const tick = () => {
      const sc = scrollRef.current;
      if (drag.current !== g || !sc) return;
      const r = sc.getBoundingClientRect();
      const v = g.y < r.top + EDGE ? -(r.top + EDGE - g.y) / 3 : g.y > r.bottom - EDGE ? (g.y - r.bottom + EDGE) / 3 : 0;
      if (v) {
        sc.scrollTop += v;
        dragTo(g.y);
      }
      g.raf = requestAnimationFrame(tick);
    };
    g.raf = requestAnimationFrame(tick);
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current.y = e.clientY;
    dragTo(e.clientY);
  };
  const endDrag = () => {
    if (drag.current) cancelAnimationFrame(drag.current.raf);
    drag.current = null;
    setDragging(null);
  };
  // 指で並べ替えている間はノートをスクロールさせない（touchmove を止めるには passive: false が要る）
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const stop = (e: TouchEvent) => {
      if (drag.current) e.preventDefault();
    };
    sc.addEventListener('touchmove', stop, { passive: false });
    return () => sc.removeEventListener('touchmove', stop);
  }, []);

  /** 先頭で Backspace: 上の項目（同じ側＝未チェックどうし・チェック済みどうし）につなげる。Enter で分けたのを戻せる */
  const joinUp = (i: number): boolean => {
    const cur = d.items[i]!;
    const prev = d.items.findLastIndex((x, j) => j < i && x.done === cur.done);
    if (prev < 0) return false;
    const at = d.items[prev]!.text.length;
    set({ items: d.items.flatMap((x, j) => (j === i ? [] : j === prev ? [{ ...x, text: x.text + cur.text }] : [x])) });
    setFocusAt({ i: prev, at });
    return true;
  };
  const itemKeys = (i: number, text: string) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      splitItem(i, e.currentTarget);
    } else if (e.key === 'Backspace' && text === '' && d.items.length > 1) {
      e.preventDefault();
      removeItem(i);
    } else if (e.key === 'Backspace' && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
      if (joinUp(i)) e.preventDefault();
    }
  };
  const removeItem = (i: number) => {
    set({ items: d.items.filter((_, j) => j !== i) });
    // 消したら1つ上の未チェックの項目の末尾へ
    const prev = d.items.findLastIndex((x, j) => j < i && !x.done);
    if (prev >= 0) setFocusAt({ i: prev, at: 'end' });
  };
  /** 文章 ⇔ チェックリスト（行ごとに項目にする・項目を行に戻す） */
  const convert = () =>
    d.kind === 'text'
      ? set({
          kind: 'list',
          items: d.body.split('\n').filter((l) => l.trim()).map((text) => ({ text, done: false })),
          body: '',
        })
      : set({ kind: 'text', body: d.items.filter((x) => x.text.trim()).map((x) => x.text).join('\n'), items: [] });
  const remove = () => {
    if (id.current === null) return onClose();
    if (!confirm('このノートを削除する？（元に戻せない）')) return;
    clearTimeout(timer.current);
    const nid = id.current;
    void queue.current
      .then(() => api.deleteNote(nid))
      .then(() => toast('ノートを削除した'))
      .catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error'))
      .finally(() => qc.invalidateQueries({ queryKey: ['notes'] }));
    onClose();
  };
  const archive = () => {
    toast(d.archived ? 'ノートを戻した' : 'アーカイブした（上の「アーカイブ」で見返せる）');
    // 保存してから閉じる
    latest.current = { ...latest.current, archived: !d.archived };
    dirty.current = true;
    close();
  };

  const openItems = d.items.map((x, i) => ({ ...x, i })).filter((x) => !x.done);
  const doneItems = d.items.map((x, i) => ({ ...x, i })).filter((x) => x.done);
  const labelChoices = [...new Set([...allLabels, ...d.labels])].sort();
  /** 何も無いところを押したら、続きを書けるようにする（文章は末尾へ・チェックリストは最後の項目へ） */
  const writeOn = () => {
    if (ro) return;
    if (d.kind === 'text') {
      const el = bodyRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    } else if (openItems.length > 0) {
      setFocusAt({ i: openItems[openItems.length - 1]!.i, at: 'end' });
    } else {
      insertAfter(d.items.length - 1);
    }
  };
  const icon =
    'flex size-11 shrink-0 items-center justify-center rounded-full text-[19px] text-zinc-600 hover:bg-black/5 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-white/10';
  const edited = note ? `編集 ${note.updatedAt.slice(5, 16).replace('T', ' ').replace('-', '/')}` : '';

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-center md:items-start md:bg-black/40 md:px-4 md:pt-[7vh]"
      // スマホでキーボードが出たら、隠れていない範囲に収める（下の道具と書いている行がキーボードの裏に入らない）
      style={keyboard ? { top: keyboard.top, height: keyboard.height, bottom: 'auto' } : undefined}
      onClick={close}
    >
      {/* スマホは1枚の紙（枠を付けず、色はノートの色）・広い画面は真ん中の大きめのカード。
          ダークの色は半透明なので、不透明な地の上に重ねる（下の一覧が透けてタイトルが読めなくなる） */}
      <div
        className="flex h-full w-full flex-col overflow-hidden bg-white md:h-auto md:max-h-[86vh] md:max-w-2xl md:rounded-2xl md:shadow-2xl dark:bg-zinc-900"
        style={{ '--note-fs': `${fs.body}px`, '--note-title': `${fs.title}px` } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
      <div
        className={cx(
          'flex min-h-0 flex-1 flex-col md:rounded-2xl md:border',
          d.color ? BG[d.color] : 'md:border-zinc-200 dark:md:border-zinc-800',
        )}
      >
        {/* 上: 戻る（スマホ）・固定・アーカイブ */}
        <div className="flex shrink-0 items-center gap-1 px-1.5 pt-1.5 md:px-3 md:pt-3">
          <button type="button" onClick={close} className={cx(icon, 'md:hidden')} aria-label="戻る" title="戻る">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M11 5l-7 7 7 7" />
            </svg>
          </button>
          <span className="ml-auto" />
          <button
            type="button"
            disabled={ro}
            onClick={() => set({ pinned: !d.pinned })}
            className={cx(icon, !d.pinned && 'grayscale')}
            aria-label={d.pinned ? '固定を外す' : '固定する'}
            title={d.pinned ? '固定を外す' : '固定する'}
          >
            <span className={d.pinned ? '' : 'opacity-35'}>📌</span>
          </button>
          {id.current !== null && (
            <button
              type="button"
              disabled={ro}
              onClick={archive}
              className={icon}
              aria-label={d.archived ? 'アーカイブから戻す' : 'アーカイブ'}
              title={d.archived ? 'アーカイブから戻す' : 'アーカイブ'}
            >
              <span className="text-[17px]">{d.archived ? '↩︎' : '🗄'}</span>
            </button>
          )}
        </div>

        {/* 書くところ。何も無いところを押すと、続きから書ける */}
        <div
          ref={scrollRef}
          data-note-scroll
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-4 md:px-7"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-write-on]') || e.target === e.currentTarget) writeOn();
          }}
        >
          <GrowText
            rows={1}
            value={d.title}
            // タイトルは1行のもの（端で折り返すだけ）。Enter で本文・最初の項目へ
            readOnly={ro}
            onChange={(e) => set({ title: e.target.value.replace(/\n/g, ' ') })}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (d.kind === 'text') bodyRef.current?.focus();
              else if (openItems.length > 0) setFocusAt({ i: openItems[0]!.i, at: 'end' });
              else insertAfter(d.items.length - 1);
            }}
            placeholder="タイトル"
            className="w-full bg-transparent py-1 text-[length:var(--note-title)] leading-snug font-semibold outline-none placeholder:text-zinc-400/80"
          />

          {d.kind === 'text' ? (
            <GrowText
              ref={bodyRef}
              autoFocus={!note}
              readOnly={ro}
              value={d.body}
              onChange={(e) => set({ body: e.target.value })}
              placeholder="メモ"
              rows={3}
              className="mt-1 w-full bg-transparent text-[length:var(--note-fs)] leading-relaxed outline-none placeholder:text-zinc-400/80"
            />
          ) : (
            <div className="mt-1 space-y-0.5">
              {openItems.map((x) => (
                <div
                  key={x.i}
                  data-open-item={x.i}
                  className={cx(
                    'group flex items-start gap-2.5 rounded-md',
                    !ro && '-ml-2 pl-0.5',
                    dragging === x.i && 'bg-white shadow-md ring-1 ring-black/10 dark:bg-zinc-800 dark:ring-white/15',
                  )}
                >
                  {!ro && (
                    <span
                      onPointerDown={startDrag(x.i)}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      className="-mr-1 shrink-0 cursor-grab touch-none px-0.5 pt-[calc(var(--note-fs)*0.6875-3px)] pb-1 text-zinc-400 active:cursor-grabbing"
                      title="押したまま上下で並べ替え"
                      aria-hidden="true"
                    >
                      <Grip />
                    </span>
                  )}
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => (ro ? checkOffline(x.i, true) : setItem(x.i, { done: true }))}
                    className={CHECK}
                  />
                  <GrowText
                    rows={1}
                    ref={(el) => {
                      itemRefs.current[x.i] = el;
                    }}
                    readOnly={ro}
                    value={x.text}
                    onChange={(e) => changeItem(x.i, e.target.value, e.target.selectionStart)}
                    onKeyDown={itemKeys(x.i, x.text)}
                    placeholder="項目"
                    className={cx(ITEM, 'placeholder:text-zinc-400/80')}
                  />
                  {!ro && (
                    <button type="button" onClick={() => removeItem(x.i)} className={REMOVE} aria-label="項目を消す">
                      ×
                    </button>
                  )}
                </div>
              ))}
              {!ro && (
                <button
                  type="button"
                  onClick={() => insertAfter(d.items.length - 1)}
                  className="flex items-center gap-2.5 py-1.5 text-[15px] text-zinc-500"
                >
                  <span className="w-[18px] text-center text-lg leading-none">＋</span>項目を追加
                </button>
              )}
              {doneItems.length > 0 && (
                <div className="mt-2 border-t border-black/10 pt-2 dark:border-white/10">
                  <button type="button" onClick={() => setShowDone(!showDone)} className="py-1 text-sm text-zinc-500">
                    {showDone ? '▾' : '▸'} チェック済み {doneItems.length} 件
                  </button>
                  {showDone &&
                    doneItems.map((x) => (
                      <div key={x.i} className="group flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked
                          onChange={() => (ro ? checkOffline(x.i, false) : setItem(x.i, { done: false }))}
                          className={CHECK}
                        />
                        <GrowText
                          rows={1}
                          ref={(el) => {
                            itemRefs.current[x.i] = el;
                          }}
                          readOnly={ro}
                          value={x.text}
                          onChange={(e) => changeItem(x.i, e.target.value, e.target.selectionStart)}
                          onKeyDown={itemKeys(x.i, x.text)}
                          className={cx(ITEM, 'text-zinc-500 line-through')}
                        />
                        {!ro && (
                          <button type="button" onClick={() => removeItem(x.i)} className={REMOVE} aria-label="項目を消す">
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {d.labels.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {d.labels.map((l) => (
                <span key={l} className="flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-0.5 text-xs text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                  {l}
                  {!ro && (
                    <button type="button" onClick={() => set({ labels: d.labels.filter((x) => x !== l) })} aria-label={`${l} を外す`}>
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {/* 下の余白も「書くところ」（押すと続きから書ける） */}
          <div data-write-on className="min-h-24 flex-1 md:min-h-16" />
        </div>

        {panel === 'color' && (
          <div className="flex flex-wrap gap-2 border-t border-black/5 px-5 py-3 dark:border-white/10">
            <button
              type="button"
              onClick={() => set({ color: null })}
              className={cx('size-9 rounded-full border-2 bg-white text-xs text-zinc-400 dark:bg-zinc-900', d.color === null ? 'border-indigo-500' : 'border-zinc-300 dark:border-zinc-600')}
              aria-label="色なし"
              title="色なし"
            >
              ⊘
            </button>
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set({ color: c })}
                className={cx('size-9 rounded-full border-2', d.color === c ? 'border-indigo-500' : 'border-transparent')}
                style={{ background: SWATCH[c] }}
                aria-label={COLOR_LABEL[c]}
                title={COLOR_LABEL[c]}
              />
            ))}
          </div>
        )}
        {panel === 'label' && <LabelPicker choices={labelChoices} selected={d.labels} onChange={(labels) => set({ labels })} />}

        {/* 下: チェックリスト⇔文章・色・ラベル／編集した時刻／削除（広い画面は「閉じる」も） */}
        <div className="pb-safe flex shrink-0 items-center gap-0.5 px-1.5 pt-1 md:px-3 md:pb-3">
          {ro ? (
            <span className="px-3 py-3 text-xs text-amber-700 dark:text-amber-300">📴 つながっていない: チェックだけできる（つながったら送る）</span>
          ) : (
            <>
              <button
                type="button"
                className={icon}
                onClick={convert}
                aria-label={d.kind === 'text' ? 'チェックリストにする' : '文章にする'}
                title={d.kind === 'text' ? 'チェックリストにする' : '文章にする'}
              >
                {d.kind === 'text' ? '☑' : '¶'}
              </button>
              <button type="button" className={cx(icon, panel === 'color' && 'bg-black/5 dark:bg-white/10')} onClick={() => setPanel(panel === 'color' ? null : 'color')} aria-label="色" title="色">
                🎨
              </button>
              <button type="button" className={cx(icon, panel === 'label' && 'bg-black/5 dark:bg-white/10')} onClick={() => setPanel(panel === 'label' ? null : 'label')} aria-label="ラベル" title="ラベル">
                🏷
              </button>
            </>
          )}
          <span className="min-w-0 flex-1 truncate px-1 text-center text-[11px] text-zinc-400">{edited}</span>
          {!ro && id.current !== null && (
            <button type="button" className={icon} onClick={remove} aria-label="削除" title="削除">
              <span className="text-[17px]">🗑</span>
            </button>
          )}
          <button type="button" onClick={close} className="hidden rounded-lg px-4 py-2 text-sm font-medium hover:bg-black/5 md:block dark:hover:bg-white/10">
            閉じる
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

/** ラベルを付け外しする（新しいラベルもここで作る） */
function LabelPicker({ choices, selected, onChange }: { choices: string[]; selected: string[]; onChange: (labels: string[]) => void }) {
  const [name, setName] = useState('');
  const add = () => {
    const l = name.trim().slice(0, 30);
    if (l && !selected.includes(l)) onChange([...selected, l]);
    setName('');
  };
  return (
    <div className="border-t border-black/10 px-4 py-3 dark:border-white/10">
      <div className="flex flex-wrap gap-1.5">
        {choices.map((l) => {
          const on = selected.includes(l);
          return (
            <button
              key={l}
              type="button"
              onClick={() => onChange(on ? selected.filter((x) => x !== l) : [...selected, l])}
              className={cx(
                'rounded-full border px-2.5 py-0.5 text-xs',
                on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-zinc-300 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300',
              )}
            >
              {on ? '✓ ' : ''}
              {l}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
          placeholder="新しいラベル"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-600"
        />
        <button type="button" onClick={add} className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs dark:border-zinc-600">
          付ける
        </button>
      </div>
    </div>
  );
}
