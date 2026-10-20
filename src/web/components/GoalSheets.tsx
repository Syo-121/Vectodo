// 目標のシート（design 7-15）: 記録する（量・日付・一言・その日の記録・記録したらどうなるか）と、目標を作る・書き換える。
// やる時間（design 4-14）: 予定から開いた記録のシート（時間を変える・外す）と、月・詳細から入れるシート。
// スマホは下から、広い画面は上寄りの真ん中に出す（即追加と同じ形）。

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtClock, PLACE_DEFAULT_MIN, toMin } from '../../shared/flow.ts';
import { defaultStart, fmtAmount, goalRuleText, logFrom, round } from '../../shared/goals.ts';
import type { GoalCreateInput, GoalPlanCreateInput, GoalPlanPatchInput } from '../../shared/schemas.ts';
import type { Goal, GoalPeriod, GoalPlan } from '../../shared/types.ts';
import { api, useGoal, useGoals, useGoalWrite } from '../api.ts';
import { planAmount } from '../goalPlans.ts';
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
 * 選んだ日にもう記録があれば並べて、ここから消せる。押す前に「記録したらどうなるか」を見せる。
 * plan（やる時間・design 4-14）を渡すと、上にその予定（時間を変える・外す）を出し、記録をその予定と結ぶ
 */
export function LogSheet({ g, date: initial, plan: given, onClose }: { g: Goal; date?: string; plan?: GoalPlan; onClose: () => void }) {
  const today = clientToday();
  const { data: d } = useGoal(g.id);
  const logs = d?.logs ?? [];
  // 予定は取り直した中身で見る（時間を変えたらすぐ反映する）
  const plan = given ? (d ? d.plans.find((p) => p.id === given.id) : given) : undefined;
  const from = logFrom(g);
  const [date, setDate] = useState(given?.date ?? initial ?? today);
  const [value, setValue] = useState(given?.amount != null ? String(given.amount) : g.unit === '回' ? '1' : '');
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
    // 予定の日に記録するなら、その予定と結ぶ（別の日にしたら結ばない＝その日の予定があればサーバが結ぶ）
    const planId = plan && !plan.done && plan.date === date ? plan.id : undefined;
    const ok = await log(g, { amount, date, note: note.trim() || undefined, planId });
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
        {plan && (
          <PlanBox
            plan={plan}
            from={from}
            today={today}
            onMoved={(to) => setDate(to)}
            onRemoved={onClose}
          />
        )}
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
          {!loggable && (
            <p className="mt-1.5 text-xs text-amber-600">
              {date < from
                ? `${fmtDate(from, today)} より前は数えていない`
                : plan
                  ? 'まだ先の予定（記録は当日から。いまは時間を変える・外すだけ）'
                  : '先の日付には記録できない'}
            </p>
          )}
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

const LENGTHS: [number, string][] = [
  [15, '15m'],
  [30, '30m'],
  [60, '1h'],
  [90, '1h30m'],
  [120, '2h'],
];

/** 記録のシートの上に出す「やる時間」: いつか・済んだか、時間を変える（日付・時刻・長さ）・外す */
function PlanBox({
  plan,
  from,
  today,
  onMoved,
  onRemoved,
}: {
  plan: GoalPlan;
  from: string;
  today: string;
  onMoved: (date: string) => void;
  onRemoved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const update = useGoalWrite((patch: GoalPlanPatchInput) => api.updateGoalPlan(plan.id, patch));
  const remove = useGoalWrite(() => api.deleteGoalPlan(plan.id));
  const minutes = plan.minutes ?? PLACE_DEFAULT_MIN;
  const when = plan.start ? `${plan.start}–${fmtClock(toMin(plan.start) + minutes)}` : '時刻なし';
  const small = 'rounded-md border border-emerald-300 px-2 py-1 text-xs dark:border-emerald-800';
  return (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/40">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
          🗓 {fmtDate(plan.date, today)} {when}
        </span>
        {plan.done && <span className="rounded-full bg-emerald-600 px-2 text-[11px] text-white">✓ 済</span>}
        <span className="ml-auto flex gap-1.5">
          <button type="button" onClick={() => setEditing(!editing)} className={cx(small, 'text-emerald-700 dark:text-emerald-300')}>
            {editing ? '閉じる' : '時間を変える'}
          </button>
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: () => {
                  toast('やる時間を外した');
                  onRemoved();
                },
              })
            }
            className="rounded-md px-2 py-1 text-xs text-red-600 dark:text-red-400"
          >
            外す
          </button>
        </span>
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={plan.date}
            min={from}
            aria-label="やる日"
            onChange={(e) => {
              const to = e.target.value;
              if (!to) return;
              update.mutate({ date: to });
              onMoved(to);
            }}
            className={cx(INPUT, 'py-1')}
          />
          <input
            type="time"
            step={300}
            value={plan.start ?? ''}
            aria-label="始める時刻"
            onChange={(e) => update.mutate({ start: e.target.value || null, minutes: plan.minutes ?? PLACE_DEFAULT_MIN })}
            className={cx(INPUT, 'py-1')}
          />
          {plan.start && (
            <>
              {LENGTHS.map(([m, label]) => (
                <button key={m} type="button" className={cx(chip(minutes === m), 'px-2.5 py-0.5 text-xs')} onClick={() => update.mutate({ minutes: m })}>
                  {label}
                </button>
              ))}
              <button type="button" className={cx(chip(false), 'px-2.5 py-0.5 text-xs')} onClick={() => update.mutate({ start: null })}>
                時刻なし
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 時間割・月から押した「やる時間」: その目標の記録のシートを、予定つきで開く */
export function PlanSheet({ plan, onClose }: { plan: GoalPlan; onClose: () => void }) {
  const { data: g } = useGoal(plan.goalId);
  return g ? <LogSheet g={g} plan={plan} onClose={onClose} /> : null;
}

/**
 * やる時間を入れる（月ビュー・目標の詳細から。時間割では置くパネルから入れる）。目標・日付・時刻（無しでもよい）・長さ・量。
 * goal を渡すとその目標に決めて開く
 */
export function PlanCreateSheet({ date: initial, goal: fixed, onClose }: { date: string; goal?: Goal; onClose: () => void }) {
  const today = clientToday();
  const { data: goals = [] } = useGoals();
  const options = fixed ? [fixed] : goals.filter((x) => !x.progress.ended);
  const [goalId, setGoalId] = useState<number | null>(fixed?.id ?? null);
  const g = options.find((x) => x.id === goalId) ?? options[0];
  const [date, setDate] = useState(initial);
  const [start, setStart] = useState('');
  const [minutes, setMinutes] = useState(PLACE_DEFAULT_MIN);
  // 量は、触っていなければ目標に合わせた既定（planAmount）
  const [amount, setAmount] = useState<string | null>(null);
  const amountText = amount ?? (g ? String(planAmount(g) ?? '') : '');
  const create = useGoalWrite((a: { goalId: number; input: GoalPlanCreateInput }) => api.addGoalPlan(a.goalId, a.input));
  const n = Number(amountText);
  const ok = g !== undefined && date >= logFrom(g) && (amountText.trim() === '' || (Number.isFinite(n) && n > 0));

  const submit = () => {
    if (!ok || !g || create.isPending) return;
    create.mutate(
      {
        goalId: g.id,
        input: { date, start: start || null, minutes: start ? minutes : null, amount: amountText.trim() ? n : null },
      },
      {
        onSuccess: (p) => {
          toast(`${p.title} を ${fmtDate(p.date, today)}${p.start ? ` ${p.start}` : ''} に入れた`);
          onClose();
        },
      },
    );
  };

  return (
    <SheetFrame title="目標をやる時間を入れる" sub={fmtDate(date, today)} onClose={onClose}>
      {options.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">目標が無い。目標タブの［＋ 目標］から作れる。</p>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {!fixed && (
            <div>
              <div className={LABEL}>目標</div>
              <div className="mt-1.5 divide-y divide-zinc-200/70 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {options.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => {
                      setGoalId(x.id);
                      setAmount(null);
                    }}
                    className={cx('flex w-full items-baseline gap-2 px-3 py-2.5 text-left', g?.id === x.id && 'bg-emerald-50 dark:bg-emerald-950/50')}
                  >
                    <span className={cx('size-3.5 shrink-0 self-center rounded-full border-2', g?.id === x.id ? 'border-emerald-600 bg-emerald-600' : 'border-zinc-300')} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{x.title}</span>
                    <span className="shrink-0 text-xs text-zinc-400">{goalRuleText(x)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className={LABEL}>日付</span>
              <input type="date" value={date} min={g ? logFrom(g) : undefined} onChange={(e) => e.target.value && setDate(e.target.value)} className={cx(INPUT, 'mt-1.5 block')} />
            </label>
            <label className="block">
              <span className={LABEL}>始める時刻（任意）</span>
              <input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} className={cx(INPUT, 'mt-1.5 block')} />
            </label>
          </div>
          {start && (
            <div>
              <div className={LABEL}>長さ</div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {LENGTHS.map(([m, label]) => (
                  <button key={m} type="button" className={chip(minutes === m)} onClick={() => setMinutes(m)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {g && (
            <label className="block">
              <span className={LABEL}>この時間にやる量（任意）</span>
              <span className="mt-1.5 flex items-center gap-2">
                <input
                  inputMode="decimal"
                  value={amountText}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="量"
                  className={cx(INPUT, 'w-24 text-center')}
                />
                <span className="text-sm text-zinc-500">{g.unit}</span>
              </span>
            </label>
          )}
          {g && date < logFrom(g) && <p className="text-xs text-amber-600">{fmtDate(logFrom(g), today)} より前には入れられない（数え始める前）</p>}
          <p className="text-xs leading-relaxed text-zinc-500">
            タスクにはしない。時間割と月に緑で出て、Google カレンダーにも【目標】として入る{start ? '（5分前に通知）' : ''}。記録すると済になる。
          </p>
          <button
            type="submit"
            disabled={!ok || create.isPending}
            className="w-full rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white disabled:opacity-40"
          >
            やる時間を入れる
          </button>
        </form>
      )}
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
