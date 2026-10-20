// ボードの「日」「週」（design 7-8）: 時間割（components/TimeGrid.tsx・今日の流れと同じ操作）と、置くパネル。
// パネルは時間割に重ねない: 広い画面は時間割の右の列、それ以外は画面の下半分。
// 目標をやる時間（design 4-14）も緑で重ねる（動かすと予定の日付・時刻が変わる・押すと記録のシート）。

import { useEffect, useState } from 'react';
import { rankNext } from '../../shared/next.ts';
import type { Category, GoalPlan, OverlayEvent, Task } from '../../shared/types.ts';
import { api, useGoalPlans, useGoalWrite, useSettings } from '../api.ts';
import { PlanSheet } from '../components/GoalSheets.tsx';
import { PlacePanel, usePlacing } from '../components/PlacePanel.tsx';
import { TimeGrid } from '../components/TimeGrid.tsx';
import { useNow } from '../components/TodayFlow.tsx';
import { planOf, planPatch, planTask } from '../goalPlans.ts';
import { useMediaQuery, useWideScreen } from '../media.ts';
import { useOpenTaskId } from '../nav.ts';
import { cx } from '../util.ts';

export function BoardTimeGrid({
  days,
  today,
  tasks,
  pool,
  categories,
  events,
  head,
  onSetDates,
}: {
  days: string[];
  today: string;
  /** 描くタスク（ボードの絞り込みのあと） */
  tasks: Task[];
  /** 置く候補を選ぶ元（絞り込む前の全部・親から子へ受け継ぐのに要る） */
  pool: Task[];
  categories: Map<number, Category>;
  events: OverlayEvent[];
  head?: (date: string) => React.ReactNode;
  onSetDates: (task: Task, dates: Task['doDates']) => Promise<unknown>;
}) {
  const now = useNow();
  const wide = useWideScreen();
  const md = useMediaQuery('(min-width: 768px)');
  const { data: settings } = useSettings();
  const placing = usePlacing(today, now);
  const { slot, close } = placing;
  // 詳細を開いたらパネルは閉じる
  const openId = useOpenTaskId();
  useEffect(() => {
    if (openId !== null) close();
  }, [openId, close]);
  // 候補は「次にやること」の順（今日から見た順）。その日に時刻つきで置いてあるものは除く
  const candidates = slot
    ? rankNext(pool, today).filter((n) => !n.task.doDates.some((d) => d.date === slot.date && d.start))
    : [];
  // 目標をやる時間を、やる日1日だけのタスクの形にして混ぜる
  const { data: plans = [] } = useGoalPlans(days[0]!, days.at(-1)!);
  const [openPlan, setOpenPlan] = useState<GoalPlan | null>(null);
  const movePlan = useGoalWrite((a: { id: number; dates: Task['doDates'] }) => api.updateGoalPlan(a.id, planPatch(a.dates)));
  const setDates = (t: Task, dates: Task['doDates']) => {
    const plan = planOf(t);
    return plan ? movePlan.mutateAsync({ id: plan.id, dates }).catch(() => undefined) : onSetDates(t, dates);
  };

  return (
    <div className={cx('px-4 pb-4', slot && wide && 'grid grid-cols-[minmax(0,1fr)_22rem] items-start gap-3')}>
      <div className="min-w-0">
        <TimeGrid
          className="max-h-[72dvh] bg-white dark:bg-zinc-900"
          days={days}
          today={today}
          now={now}
          events={events}
          tasks={[...tasks, ...plans.map(planTask)]}
          categories={categories}
          dayStart={settings?.dayStartMin ?? 8 * 60}
          dayEnd={settings?.dayEndMin ?? 23 * 60}
          allDayRow
          head={head}
          onPlace={placing.open}
          onSetDates={setDates}
          onOpenPlan={setOpenPlan}
          pending={placing.pending}
          focus={placing.focus}
          // 週はスマホで横にスクロール（1日の幅を潰しすぎない）
          colMin={days.length > 1 && !md ? 84 : 0}
        />
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
          ドラッグで時間を選んでタスクや目標を置く（スマホは長押ししてから・予定の上でもよい＝ながら）。タップならその時刻から。置いたものはドラッグで動かし（別の日へも）、下の端で長さを変える。上の「終日」のものは、時間の欄へ落とすとその時刻に・別の日の終日へ落とすとやる日が移る。Google に時刻つきで入る。緑の枠は目標をやる時間（押すと記録できる）。
        </p>
      </div>
      {openPlan && <PlanSheet plan={openPlan} onClose={() => setOpenPlan(null)} />}
      {slot && (
        <PlacePanel
          slot={slot}
          draft={placing.draft}
          onDraft={placing.setDraft}
          now={now}
          today={today}
          candidates={candidates}
          mode={wide ? 'inline' : 'dock'}
          onClose={close}
        />
      )}
    </div>
  );
}
