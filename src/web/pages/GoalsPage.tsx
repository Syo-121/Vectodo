// 目標の一覧（design 7-15）: 1目標1枚のカード（今の進み具合・状態の一言・バー・最近の期間の帯・連続達成）。
// カードを押すと詳細（/goals/:id）、右の［＋1］［＋ 記録］で記録する。カードはその場で開かない（中身は詳細で見る）。

import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { fmtAmount, goalRuleText } from '../../shared/goals.ts';
import type { Goal } from '../../shared/types.ts';
import { useGoals } from '../api.ts';
import { GoalBar, GoalStrip, LogButton, streakText } from '../components/GoalParts.tsx';
import { GoalFormSheet } from '../components/GoalSheets.tsx';
import { PageHeader } from '../components/Layout.tsx';
import { currentHeading, currentSum, isAchieved, statusText } from '../goalView.ts';
import { CARD, clientToday, cx } from '../util.ts';

export function GoalsPage() {
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { data: goals = [], isLoading } = useGoals();
  const { data: archived = [] } = useGoals(true);
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader title="目標">
        <button type="button" onClick={() => setAdding(true)} className="rounded-full bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white">
          ＋ 目標
        </button>
      </PageHeader>

      {isLoading && <p className="p-4 text-sm text-zinc-400">読み込み中…</p>}
      {!isLoading && goals.length === 0 && (
        <div className={cx(CARD, 'px-6 py-10 text-center')}>
          <p className="text-3xl">🎯</p>
          <p className="mt-2 font-medium">目標はまだない</p>
          <p className="mt-1 text-sm text-zinc-500">「週に2回プール」「1日に10ページ」「12/31 までに 300ページ」のように決めて、続けられているかを見る。</p>
          <button type="button" onClick={() => setAdding(true)} className="mt-4 rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
            ＋ 目標を作る
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 md:px-4 md:[&>*]:mx-0">
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
            <div className="mt-2 grid grid-cols-1 items-start gap-3 opacity-70 md:grid-cols-2 md:px-4 md:[&>*]:mx-0">
              {archived.map((g) => (
                <GoalCard key={g.id} g={g} />
              ))}
            </div>
          )}
        </div>
      )}

      {adding && <GoalFormSheet onClose={() => setAdding(false)} onCreated={(id) => navigate(`/goals/${id}`)} />}
    </div>
  );
}

/** 1枚のカード。左（押すと詳細）と右の記録のボタンを分ける（ボタンを押しても詳細へ飛ばない） */
function GoalCard({ g }: { g: Goal }) {
  const today = clientToday();
  const done = isAchieved(g);
  const streak = streakText(g);
  return (
    <div className={cx(CARD, 'flex items-start')}>
      <Link to={`/goals/${g.id}`} className="min-w-0 flex-1 p-4 pr-2">
        <h2 className="truncate font-semibold">{g.title}</h2>
        <div className="truncate text-xs text-zinc-400">
          {goalRuleText(g)}・{g.kind === 'rate' ? currentHeading(g, today) : g.progress.daysLeft ? `残り${g.progress.daysLeft}日` : '期限を過ぎた'}
        </div>
        <div className="mt-2 flex items-baseline gap-1.5 whitespace-nowrap">
          <span className={cx('text-3xl font-bold tabular-nums', done && 'text-emerald-600 dark:text-emerald-400')}>{currentSum(g)}</span>
          <span className="text-sm text-zinc-400">/ {fmtAmount(g.target, g.unit)}</span>
        </div>
        <GoalBar g={g} className="mt-1.5" />
        <div className="mt-2 flex items-baseline gap-2">
          <p className={cx('min-w-0 flex-1 text-sm', done ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-300')}>
            {statusText(g, today)}
          </p>
          {streak && <span className="shrink-0 text-xs whitespace-nowrap text-amber-600 dark:text-amber-400">{streak}</span>}
        </div>
        {g.kind === 'rate' && (
          <div className="mt-2.5">
            <GoalStrip g={g} />
          </div>
        )}
      </Link>
      <div className="p-4 pl-0">
        <LogButton g={g} />
      </div>
    </div>
  );
}
