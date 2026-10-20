// 目標の詳細（design 7-15・/goals/:id）: 今の期間の進み具合と［＋ 記録する］、月のカレンダー（日ごとの量・週ごとの目標は週の合計）、
// 期限までの目標はペースのグラフ、記録の一覧（期間ごと）。カレンダーの日付・一覧の行を押すと、その日の記録を足す・消すシートが開く。
// 書き換え・アーカイブ・削除は右上の「…」から。広い画面は左にカレンダー、右に記録の一覧。

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { addDays, diffDays } from '../../shared/dates.ts';
import { approx, fmtAmount, goalRuleText, periodCounter, round } from '../../shared/goals.ts';
import { parseGoalRef } from '../../shared/ids.ts';
import type { Goal, GoalDetail, GoalPlan } from '../../shared/types.ts';
import { api, useGoal, useGoalWrite } from '../api.ts';
import { GoalBar } from '../components/GoalParts.tsx';
import { GoalFormSheet, LogSheet, PlanCreateSheet } from '../components/GoalSheets.tsx';
import { currentHeading, currentSum, goalCalendar, groupLogs, isAchieved, isLoggable, minMonthOffset, statusText } from '../goalView.ts';
import { toast } from '../toast.ts';
import { CARD, clientToday, cx, fmtDate, fmtMonthDay } from '../util.ts';

const SECTION = cx(CARD, 'lg:mx-0');
const WEEK = ['月', '火', '水', '木', '金', '土', '日'];

export function GoalDetailPage() {
  const id = parseGoalRef(useParams().id ?? '');
  const { data: g, isLoading } = useGoal(id);
  const today = clientToday();
  const [logDate, setLogDate] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [openPlan, setOpenPlan] = useState<GoalPlan | null>(null);
  const [addingPlan, setAddingPlan] = useState(false);

  if (isLoading) return <p className="p-4 text-sm text-zinc-400">読み込み中…</p>;
  if (!g) {
    return (
      <div className="p-4 text-sm text-zinc-500">
        目標が見つからない。
        <Link to="/goals" className="ml-2 text-indigo-600">
          目標の一覧へ
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <header className="flex items-center gap-1 px-2 pt-4 pb-3 md:pt-5">
        <Link to="/goals" aria-label="目標の一覧へ" className="rounded-full px-2.5 py-1 text-xl text-zinc-500">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">{g.title}</h1>
          <p className="truncate text-xs text-zinc-500">
            {goalRuleText(g)}・{fmtMonthDay(g.startDate, today)} から{g.kind === 'rate' && g.endDate ? ` ${fmtMonthDay(g.endDate, today)} まで` : ''}・{g.code}
          </p>
        </div>
        <GoalMenu g={g} onEdit={() => setEditing(true)} />
      </header>

      {g.archived && <ArchivedBanner g={g} />}

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0 lg:px-4">
        <div className="space-y-4">
          <Hero g={g} onLog={() => setLogDate(today)} />
          {g.kind === 'total' && <PaceChart g={g} today={today} />}
          <Calendar g={g} today={today} onPick={setLogDate} />
        </div>
        <div className="space-y-4">
          <Plans g={g} today={today} onOpen={setOpenPlan} onAdd={() => setAddingPlan(true)} />
          <Records g={g} today={today} onPick={setLogDate} />
          {g.notes.trim() && (
            <section className={cx(SECTION, 'p-4')}>
              <h3 className="text-xs font-semibold text-zinc-500">メモ</h3>
              <p className="mt-1 text-sm whitespace-pre-wrap">{g.notes}</p>
            </section>
          )}
        </div>
      </div>

      {logDate && <LogSheet g={g} date={logDate} onClose={() => setLogDate(null)} />}
      {openPlan && <LogSheet g={g} plan={openPlan} onClose={() => setOpenPlan(null)} />}
      {addingPlan && <PlanCreateSheet goal={g} date={today} onClose={() => setAddingPlan(false)} />}
      {editing && <GoalFormSheet goal={g} onClose={() => setEditing(false)} />}
    </div>
  );
}

/**
 * やる時間（design 4-14）: 今日から先のまだのものと、過ぎてもまだのもの（やらなかった）を日付順に。押すと記録のシート。
 * ［＋ やる時間を入れる］。時間割（今日・ボードの日・週）でドラッグして置くこともできる
 */
function Plans({ g, today, onOpen, onAdd }: { g: GoalDetail; today: string; onOpen: (p: GoalPlan) => void; onAdd: () => void }) {
  const upcoming = g.plans.filter((p) => p.date >= today && !p.done);
  const missed = g.plans.filter((p) => p.date < today && !p.done && p.date >= addDays(today, -7));
  const row = (p: GoalPlan, past: boolean) => (
    <button
      key={p.id}
      type="button"
      onClick={() => onOpen(p)}
      className="flex w-full items-baseline gap-3 border-b border-zinc-200/70 px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40"
    >
      <span className={cx('w-20 shrink-0', past ? 'text-zinc-400' : 'text-zinc-500')}>{fmtDate(p.date, today)}</span>
      <span className={cx('shrink-0 tabular-nums', past ? 'text-zinc-400' : 'font-semibold text-emerald-700 dark:text-emerald-300')}>
        {p.start ? `${p.start}〜` : '時刻なし'}
      </span>
      <span className="min-w-0 flex-1 truncate text-zinc-500">
        {p.amount !== null && fmtAmount(p.amount, p.unit)}
        {past && <span className="ml-1 text-amber-600 dark:text-amber-400">まだ記録していない</span>}
      </span>
      <span className="text-zinc-300 dark:text-zinc-600">›</span>
    </button>
  );
  if (g.archived) return null;
  return (
    <section className={cx(SECTION, 'overflow-hidden')}>
      <h3 className="flex items-baseline px-4 pt-4 pb-2 text-sm font-semibold">
        やる時間
        <span className="ml-2 text-xs font-normal text-zinc-400">時間割に緑で出て、Google にも入る</span>
      </h3>
      {upcoming.length === 0 && missed.length === 0 && (
        <p className="px-4 pb-2 text-sm text-zinc-400">まだ決めていない。下のボタンか、今日・ボードの時間割で時間を選んで置ける。</p>
      )}
      {missed.map((p) => row(p, true))}
      {upcoming.map((p) => row(p, false))}
      <div className="p-3">
        <button
          type="button"
          onClick={onAdd}
          className="w-full rounded-xl border border-dashed border-emerald-400 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
        >
          🎯 やる時間を入れる
        </button>
      </div>
    </section>
  );
}

/** 今の期間: 見出し・大きい数字と状態・バー・数字のタイル・［＋ 記録する］ */
function Hero({ g, onLog }: { g: Goal; onLog: () => void }) {
  const today = clientToday();
  const p = g.progress;
  const done = isAchieved(g);
  const counter = g.period ? periodCounter(g.period) : '';
  const tiles: [string, string][] =
    g.kind === 'rate'
      ? [
          [p.streak ? `${p.streak}${counter}` : '—', '連続達成'],
          [p.record.total ? `${p.record.achieved}/${p.record.total}${counter}` : '—', 'これまでの達成'],
          [fmtAmount(p.sum, g.unit), '累計'],
        ]
      : [
          [p.daysLeft ? `${p.daysLeft}日` : '—', '期限まで'],
          [p.perDay !== null ? fmtAmount(p.perDay, g.unit) : '—', '1日の目安'],
          [p.expected !== null ? fmtAmount(approx(p.expected), g.unit) : '—', '今日までの予定'],
        ];
  return (
    <section className={cx(SECTION, 'p-5')}>
      <div className="text-xs font-medium text-zinc-500">{p.notStarted ? 'まだ始まっていない' : currentHeading(g, today)}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className={cx('text-5xl font-bold tabular-nums', done && 'text-emerald-600 dark:text-emerald-400')}>{currentSum(g)}</span>
        <span className="text-xl text-zinc-400">/ {fmtAmount(g.target, g.unit)}</span>
      </div>
      <p className={cx('mt-1 text-sm', done ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-300')}>
        {statusText(g, today)}
      </p>
      <GoalBar g={g} className="mt-3 h-3" />
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {tiles.map(([v, label]) => (
          <div key={label} className="rounded-lg bg-zinc-50 px-1 py-2 dark:bg-zinc-800/60">
            <div className="truncate font-semibold tabular-nums">{v}</div>
            <div className="text-[11px] text-zinc-500">{label}</div>
          </div>
        ))}
      </div>
      {isLoggable(g) && (
        <button
          type="button"
          onClick={onLog}
          className="mt-5 w-full rounded-xl bg-indigo-600 py-3 text-base font-semibold text-white active:scale-[0.99]"
        >
          ＋ 記録する
        </button>
      )}
    </section>
  );
}

/**
 * 月のカレンダー。日ごとの量を数字で（1日ごとの目標は届いた日を緑・少しでも＝薄い緑）、週ごとの目標は週の行の右に合計と ✓。
 * 押せる日（数え始めてから今日まで）を押すと、その日の記録のシート
 */
function Calendar({ g, today, onPick }: { g: GoalDetail; today: string; onPick: (date: string) => void }) {
  const [offset, setOffset] = useState(0);
  const min = minMonthOffset(g, today);
  const cal = goalCalendar(g, g.logs, today, offset);
  // まだ済んでいないやる時間がある日（緑の点）
  const planned = new Set(g.plans.filter((p) => !p.done).map((p) => p.date));
  const weekly = g.kind === 'rate' && g.period === 'week';
  const cols = weekly ? 'grid-cols-[repeat(7,minmax(0,1fr))_3.25rem]' : 'grid-cols-7';
  const monthTotal =
    g.kind === 'rate' && g.period === 'month'
      ? `${cal.monthSum}/${fmtAmount(g.target, g.unit)}${cal.monthSum >= g.target ? ' ✓' : ''}`
      : `この月 ${fmtAmount(cal.monthSum, g.unit)}`;
  return (
    <section className={cx(SECTION, 'p-4')}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOffset(offset - 1)}
          disabled={offset <= min}
          aria-label="前の月"
          className="rounded-full px-3 py-1 text-lg text-zinc-500 disabled:opacity-20"
        >
          ‹
        </button>
        <div className="flex-1 text-center">
          <div className="font-semibold">{cal.title}</div>
          <div className="text-xs text-zinc-500">{monthTotal}</div>
        </div>
        <button
          type="button"
          onClick={() => setOffset(offset + 1)}
          disabled={offset >= 0}
          aria-label="次の月"
          className="rounded-full px-3 py-1 text-lg text-zinc-500 disabled:opacity-20"
        >
          ›
        </button>
      </div>
      <div className={cx('mt-3 grid gap-1 text-center', cols)}>
        {WEEK.map((w) => (
          <div key={w} className="pb-1 text-[11px] text-zinc-400">
            {w}
          </div>
        ))}
        {weekly && <div className="pb-1 text-[11px] text-zinc-400">週</div>}
        {cal.weeks.map((week) => (
          <WeekRow key={week.days[0]!.date} week={week} g={g} weekly={weekly} planned={planned} onPick={onPick} />
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] text-zinc-400">日付を押すと、その日の記録を足す・消す（緑の点＝やる時間を入れた日）</p>
    </section>
  );
}

function WeekRow({
  week,
  g,
  weekly,
  planned,
  onPick,
}: {
  week: ReturnType<typeof goalCalendar>['weeks'][number];
  g: Goal;
  weekly: boolean;
  planned: Set<string>;
  onPick: (date: string) => void;
}) {
  const daily = g.kind === 'rate' && g.period === 'day';
  return (
    <>
      {week.days.map((d) => (
        <button
          key={d.date}
          type="button"
          disabled={!d.loggable}
          onClick={() => onPick(d.date)}
          aria-label={`${d.date} ${d.sum ? fmtAmount(d.sum, g.unit) : '記録なし'}`}
          className={cx(
            'relative flex h-12 flex-col items-center rounded-lg pt-1 transition active:scale-95',
            !d.inMonth && 'opacity-40',
            !d.loggable && 'cursor-default text-zinc-300 dark:text-zinc-700',
            d.sum > 0 &&
              (daily
                ? d.achieved
                  ? 'bg-emerald-500 text-white'
                  : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100'
                : 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-100'),
            d.loggable && d.sum === 0 && 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
            d.isToday && 'ring-2 ring-indigo-500 ring-inset',
          )}
        >
          <span className={cx('text-[11px] leading-none', d.isToday && 'font-bold')}>{Number(d.date.slice(8))}</span>
          {d.sum > 0 && <span className="mt-1 text-sm leading-none font-bold tabular-nums">{d.sum}</span>}
          {planned.has(d.date) && <span className="absolute bottom-1 size-1.5 rounded-full bg-emerald-500" aria-label="やる時間あり" />}
        </button>
      ))}
      {weekly && (
        <div
          className={cx(
            'flex flex-col items-center justify-center rounded-lg text-xs tabular-nums',
            week.sum === null
              ? ''
              : week.achieved
                ? 'bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : week.current
                  ? 'text-zinc-600 dark:text-zinc-300'
                  : 'text-zinc-400',
          )}
        >
          {week.sum !== null && (
            <>
              <span>
                {week.sum}/{g.target}
              </span>
              <span className="text-[10px]">{week.achieved ? '✓ 達成' : week.current ? '途中' : '—'}</span>
            </>
          )}
        </div>
      )}
    </>
  );
}

/** 期限までの目標のペース: 実績（累計・実線）と予定（数え始める日から期限まで一定・点線）、今日の縦線 */
function PaceChart({ g, today }: { g: GoalDetail; today: string }) {
  const end = g.endDate!;
  const days = Math.max(diffDays(end, g.startDate), 1);
  const W = 320;
  const H = 140;
  const L = 8;
  const R = 8;
  const T = 14;
  const B = 20;
  const byDate = new Map<string, number>();
  for (const l of g.logs) byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.amount);
  const lastIdx = Math.min(diffDays(today, g.startDate), days);
  let cum = 0;
  const points: [number, number][] = [];
  for (let i = 0; i <= lastIdx; i++) {
    cum += byDate.get(addDays(g.startDate, i)) ?? 0;
    points.push([i, cum]);
  }
  const top = Math.max(g.target, cum) * 1.05;
  const x = (i: number) => L + ((W - L - R) * i) / days;
  const y = (v: number) => H - B - ((H - T - B) * v) / top;
  const actual = points.map(([i, v], k) => `${k === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const todayX = lastIdx >= 0 && lastIdx <= days ? x(lastIdx) : null;
  return (
    <section className={cx(SECTION, 'p-4')}>
      <div className="flex items-baseline">
        <h3 className="text-sm font-semibold">ペース</h3>
        <span className="ml-auto flex items-center gap-3 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-indigo-500" />
            実績
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t-2 border-dashed border-zinc-400" />
            予定
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto mt-2 w-full max-w-md" role="img" aria-label={`実績 ${round(cum)}${g.unit}／目標 ${g.target}${g.unit}`}>
        <line x1={L} x2={W - R} y1={y(g.target)} y2={y(g.target)} className="stroke-zinc-200 dark:stroke-zinc-700" strokeWidth="1" />
        <text x={W - R} y={y(g.target) - 4} textAnchor="end" className="fill-zinc-400 text-[10px]">
          目標 {fmtAmount(g.target, g.unit)}
        </text>
        <line x1={x(0)} y1={y(0)} x2={x(days)} y2={y(g.target)} className="stroke-zinc-400" strokeWidth="1.5" strokeDasharray="4 4" />
        {todayX !== null && <line x1={todayX} x2={todayX} y1={T} y2={H - B} className="stroke-rose-400" strokeWidth="1" />}
        <path d={actual} fill="none" className="stroke-indigo-500" strokeWidth="2.5" strokeLinejoin="round" />
        <text x={L} y={H - 4} className="fill-zinc-400 text-[10px]">
          {fmtMonthDay(g.startDate, today)}
        </text>
        <text x={W - R} y={H - 4} textAnchor="end" className="fill-zinc-400 text-[10px]">
          {fmtMonthDay(end, today)}
        </text>
      </svg>
    </section>
  );
}

/** 記録の一覧（期間ごと・新しい順）。行は日ごと（同じ日の記録は合計して一言を並べる）。押すとその日のシート */
function Records({ g, today, onPick }: { g: GoalDetail; today: string; onPick: (date: string) => void }) {
  // 1日ごとは1週で7行になるので、はじめは3週ぶん
  const step = g.kind === 'rate' && g.period === 'day' ? 3 : 6;
  const [limit, setLimit] = useState(step);
  const groups = groupLogs(g, g.logs, today);
  return (
    <section className={cx(SECTION, 'overflow-hidden')}>
      <h3 className="flex items-baseline px-4 pt-4 pb-2 text-sm font-semibold">
        記録
        <span className="ml-2 text-xs font-normal text-zinc-400">{g.logs.length}件</span>
      </h3>
      {groups.length === 0 && <p className="px-4 pb-4 text-sm text-zinc-400">まだない。［＋ 記録する］かカレンダーの日付から入れられる。</p>}
      {groups.slice(0, limit).map((gr) => (
        <div key={gr.key}>
          <div className="flex items-baseline gap-2 border-y border-zinc-200/70 bg-zinc-50 px-4 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-800/40">
            <span className="font-semibold text-zinc-700 dark:text-zinc-200">{gr.label}</span>
            {gr.range && <span className="text-zinc-400">{gr.range}</span>}
            <span className={cx('ml-auto tabular-nums', gr.achieved ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-zinc-500')}>
              {gr.summary}
            </span>
          </div>
          {gr.days.length === 0 && <p className="px-4 py-2.5 text-sm text-zinc-400">まだ記録がない</p>}
          {gr.days.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => onPick(d.date)}
              className="flex w-full items-baseline gap-3 border-b border-zinc-200/70 px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40"
            >
              <span className="w-20 shrink-0 text-zinc-500">{fmtDate(d.date, today)}</span>
              <span className={cx('shrink-0 font-semibold tabular-nums', d.achieved && 'text-emerald-600 dark:text-emerald-400')}>
                {fmtAmount(d.sum, g.unit)}
                {d.achieved && ' ✓'}
              </span>
              <span className="min-w-0 flex-1 truncate text-zinc-500">
                {d.notes.join('・')}
                {d.count > 1 && <span className="ml-1 text-zinc-400">（{d.count}回に分けて）</span>}
              </span>
              <span className="text-zinc-300 dark:text-zinc-600">›</span>
            </button>
          ))}
        </div>
      ))}
      {groups.length > limit && (
        <button type="button" onClick={() => setLimit(limit + step)} className="w-full border-t border-zinc-200/70 py-2.5 text-sm text-indigo-600 dark:border-zinc-800 dark:text-indigo-400">
          もっと前を見る（あと {groups.length - limit}）
        </button>
      )}
    </section>
  );
}

/** 右上の「…」: 書き換える・アーカイブ（戻す）・削除 */
function GoalMenu({ g, onEdit }: { g: Goal; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const update = useGoalWrite((archived: boolean) => api.updateGoal(g.id, { archived }));
  const remove = useGoalWrite(() => api.deleteGoal(g.id));
  const item = 'block w-full px-4 py-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800';
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-label="目標のメニュー" className="rounded-full px-3 py-1 text-xl leading-none text-zinc-500">
        …
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <button
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              ✎ 書き換える
            </button>
            <button
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                update.mutate(!g.archived, { onSuccess: () => toast(g.archived ? '戻した' : 'アーカイブした（一覧のいちばん下から見られる）') });
              }}
            >
              🗄 {g.archived ? 'アーカイブから戻す' : 'アーカイブ'}
            </button>
            <button
              type="button"
              className={cx(item, 'text-red-600 dark:text-red-400')}
              onClick={() => {
                setOpen(false);
                if (!confirm(`「${g.title}」を記録ごと消す？（やめるだけならアーカイブ）`)) return;
                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast(`「${g.title}」を消した`);
                    navigate('/goals');
                  },
                });
              }}
            >
              🗑 削除
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ArchivedBanner({ g }: { g: Goal }) {
  const update = useGoalWrite(() => api.updateGoal(g.id, { archived: false }));
  return (
    <div className={cx(CARD, 'mb-4 flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-600 lg:mx-4 dark:text-zinc-300')}>
      🗄 アーカイブした目標（今日の画面と一覧には出ない）
      <button type="button" onClick={() => update.mutate(undefined)} className="ml-auto rounded-md border border-zinc-300 px-2.5 py-1 text-xs dark:border-zinc-700">
        戻す
      </button>
    </div>
  );
}

