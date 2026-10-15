// 日付をカレンダーから選ぶ（締切・やる日・計画待ちなど）。週は月曜始まり。
// 画面からはみ出さないように出す: スマホ（幅 640px 未満）は画面の真ん中に重ねて（背景を暗く・外を押すと閉じる）、
// それより広い画面は押したところの下（入らなければ上）に、左右も画面の中に収めて出す。
// どちらも body へポータルで出す（スクロールする欄や下から出るシートの中でも切れない）。

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { addDays, daysInMonth, isoWeekday } from '../../shared/dates.ts';
import { useMediaQuery } from '../media.ts';
import { clientToday, cx, fmtDate, fmtDateLong } from '../util.ts';

/** 画面の端から空ける幅（px） */
const EDGE = 8;

const WEEK_HEAD = ['月', '火', '水', '木', '金', '土', '日'];

interface Props {
  value: string | null;
  onChange: (date: string | null) => void;
  /** 「消す」を出す（締切など、空にできる項目） */
  clearable?: boolean;
  /** 押すとカレンダーが開くもの。省略すると日付を表示するボタン */
  trigger?: (label: string) => ReactNode;
  placeholder?: string;
  /** カレンダーに小さい点を付ける日（例: ほかのやる日） */
  marks?: string[];
  /** ポップアップを右端に揃える（画面の右寄りに置くとき） */
  alignRight?: boolean;
}

export function DatePicker({ value, onChange, clearable, trigger, placeholder = '日付を選ぶ', marks = [], alignRight }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const narrow = useMediaQuery('(max-width: 639px)');
  const today = clientToday();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !layer.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // 広い画面: 押したところの下（入らなければ上）に、左右も画面の中に収める。スクロール・画面の大きさ・月の切り替えで高さが変わったら置き直す
  useLayoutEffect(() => {
    if (!open || narrow) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = box.current?.getBoundingClientRect();
      const p = pop.current;
      if (!r || !p) return;
      const w = p.offsetWidth;
      const h = p.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let top = r.bottom + 4;
      if (top + h > vh - EDGE) top = r.top - 4 - h >= EDGE ? r.top - 4 - h : Math.max(EDGE, vh - EDGE - h);
      const left = Math.min(Math.max(EDGE, alignRight ? r.right - w : r.left), vw - EDGE - w);
      setPos({ top, left });
    };
    place();
    const ro = new ResizeObserver(place);
    if (pop.current) ro.observe(pop.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, narrow, alignRight]);

  const pick = (d: string | null) => {
    onChange(d);
    setOpen(false);
  };
  const calendar = (
    <Calendar
      value={value}
      today={today}
      marks={marks}
      onPick={pick}
      onClear={clearable && value ? () => pick(null) : undefined}
    />
  );
  // ポップアップの中の操作が、外側の行やカードの「押したら開く」に伝わらないようにする（ポータルでも React の上の要素には伝わるため）
  const stop = { onClick: (e: React.MouseEvent) => e.stopPropagation(), onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };
  const label = value ? fmtDate(value, today) : placeholder;

  return (
    <div ref={box} className="relative inline-block">
      <div
        onClick={() => {
          // スマホで入力欄にキーボードが出たままだと、真ん中に出すカレンダーが隠れるので閉じておく
          if (!open && narrow && document.activeElement instanceof HTMLElement) document.activeElement.blur();
          setOpen(!open);
        }}
      >
        {trigger ? (
          trigger(label)
        ) : (
          <button
            type="button"
            className={cx(
              'flex min-h-9 items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-1 text-sm dark:border-zinc-700',
              !value && 'text-zinc-400',
            )}
          >
            <span aria-hidden>📅</span>
            {value ? fmtDateLong(value, today) : label}
          </button>
        )}
      </div>
      {open &&
        createPortal(
          narrow ? (
            <div
              ref={layer}
              {...stop}
              onClick={(e) => {
                e.stopPropagation();
                // 背景を押したら閉じる（カレンダーの中は閉じない）
                if (e.target === e.currentTarget) setOpen(false);
              }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
            >
              {calendar}
            </div>
          ) : (
            <div
              ref={(el) => {
                layer.current = el;
                pop.current = el;
              }}
              {...stop}
              className="fixed z-[60]"
              // 置く位置が決まるまでは見せない（大きさを測るため一度だけ描く）
              style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
            >
              {calendar}
            </div>
          ),
          document.body,
        )}
    </div>
  );
}

function Calendar({
  value,
  today,
  marks,
  onPick,
  onClear,
}: {
  value: string | null;
  today: string;
  marks: string[];
  onPick: (d: string) => void;
  onClear?: () => void;
}) {
  const base = value ?? today;
  const [ym, setYm] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) });
  const first = `${ym.y}-${String(ym.m).padStart(2, '0')}-01`;
  const offset = isoWeekday(first) - 1;
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth(ym.y, ym.m) }, (_, i) => addDays(first, i)),
  ];
  while (cells.length % 7) cells.push(null);
  const move = (delta: number) => {
    const m0 = ym.m - 1 + delta;
    setYm({ y: ym.y + Math.floor(m0 / 12), m: (((m0 % 12) + 12) % 12) + 1 });
  };
  const nextMonday = addDays(today, 8 - isoWeekday(today));
  const markSet = new Set(marks);
  const quick = 'rounded-md px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950';

  return (
    <div className="w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center">
        <button type="button" onClick={() => move(-1)} className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="前の月">
          ◀
        </button>
        <div className="flex-1 text-center text-sm font-semibold">
          {ym.y}年{ym.m}月
        </div>
        <button type="button" onClick={() => move(1)} className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="次の月">
          ▶
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-zinc-400">
        {WEEK_HEAD.map((w, i) => (
          <div key={w} className={cx('pb-1', i === 5 && 'text-sky-500', i === 6 && 'text-red-500')}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center text-sm">
        {cells.map((d, i) =>
          d === null ? (
            <div key={`x${i}`} />
          ) : (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              className={cx(
                'relative mx-auto flex size-9 items-center justify-center rounded-full transition',
                d === value
                  ? 'bg-indigo-600 font-semibold text-white'
                  : cx(
                      'hover:bg-zinc-100 dark:hover:bg-zinc-800',
                      d === today && 'ring-1 ring-indigo-500',
                      d < today && 'text-zinc-400 dark:text-zinc-600',
                      d >= today && i % 7 === 5 && 'text-sky-600 dark:text-sky-400',
                      d >= today && i % 7 === 6 && 'text-red-600 dark:text-red-400',
                    ),
              )}
            >
              {Number(d.slice(8))}
              {markSet.has(d) && d !== value && (
                <span className="absolute bottom-1 size-1 rounded-full bg-indigo-500" />
              )}
            </button>
          ),
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
        <button type="button" className={quick} onClick={() => onPick(today)}>
          今日
        </button>
        <button type="button" className={quick} onClick={() => onPick(addDays(today, 1))}>
          明日
        </button>
        <button type="button" className={quick} onClick={() => onPick(nextMonday)}>
          来週の月曜
        </button>
        {onClear && (
          <button type="button" className="ml-auto rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={onClear}>
            消す
          </button>
        )}
      </div>
    </div>
  );
}
