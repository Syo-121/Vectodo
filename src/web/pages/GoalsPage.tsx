// 目標（design 7-15）: 期間ごと（週に2回・1日に10ページ）と期限までの総量（12/31 までに 300ページ）。
// カードに今の進み具合・最近の期間・連続達成と、記録の欄。「記録と設定」を開くと、記録の一覧（消せる）と目標の書き換え・アーカイブ・削除。

import { useState } from 'react';
import { defaultStart, fmtAmount, goalRuleText, periodCounter, progressText } from '../../shared/goals.ts';
import type { GoalCreateInput } from '../../shared/schemas.ts';
import type { Goal, GoalPeriod } from '../../shared/types.ts';
import { api, useGoal, useGoals, useGoalWrite } from '../api.ts';
import { GoalBar, GoalHistory, isAchieved, QuickLog, useLogGoal } from '../components/GoalParts.tsx';
import { PageHeader } from '../components/Layout.tsx';
import { toast } from '../toast.ts';
import { addDays, CARD, clientToday, cx, fmtDate } from '../util.ts';

const INPUT =
  'rounded-md border border-zinc-300 bg-transparent px-2.5 py-1.5 text-base outline-none focus:border-indigo-500 md:text-sm dark:border-zinc-700';
const LABEL = 'text-xs font-medium text-zinc-500';
const pill = (active: boolean) =>
  cx(
    'rounded-full px-3 py-1 text-sm',
    active ? 'bg-indigo-600 text-white' : 'bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  );

export function GoalsPage() {
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { data: goals = [], isLoading } = useGoals();
  const { data: archived = [] } = useGoals(true);

  return (
    <div>
      <PageHeader title="目標">
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white">
            ＋ 目標
          </button>
        )}
      </PageHeader>
      <p className="px-4 pb-1 text-xs leading-relaxed text-zinc-500">
        「週に2回」「1日に10ページ」のような期間ごとの目標と、「12/31 までに 300ページ」のような期限までの目標。記録はここか今日の画面の［＋］から（Claude からも足せる）。
      </p>

      {adding && (
        <div className={cx(CARD, 'mt-3 p-4')}>
          <GoalForm onDone={() => setAdding(false)} />
        </div>
      )}

      {isLoading && <p className="p-4 text-sm text-zinc-400">読み込み中…</p>}
      {!isLoading && goals.length === 0 && !adding && (
        <p className="px-4 py-8 text-center text-sm text-zinc-400">目標はまだない。右上の［＋ 目標］から作れる。</p>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-2 md:px-4 md:[&>*]:mx-0">
        {goals.map((g) => (
          <GoalCard key={g.id} g={g} />
        ))}
      </div>

      {archived.length > 0 && (
        <div className="mt-6">
          <button type="button" onClick={() => setShowArchived(!showArchived)} className="px-7 py-1 text-xs text-zinc-500">
            {showArchived ? '▾' : '▸'} 🗄 アーカイブした目標 {archived.length} 件
          </button>
          {showArchived && (
            <div className="mt-2 grid gap-3 md:grid-cols-2 md:px-4 md:[&>*]:mx-0">
              {archived.map((g) => (
                <GoalCard key={g.id} g={g} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GoalCard({ g }: { g: Goal }) {
  const [open, setOpen] = useState(false);
  const p = g.progress;
  const done = isAchieved(g);
  const counter = g.period ? periodCounter(g.period) : '';
  const facts: string[] = [];
  if (g.kind === 'rate' && !p.notStarted) {
    if (p.streak > 0) facts.push(`🔥 ${p.streak}${counter}連続`);
    if (p.record.total > 0) facts.push(`達成 ${p.record.achieved}/${p.record.total}${counter}`);
    facts.push(`累計 ${fmtAmount(p.sum, g.unit)}`);
  }
  // 期限までは、ペースは上の行に出ているので、残りの日数と1日あたりだけ
  if (g.kind === 'total' && !p.notStarted && p.perDay !== null) facts.push(`残り ${p.daysLeft}日・1日 ${fmtAmount(p.perDay, g.unit)} で間に合う`);
  if (p.todaySum > 0 && g.period !== 'day') facts.push(`今日 ${fmtAmount(p.todaySum, g.unit)}`);

  return (
    <section className={cx(CARD, 'p-4', g.archived && 'opacity-70')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{g.title}</h2>
          <p className="text-xs text-zinc-500">
            {g.code}・{goalRuleText(g)}
            {g.kind === 'rate' && g.endDate && `（${fmtDate(g.endDate, clientToday())} まで）`}
          </p>
        </div>
        {!g.archived && !p.ended && !p.notStarted && <QuickLog g={g} />}
      </div>
      <p className={cx('mt-3 text-lg font-semibold', done ? 'text-emerald-600 dark:text-emerald-400' : '')}>{progressText(g, p)}</p>
      <GoalBar g={g} className="mt-1.5" />
      {facts.length > 0 && <p className="mt-2 text-xs text-zinc-500">{facts.join('・')}</p>}
      <div className="mt-3">
        <GoalHistory g={g} />
      </div>
      <button type="button" onClick={() => setOpen(!open)} className="mt-3 text-xs text-indigo-600 dark:text-indigo-400">
        {open ? '▾ 閉じる' : '▸ 記録と設定'}
      </button>
      {open && <GoalDetailPanel g={g} />}
    </section>
  );
}

/** 開いたカードの中: 日付と一言つきで記録する欄・記録の一覧（消せる）・目標の書き換え */
function GoalDetailPanel({ g }: { g: Goal }) {
  const { data: d } = useGoal(g.id);
  const [editing, setEditing] = useState(false);
  const removeLog = useGoalWrite((logId: number) => api.deleteGoalLog(g.id, logId));
  const update = useGoalWrite((patch: { archived: boolean }) => api.updateGoal(g.id, patch));
  const remove = useGoalWrite(() => api.deleteGoal(g.id));
  const today = clientToday();

  if (editing) {
    return (
      <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <GoalForm goal={g} onDone={() => setEditing(false)} />
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      {!g.archived && <LogForm g={g} />}
      {g.notes.trim() && <p className="text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">{g.notes}</p>}
      <div>
        <h3 className={LABEL}>記録（{d?.logs.length ?? '…'}件）</h3>
        {d && d.logs.length === 0 && <p className="mt-1 text-sm text-zinc-400">まだない</p>}
        <ul className="mt-1 max-h-72 divide-y divide-zinc-200/70 overflow-y-auto dark:divide-zinc-800">
          {d?.logs.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="w-24 shrink-0 text-zinc-500">{fmtDate(l.date, today)}</span>
              <span className="shrink-0 font-medium">{fmtAmount(l.amount, g.unit)}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-500">{l.note}</span>
              <button
                type="button"
                className="px-1.5 text-zinc-400 hover:text-red-500"
                aria-label="この記録を消す"
                onClick={() => {
                  if (confirm(`${fmtDate(l.date, today)} の ${fmtAmount(l.amount, g.unit)} を消す？`)) removeLog.mutate(l.id);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" onClick={() => setEditing(true)} className="rounded-md border border-zinc-300 px-3 py-1 dark:border-zinc-700">
          書き換える
        </button>
        <button
          type="button"
          onClick={() => update.mutate({ archived: !g.archived })}
          className="rounded-md border border-zinc-300 px-3 py-1 dark:border-zinc-700"
        >
          {g.archived ? '🗄 戻す' : '🗄 アーカイブ'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`「${g.title}」を記録ごと消す？（やめるだけならアーカイブ）`)) remove.mutate(undefined);
          }}
          className="ml-auto rounded-md px-3 py-1 text-red-600 dark:text-red-400"
        >
          削除
        </button>
      </div>
    </div>
  );
}

/** 日付（今日・昨日・選ぶ）と一言つきで記録する */
function LogForm({ g }: { g: Goal }) {
  const log = useLogGoal();
  const today = clientToday();
  const [amount, setAmount] = useState(g.unit === '回' ? '1' : '');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Number(amount);
  const ok = amount.trim() !== '' && Number.isFinite(n) && n > 0;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        setBusy(true);
        void log(g, { amount: n, date, note: note.trim() || undefined }).finally(() => {
          setBusy(false);
          setNote('');
          if (g.unit !== '回') setAmount('');
        });
      }}
    >
      <h3 className={LABEL}>日付と一言をつけて記録</h3>
      <div className="flex flex-wrap items-center gap-2">
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="量" className={cx(INPUT, 'w-20')} />
        <span className="text-sm text-zinc-500">{g.unit}</span>
        <button type="button" className={pill(date === today)} onClick={() => setDate(today)}>
          今日
        </button>
        <button type="button" className={pill(date === addDays(today, -1))} onClick={() => setDate(addDays(today, -1))}>
          昨日
        </button>
        <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className={cx(INPUT, 'py-1')} />
      </div>
      <div className="flex gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="一言（任意・例: 90分・3章まで）" maxLength={500} className={cx(INPUT, 'min-w-0 flex-1')} />
        <button type="submit" disabled={!ok || busy} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          記録
        </button>
      </div>
    </form>
  );
}

const PERIODS: [GoalPeriod, string][] = [
  ['day', '1日'],
  ['week', '1週'],
  ['month', '1か月'],
];
const UNITS = ['回', 'ページ', '分', '時間'];

/** 作る・書き換える */
function GoalForm({ goal, onDone }: { goal?: Goal; onDone: () => void }) {
  const today = clientToday();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [kind, setKind] = useState<'rate' | 'total'>(goal?.kind ?? 'rate');
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? 'week');
  const [target, setTarget] = useState(goal ? String(goal.target) : '');
  const [unit, setUnit] = useState(goal?.unit ?? '回');
  const [start, setStart] = useState<string | null>(goal?.startDate ?? null);
  const [end, setEnd] = useState(goal?.endDate ?? '');
  const [notes, setNotes] = useState(goal?.notes ?? '');
  const save = useGoalWrite((input: GoalCreateInput) =>
    goal ? api.updateGoal(goal.id, { ...input, period: input.period ?? null, endDate: input.endDate ?? null }) : api.createGoal(input),
  );
  // 数え始める日は、触っていなければ形に合わせた既定（今週の月曜・今月1日・今日）
  const startDate = start ?? defaultStart(kind, kind === 'rate' ? period : null, today);
  const n = Number(target);
  const ok = title.trim() !== '' && Number.isFinite(n) && n > 0 && (kind === 'rate' || end !== '') && (!end || end >= startDate);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
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
              toast(goal ? '書き換えた' : `${d.code} を作った`);
              onDone();
            },
          },
        );
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
          className={cx(INPUT, 'mt-1 w-full')}
        />
      </label>
      <div className="flex gap-2">
        <button type="button" className={pill(kind === 'rate')} onClick={() => setKind('rate')}>
          期間ごと
        </button>
        <button type="button" className={pill(kind === 'total')} onClick={() => setKind('total')}>
          期限まで
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {kind === 'rate' ? (
          PERIODS.map(([p, label]) => (
            <button key={p} type="button" className={pill(period === p)} onClick={() => setPeriod(p)}>
              {label}
            </button>
          ))
        ) : (
          <input type="date" value={end} min={startDate} onChange={(e) => setEnd(e.target.value)} className={INPUT} aria-label="期限" />
        )}
        <span className="text-sm text-zinc-500">に</span>
        <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="量" className={cx(INPUT, 'w-20')} />
        <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="単位" maxLength={20} className={cx(INPUT, 'w-20')} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {UNITS.map((u) => (
          <button key={u} type="button" className={cx(pill(unit === u), 'px-2.5 py-0.5 text-xs')} onClick={() => setUnit(u)}>
            {u}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className={LABEL}>数え始める日</span>
          <input type="date" value={startDate} onChange={(e) => e.target.value && setStart(e.target.value)} className={cx(INPUT, 'mt-1 block')} />
        </label>
        {kind === 'rate' && (
          <label className="block">
            <span className={LABEL}>終わる日（任意）</span>
            <input type="date" value={end} min={startDate} onChange={(e) => setEnd(e.target.value)} className={cx(INPUT, 'mt-1 block')} />
          </label>
        )}
      </div>
      <label className="block">
        <span className={LABEL}>メモ（任意）</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="本の名前・ルールなど"
          className={cx(INPUT, 'mt-1 w-full')}
        />
      </label>
      {kind === 'total' && end === '' && <p className="text-xs text-amber-600">期限を入れる</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={!ok || save.isPending} className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white disabled:opacity-50">
          {goal ? '保存' : '作る'}
        </button>
        <button type="button" onClick={onDone} className="rounded-md px-3 py-1.5 text-sm text-zinc-500">
          やめる
        </button>
      </div>
    </form>
  );
}
