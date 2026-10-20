// 今日（design 7-3・4-10・4-11）: いちばん上に「次にやること」3件（なぜそれかの一言と、今日やる／明日のボタン）、
// その下に「今日の流れ」（Google の予定と締切を1本の時間軸に並べ、このあとの空きを出す）と「その次に」（今日〜数日のうちに見ておくもの）、
// 畳んだ「近いうちに（7日以内）」「待っているもの」「今日完了」。「次にやること」の下に目標の進み具合と［＋］（design 7-15）。
// 並べ方はサーバが shared/next.ts の rankNext で決める（MCP の今日と同じ順）。右上は今日の分の時間と、このあとの空き。

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { dayFlow, fmtClock } from '../../shared/flow.ts';
import { duePassed, NEXT_COUNT, nextReason, TODAY_KINDS } from '../../shared/next.ts';
import type { Category, NextItem, NextKind, Task } from '../../shared/types.ts';
import { api, useCategories, useGoalPlans, useGoals, useOverlay, useSettings, useToday, useWrite } from '../api.ts';
import { GoalTodayRow } from '../components/GoalParts.tsx';
import { planTask } from '../goalPlans.ts';
import { PageHeader } from '../components/Layout.tsx';
import { FlowSection, useNow } from '../components/TodayFlow.tsx';
import { CloseButton, TaskRow } from '../components/TaskRow.tsx';
import { useLocalState } from '../storage.ts';
import { toast } from '../toast.ts';
import { addDays, CARD, cx, fmtDate, fmtMonthDay, fmtSpan } from '../util.ts';

const TONE: Record<NextKind, string> = {
  overdue: 'text-red-600 dark:text-red-400',
  dueToday: 'text-orange-600 dark:text-orange-400',
  doing: 'text-indigo-600 dark:text-indigo-400',
  doToday: 'text-indigo-600 dark:text-indigo-400',
  atRisk: 'text-amber-600 dark:text-amber-400',
  dueSoon: 'text-zinc-500 dark:text-zinc-400',
  important: 'text-zinc-500 dark:text-zinc-400',
};
const H2 = 'px-7 pb-2 text-xs font-semibold tracking-wide text-zinc-500';
/** 今日の分＝期限切れ・今日締切・今日やる日（持ち越し含む）と、やる日に今日が入っているもの（進行中を今日の空きに置いた など） */
const TODAY_SHARE: NextKind[] = ['overdue', 'dueToday', 'doToday'];

export function TodayPage() {
  const { data: v, isLoading } = useToday();
  const { data: cats = [] } = useCategories(true);
  const { data: settings } = useSettings();
  const [soonOpen, setSoonOpen] = useLocalState('today.soonOpen', false);
  const [waitOpen, setWaitOpen] = useLocalState('today.waitOpen', false);
  const [showDone, setShowDone] = useState(false);
  const categories = new Map(cats.map((c) => [c.id, c]));
  const now = useNow();
  const { data: gcal } = useOverlay(v?.today ?? '', v?.today ?? '', !!v);
  // 目標は、いま数えているもの（始まっていない・終わったものは出さない）
  const { data: goals = [] } = useGoals();
  const activeGoals = goals.filter((g) => !g.progress.notStarted && !g.progress.ended);
  // 今日の目標をやる時間（design 4-14）。まだのものは置いたタスクと同じに今日の流れへ混ぜる
  const { data: plans = [] } = useGoalPlans(v?.today ?? '', v?.today ?? '', !!v);

  if (isLoading || !v) return <p className="p-4 text-sm text-zinc-400">読み込み中…</p>;
  const today = v.today;
  const connected = gcal?.connected ?? false;
  const dayStart = settings?.dayStartMin ?? 8 * 60;
  const dayEnd = settings?.dayEndMin ?? 23 * 60;
  const placed = [...v.placed, ...plans.filter((p) => !p.done && p.start).map(planTask)];
  const flow = dayFlow({
    today,
    events: gcal?.events ?? [],
    deadlines: v.deadlines,
    placed,
    now,
    dayStart,
    dayEnd,
  });
  const clock = fmtClock(now);
  const top = v.ranked.slice(0, NEXT_COUNT);
  const rest = v.ranked.slice(NEXT_COUNT);
  const todayRest = rest.filter((n) => TODAY_KINDS.includes(n.kind));
  const soon = rest.filter((n) => n.kind === 'dueSoon');

  // 今日の分の時間（その日の配分時間、無ければ見積）を、このあとの空き（Google につながっていなければ1日の容量）と比べる
  const share = v.ranked.filter((n) => TODAY_SHARE.includes(n.kind) || n.plannedToday);
  const load = share.reduce(
    (sum, n) => sum + (n.task.doDates.find((d) => d.date === today)?.minutes ?? n.task.estimateMin ?? 0),
    0,
  );
  // 使える時間＝このあとの空き＋予定に重ねて置いた時間（ながら）
  const room = connected ? flow.freeMin + flow.alongMin : (settings?.dailyCapacityMin ?? 360);
  // 今日の分の進み具合（済んだものと合わせて）
  const left = share.length;
  const done = v.doneToday.length;
  // 子が全部終わった親（design 4-3）。つながっていないとき、前の版で保存した返事には無いので空として扱う
  const closable = v.closable ?? [];
  const empty = v.ranked.length === 0 && v.waiting.length === 0 && closable.length === 0;

  return (
    <div>
      <PageHeader title={`今日 ${fmtMonthDay(today, today)}`}>
        {load > 0 && (
          <span
            className={cx(
              'text-xs',
              load > room
                ? 'font-medium text-red-600 dark:text-red-400'
                : load > room * 0.8
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-zinc-500',
            )}
          >
            今日の分 {fmtSpan(load)}／{connected ? `空き ${fmtSpan(flow.freeMin)}` : fmtSpan(room)}
            {connected && flow.alongMin > 0 && <span className="block text-right">＋ながら {fmtSpan(flow.alongMin)}</span>}
          </span>
        )}
      </PageHeader>
      <GcalWarning />

      {empty && <p className="px-4 py-8 text-center text-sm text-zinc-400">今日やることはない。右下の＋から追加できる。</p>}

      {top.length > 0 && (
        <section className="mt-3">
          <h2 className={cx(H2, 'flex items-baseline')}>
            次にやること
            {done + left > 0 && (
              <span className="ml-auto font-normal">
                今日の分 {done}/{done + left} 完了
              </span>
            )}
          </h2>
          <div className={cx(CARD, 'border-indigo-200 dark:border-indigo-900')}>
            {top.map((n) => (
              <NextRow key={n.task.id} n={n} today={today} now={clock} categories={categories} />
            ))}
          </div>
        </section>
      )}

      {activeGoals.length > 0 && (
        <section className="mt-6">
          <h2 className={cx(H2, 'flex items-baseline')}>
            目標
            <Link to="/goals" className="ml-auto font-normal text-indigo-600 dark:text-indigo-400">
              すべて →
            </Link>
          </h2>
          <div className={CARD}>
            {activeGoals.map((g) => (
              <GoalTodayRow key={g.id} g={g} plans={plans.filter((p) => p.goalId === g.id)} />
            ))}
          </div>
        </section>
      )}

      {(connected || v.deadlines.length > 0 || placed.length > 0) && (
        <FlowSection
          flow={flow}
          now={now}
          today={today}
          connected={connected}
          dayStart={dayStart}
          dayEnd={dayEnd}
          candidates={v.ranked.filter((n) => !v.placed.some((t) => t.id === n.task.id))}
          placed={placed}
          deadlines={v.deadlines}
          events={gcal?.events ?? []}
        />
      )}

      {todayRest.length > 0 && (
        <section className="mt-6">
          <h2 className={H2}>その次に（{todayRest.length}）</h2>
          <div className={CARD}>
            {todayRest.map((n) => (
              <NextRow key={n.task.id} n={n} today={today} now={clock} categories={categories} />
            ))}
          </div>
        </section>
      )}

      {closable.length > 0 && (
        <section className="mt-6">
          <h2 className={H2}>子が全部終わった（{closable.length}）</h2>
          <div className={CARD}>
            {closable.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                categories={categories}
                showParent
                note={<div className="mt-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">シリーズの工程が全部済んだ。閉じていい？</div>}
                actions={<CloseButton task={t} />}
              />
            ))}
          </div>
        </section>
      )}

      {soon.length > 0 && (
        <Fold
          title="近いうちに（7日以内）"
          summary={daySummary(soon, today)}
          open={soonOpen}
          onToggle={() => setSoonOpen(!soonOpen)}
        >
          {byDay(soon, today).map(([date, items]) => (
            <div key={date}>
              <div className="border-b border-zinc-200/70 bg-zinc-50 px-3.5 py-1.5 text-xs text-zinc-500 first:rounded-t-xl dark:border-zinc-800 dark:bg-zinc-800/40">
                {fmtDate(date, today) === fmtMonthDay(date, today)
                  ? fmtMonthDay(date, today)
                  : `${fmtDate(date, today)} ${fmtMonthDay(date, today)}`}
              </div>
              {items.map((n) => (
                <NextRow key={n.task.id} n={n} today={today} now={clock} categories={categories} />
              ))}
            </div>
          ))}
        </Fold>
      )}

      {v.waiting.length > 0 && (
        <Fold
          title="待っているもの"
          summary={`${v.waiting.length} 件（待ち・依存待ち）`}
          open={waitOpen}
          onToggle={() => setWaitOpen(!waitOpen)}
        >
          {v.waiting.map((t) => (
            <TaskRow key={t.id} task={t} today={today} categories={categories} showParent />
          ))}
        </Fold>
      )}

      {done > 0 && (
        <div className="mt-6">
          <button type="button" onClick={() => setShowDone(!showDone)} className="px-7 py-1 text-xs text-zinc-500">
            {showDone ? '▾' : '▸'} 今日完了した {done} 件
          </button>
          {showDone && (
            <div className={cx('mt-1', CARD)}>
              {v.doneToday.map((t) => (
                <TaskRow key={t.id} task={t} today={today} categories={categories} showParent />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 1行: タイトルの下に「なぜそれか」の一言、右（スマホは下の段）に今日やる／明日 */
function NextRow({ n, today, now, categories }: { n: NextItem; today: string; now: string; categories: Map<number, Category> }) {
  return (
    <TaskRow
      task={n.task}
      today={today}
      categories={categories}
      showParent={!n.via}
      carriedOver={n.carriedOver}
      note={
        <div className={cx('mt-0.5 text-xs font-medium', duePassed(n, now) ? TONE.overdue : TONE[n.kind])}>
          {nextReason(n, now)}
        </div>
      }
      actions={<PlanButtons task={n.task} today={today} planned={n.plannedToday} />}
    />
  );
}

/**
 * 今日やる（やる日に今日を入れる・持ち越しの過ぎた日は外す）／明日（今日と過ぎた日を外して明日を入れる）。
 * 今日やると決めたものは「✓ 今日やる」になり、押すと今日を外す
 */
function PlanButtons({ task: t, today, planned }: { task: Task; today: string; planned: boolean }) {
  const set = useWrite((dates: Task['doDates']) => api.setDates(t.id, dates));
  const tomorrow = addDays(today, 1);
  const ahead = t.doDates.filter((d) => d.date > today);
  const todayMin = t.doDates.find((d) => d.date === today)?.minutes ?? null;
  const base = 'rounded-md border px-2.5 py-1 text-xs';
  const off = cx(base, 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300');
  return (
    <>
      {planned ? (
        <button
          type="button"
          className={cx(base, 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300')}
          onClick={() => set.mutate(t.doDates.filter((d) => d.date !== today))}
        >
          ✓ 今日やる
        </button>
      ) : (
        <button
          type="button"
          className={off}
          onClick={() =>
            set.mutate([...ahead, { date: today, minutes: null }], { onSuccess: () => toast(`${t.code} を今日やるに入れた`) })
          }
        >
          今日やる
        </button>
      )}
      <button
        type="button"
        className={off}
        onClick={() =>
          set.mutate([...ahead.filter((d) => d.date !== tomorrow), { date: tomorrow, minutes: todayMin }], {
            onSuccess: () => toast(`${t.code} を明日に回した`),
          })
        }
      >
        明日
      </button>
    </>
  );
}

function Fold({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <button type="button" onClick={onToggle} className={cx(H2, 'flex w-full items-baseline gap-2 text-left')}>
        <span className="shrink-0">
          {open ? '▾' : '▸'} {title}
        </span>
        <span className="min-w-0 truncate font-normal">{summary}</span>
      </button>
      {open && <div className={cx(CARD, 'overflow-hidden')}>{children}</div>}
    </section>
  );
}

/** 締切の日（親から受け継いだものは親の締切）ごとにまとめる */
function byDay(items: NextItem[], today: string): [string, NextItem[]][] {
  const m = new Map<string, NextItem[]>();
  for (const n of items) {
    const d = addDays(today, n.daysLeft ?? 0);
    m.set(d, [...(m.get(d) ?? []), n]);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** 「明日 2・10/17(金) 3」 */
function daySummary(items: NextItem[], today: string): string {
  return byDay(items, today)
    .map(([d, xs]) => `${fmtDate(d, today)} ${xs.length}`)
    .join('・');
}

/**
 * Google カレンダーとのつながりが切れていたら目立たせる（design 4-7）。
 * 一度つないだことがある（予定を覚えている）のに今つながっていない＝通知が止まっている。
 * 同意画面が「テスト」のままだと7日で切れるので、つなぎ直しを促す。
 */
function GcalWarning() {
  const { data: st } = useQuery({ queryKey: ['gcal'], queryFn: api.gcalStatus, staleTime: 60_000 });
  if (!st || !st.configured || st.connected || st.events === 0) return null;
  return (
    <Link
      to="/settings"
      className="mx-4 mb-2 block rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
    >
      ⚠ Google カレンダーとのつながりが切れている（予定と通知が止まっている）。PC で 設定 →「Google につなぐ」から、つなぎ直して。
    </Link>
  );
}
