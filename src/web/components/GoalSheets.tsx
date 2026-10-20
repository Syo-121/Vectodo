// 目標のシート（design 7-15）: 記録する（量・日付・一言・その日の記録・記録したらどうなるか）と、目標を作る・書き換える。
// スマホは下から、広い画面は上寄りの真ん中に出す（即追加と同じ形）。

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { defaultStart, fmtAmount, goalRuleText, logFrom, round } from '../../shared/goals.ts';
import type { GoalCreateInput } from '../../shared/schemas.ts';
import type { Goal, GoalPeriod } from '../../shared/types.ts';
import { api, useGoal, useGoalWrite } from '../api.ts';
import { amountChips, previewLog, spanText } from '../goalView.ts';
import { toast } from '../toast.ts';
import { addDays, clientToday, cx, fmtDate, fmtMonthDay } from '../util.ts';
import { useLogGoal } from './GoalParts.tsx';
import { chip } from './SheetParts.tsx';

const INPUT =
  'rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-indigo-500 md:text-sm dark:border-zinc-700';
const LABEL = 'text-xs font-medium text-zinc-500';

/** シートの枠。背景を押す・Esc・× で閉じる */
export function SheetFrame({
  title,
  sub,
  onClose,
  children,
}: {
  title: string;
  sub?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 md:items-start md:pt-[10vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="pb-safe scroll-hidden max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-xl md:max-h-[80vh] md:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">{title}</h2>
            {sub && <div className="text-xs text-zinc-500">{sub}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる" className="-mr-1 rounded-full px-2 text-xl leading-8 text-zinc-400">
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * 記録するシート。量は大きい数字と［−］［＋］（押して打ち込んでもよい）・量のチップ、日付は今日・昨日・おととい・選ぶ、一言。
 * 選んだ日にもう記録があれば並べて、ここから消せる。押す前に「記録したらどうなるか」を見せる
 */
export function LogSheet({ g, date: initial, onClose }: { g: Goal; date?: string; onClose: () => void }) {
  const today = clientToday();
  const { data: d } = useGoal(g.id);
  const logs = d?.logs ?? [];
  const from = logFrom(g);
  const [date, setDate] = useState(initial ?? today);
  const [value, setValue] = useState(g.unit === '回' ? '1' : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const log = useLogGoal();
  const removeLog = useGoalWrite((id: number) => api.deleteGoalLog(g.id, id));

  const amount = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(amount) && amount > 0;
  const loggable = date >= from && date <= today;
  const dayLogs = logs.filter((l) => l.date === date);
  const preview = d && valid && loggable ? previewLog(g, logs, today, { date, amount }) : null;
  const chips = d ? amountChips(g, logs, date) : [];
  const step = (n: number) => setValue(String(Math.max(round((Number(value) || 0) + n), 0)));
  const submit = async () => {
    if (!valid || !loggable || busy) return;
    setBusy(true);
    const ok = await log(g, { amount, date, note: note.trim() || undefined });
    setBusy(false);
    if (ok) onClose();
  };
  const quickDates: [string, string][] = [
    [today, '今日'],
    [addDays(today, -1), '昨日'],
    [addDays(today, -2), 'おととい'],
  ];
  const picked = !quickDates.some(([x]) => x === date);

  return (
    <SheetFrame title={g.title} sub={d ? spanText(g, logs, date, today) : goalRuleText(g)} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {/* 量 */}
        <div className="flex items-center justify-center gap-5 py-2">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={!(amount > 1)}
            aria-label="1 減らす"
            className="size-12 shrink-0 rounded-full border border-zinc-300 text-2xl text-zinc-600 active:scale-95 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300"
          >
            −
          </button>
          <label className="flex min-w-0 items-baseline gap-1.5">
            <input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
              onFocus={(e) => e.target.select()}
              placeholder="0"
              aria-label={`量（${g.unit}）`}
              // 数字の幅に合わせて広げる（単位が数字のすぐ右に来るように）
              style={{ width: `${Math.max(value.length, 1) + 0.4}ch` }}
              className="min-w-[1.4ch] bg-transparent text-center text-5xl font-bold tabular-nums outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
            />
            <span className="text-lg text-zinc-500">{g.unit}</span>
          </label>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="1 増やす"
            className="size-12 shrink-0 rounded-full border border-zinc-300 text-2xl text-zinc-600 active:scale-95 dark:border-zinc-700 dark:text-zinc-300"
          >
            ＋
          </button>
        </div>
        {chips.length > 0 && (
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            {chips.map((c) => (
              <button key={c.label} type="button" className={chip(amount === c.value)} onClick={() => setValue(String(round(c.value)))}>
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* 日付 */}
        <div className="mt-5">
          <div className={LABEL}>日付</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {quickDates.map(([x, label]) => (
              <button key={x} type="button" disabled={x < from} className={cx(chip(date === x), 'disabled:opacity-30')} onClick={() => setDate(x)}>
                {label}
              </button>
            ))}
            {/* 日付を選ぶ: 透明な日付の欄をチップに重ねる（iPhone は欄そのものを押さないと開かないため） */}
            <span className={cx(chip(picked), 'relative')}>
              📅 {picked ? fmtMonthDay(date, today) : '日付を選ぶ'}
              <input
                type="date"
                value={date}
                min={from}
                max={today}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                aria-label="日付を選ぶ"
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </span>
          </div>
          {!loggable && <p className="mt-1.5 text-xs text-amber-600">{date < from ? `${fmtDate(from, today)} より前は数えていない` : '先の日付には記録できない'}</p>}
        </div>

        {/* 一言 */}
        <label className="mt-4 block">
          <span className={LABEL}>一言（任意）</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 90分・3章まで" maxLength={500} className={cx(INPUT, 'mt-1.5 w-full')} />
        </label>

        {/* その日の記録 */}
        {dayLogs.length > 0 && (
          <div className="mt-5">
            <div className={LABEL}>{fmtDate(date, today)}の記録（{dayLogs.length}件）</div>
            <ul className="mt-1.5 divide-y divide-zinc-200/70 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {dayLogs.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-semibold tabular-nums">{fmtAmount(l.amount, g.unit)}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-500">{l.note}</span>
                  <button
                    type="button"
                    disabled={removeLog.isPending}
                    onClick={() => {
                      if (confirm(`${fmtDate(date, today)}の ${fmtAmount(l.amount, g.unit)} を消す？`)) {
                        removeLog.mutate(l.id, { onSuccess: () => toast('記録を消した') });
                      }
                    }}
                    className="rounded-md px-2 py-0.5 text-xs text-red-600 dark:text-red-400"
                  >
                    消す
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 記録したらどうなるか */}
        <div className="mt-5 min-h-5 text-center text-sm">
          {preview && (
            <span className={cx('font-medium', preview.achieved ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500')}>
              {preview.justAchieved ? '🎉 ' : '→ '}
              {preview.text}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={!valid || !loggable || busy}
          className="mt-3 w-full rounded-xl bg-indigo-600 py-3 text-base font-semibold text-white active:scale-[0.99] disabled:opacity-40"
        >
          {busy ? '記録しています…' : valid ? `${fmtAmount(amount, g.unit)} を記録する` : '量を入れる'}
        </button>
      </form>
    </SheetFrame>
  );
}

const PERIODS: [GoalPeriod, string][] = [
  ['day', '1日'],
  ['week', '1週'],
  ['month', '1か月'],
];
const UNITS = ['回', 'ページ', '分', '時間', '語', 'km'];

/** 目標を作る・書き換える */
export function GoalFormSheet({ goal, onClose, onCreated }: { goal?: Goal; onClose: () => void; onCreated?: (id: number) => void }) {
  const today = clientToday();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [kind, setKind] = useState<'rate' | 'total'>(goal?.kind ?? 'rate');
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? 'week');
  const [target, setTarget] = useState(goal ? String(goal.target) : '');
  const [unit, setUnit] = useState(goal?.unit ?? '回');
  const [start, setStart] = useState<string | null>(goal?.startDate ?? null);
  const [end, setEnd] = useState(goal?.endDate ?? '');
  const [notes, setNotes] = useState(goal?.notes ?? '');
  const [more, setMore] = useState(!!goal);
  const save = useGoalWrite((input: GoalCreateInput) =>
    goal ? api.updateGoal(goal.id, { ...input, period: input.period ?? null, endDate: input.endDate ?? null }) : api.createGoal(input),
  );
  // 数え始める日は、触っていなければ形に合わせた既定（今週の月曜・今月1日・今日）
  const startDate = start ?? defaultStart(kind, kind === 'rate' ? period : null, today);
  const n = Number(target);
  const okTarget = Number.isFinite(n) && n > 0;
  const okEnd = kind === 'rate' ? !end || end >= startDate : end !== '' && end >= startDate;
  const ok = title.trim() !== '' && okTarget && okEnd;
  const rule = { kind, period: kind === 'rate' ? period : null, target: n, unit: unit.trim(), startDate, endDate: end || null };

  const submit = () => {
    if (!ok || save.isPending) return;
    save.mutate(
      {
        title: title.trim(),
        kind,
        period: kind === 'rate' ? period : undefined,
        target: n,
        unit: unit.trim(),
        startDate,
        endDate: end || undefined,
        notes,
      },
      {
        onSuccess: (d) => {
          toast(goal ? '書き換えた' : `目標「${d.title}」を作った`);
          onClose();
          if (!goal) onCreated?.(d.id);
        },
      },
    );
  };

  return (
    <SheetFrame title={goal ? '目標を書き換える' : '新しい目標'} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block">
          <span className={LABEL}>名前</span>
          <input
            autoFocus={!goal}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: プール・回路の本を読む"
            maxLength={200}
            className={cx(INPUT, 'mt-1.5 w-full')}
          />
        </label>

        <div>
          <span className={LABEL}>形</span>
          <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
            {(
              [
                ['rate', '期間ごと', '週に2回・1日に10ページ'],
                ['total', '期限まで', '12/31 までに 300ページ'],
              ] as const
            ).map(([k, label, ex]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cx(
                  'rounded-lg px-2 py-1.5 text-center',
                  kind === k ? 'bg-white shadow-sm dark:bg-zinc-900' : 'text-zinc-500',
                )}
              >
                <div className="text-sm font-medium">{label}</div>
                <div className="text-[11px] text-zinc-400">{ex}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={LABEL}>{kind === 'rate' ? 'どのくらいの間に・どれだけ' : 'いつまでに・どれだけ'}</span>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {kind === 'rate' ? (
              PERIODS.map(([p, label]) => (
                <button key={p} type="button" className={chip(period === p)} onClick={() => setPeriod(p)}>
                  {label}
                </button>
              ))
            ) : (
              <input type="date" value={end} min={startDate} onChange={(e) => setEnd(e.target.value)} className={INPUT} aria-label="期限" />
            )}
            <span className="text-sm text-zinc-500">{kind === 'rate' ? 'に' : 'までに'}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="量"
              aria-label="目標の量"
              className={cx(INPUT, 'w-24 text-center text-lg font-semibold')}
            />
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="単位" maxLength={20} aria-label="単位" className={cx(INPUT, 'w-24')} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {UNITS.map((u) => (
              <button key={u} type="button" className={cx(chip(unit === u), 'px-2.5 py-0.5 text-xs')} onClick={() => setUnit(u)}>
                {u}
              </button>
            ))}
          </div>
        </div>

        {more ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <label className="block">
                <span className={LABEL}>数え始める日</span>
                <input type="date" value={startDate} onChange={(e) => e.target.value && setStart(e.target.value)} className={cx(INPUT, 'mt-1.5 block')} />
              </label>
              {kind === 'rate' && (
                <label className="block">
                  <span className={LABEL}>終わる日（任意）</span>
                  <input type="date" value={end} min={startDate} onChange={(e) => setEnd(e.target.value)} className={cx(INPUT, 'mt-1.5 block')} />
                </label>
              )}
            </div>
            <label className="block">
              <span className={LABEL}>メモ（任意）</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="本の名前・ルールなど" className={cx(INPUT, 'mt-1.5 w-full')} />
            </label>
          </div>
        ) : (
          <button type="button" onClick={() => setMore(true)} className="text-sm text-indigo-600 dark:text-indigo-400">
            ＋ 数え始める日・終わる日・メモ
          </button>
        )}

        <div className="rounded-xl bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-800/60">
          {title.trim() || '（名前）'}：
          <span className="font-semibold">{okTarget && (kind === 'rate' || end) ? goalRuleText(rule) : '…'}</span>
          <span className="text-zinc-500">（{fmtMonthDay(startDate, today)} から）</span>
          {!okEnd && <p className="mt-1 text-xs text-amber-600">{kind === 'total' && !end ? '期限を入れる' : '期限（終わる日）が数え始める日より前'}</p>}
        </div>

        <button
          type="submit"
          disabled={!ok || save.isPending}
          className="w-full rounded-xl bg-indigo-600 py-3 text-base font-semibold text-white disabled:opacity-40"
        >
          {goal ? '保存する' : '作る'}
        </button>
      </form>
    </SheetFrame>
  );
}
