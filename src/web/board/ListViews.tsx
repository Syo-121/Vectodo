// 一覧型のビュー（design 7-8）: 重要×緊急・計画待ち・ボトルネック・振り返り。

import { isOpen } from '../../shared/constants.ts';
import type { Category, Task } from '../../shared/types.ts';
import { QuickActions } from '../components/QuickActions.tsx';
import { TaskRow } from '../components/TaskRow.tsx';
import { useOpenTask } from '../nav.ts';
import { cx, fmtDate, fmtSpan } from '../util.ts';
import { bottlenecks, byPriorityDue, planQueue, quadrantOf, reviewDays } from './logic.ts';

interface Common {
  tasks: Task[];
  today: string;
  categories: Map<number, Category>;
}

function Box({ title, note, count, tone, children }: { title: string; note?: string; count: number; tone?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className={cx('flex items-baseline gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800', tone)}>
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-zinc-400">{count}</span>
        {note && <span className="ml-auto text-[11px] text-zinc-400">{note}</span>}
      </div>
      {count === 0 ? <p className="px-3 py-3 text-xs text-zinc-400">なし</p> : children}
    </section>
  );
}

const QUADRANTS: [1 | 2 | 3 | 4, string, string, string][] = [
  [1, '重要 × 緊急', '今すぐやる', 'bg-red-50 dark:bg-red-950/40'],
  [2, '重要 × 緊急でない', '日を決めて計画的に', 'bg-indigo-50 dark:bg-indigo-950/40'],
  [3, '緊急 × 重要でない', 'さっと片付けるか、頼めないか考える', 'bg-amber-50 dark:bg-amber-950/40'],
  [4, 'どちらでもない', '後回し・やめる候補', 'bg-zinc-50 dark:bg-zinc-800/40'],
];

export function MatrixView({ tasks, today, categories }: Common) {
  const open = tasks.filter((t) => isOpen(t.status));
  return (
    <div className="px-4 pb-4">
      <p className="pb-2 text-xs text-zinc-500">重要＝優先度「高」、緊急＝締切が3日以内（期限切れを含む）。</p>
      <div className="grid gap-3 md:grid-cols-2">
        {QUADRANTS.map(([q, title, note, tone]) => {
          const list = open.filter((t) => quadrantOf(t, today) === q).sort(byPriorityDue);
          return (
            <Box key={q} title={`Q${q} ${title}`} note={note} count={list.length} tone={tone}>
              {list.map((t) => (
                <TaskRow key={t.id} task={t} today={today} categories={categories} showParent />
              ))}
            </Box>
          );
        })}
      </div>
    </div>
  );
}

export function PlanView({ tasks, today, categories }: Common) {
  const list = planQueue(tasks);
  return (
    <div className="px-4 pb-4">
      <p className="pb-2 text-xs text-zinc-500">締切はあるのに、やる日がまだ決まっていないもの。行から今日・明日・日付を入れると、ここから消える。</p>
      <Box title="計画待ち" count={list.length}>
        {list.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            today={today}
            categories={categories}
            showParent
            actions={<QuickActions task={t} today={today} pickDate />}
          />
        ))}
      </Box>
    </div>
  );
}

export function BottleneckView({ tasks, today, categories }: Common) {
  const list = bottlenecks(tasks);
  const openTask = useOpenTask();
  return (
    <div className="space-y-3 px-4 pb-4">
      <p className="text-xs text-zinc-500">
        ほかのタスクを待たせていて、いま手を付けられるもの。上ほど、片付けると先へ進むタスクが多い（連鎖の数＝間接的に待っているものも含めた総数）。自分も依存待ちのものは出さない（その分は先頭のタスクの連鎖に入っている）。
      </p>
      {list.length === 0 && <p className="py-6 text-center text-sm text-zinc-400">いま片付けると先へ進めるタスクはない</p>}
      {list.map((b) => (
        <section key={b.task.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <TaskRow task={b.task} today={today} categories={categories} showParent />
          <div className="px-3 py-2 text-xs text-zinc-500">
            <div className="mb-1 flex flex-wrap gap-x-3">
              <span>
                待っている <b className="text-zinc-800 dark:text-zinc-200">{b.waiters.length}</b> 件
              </span>
              <span>
                完了ですぐ着手できる <b className="text-emerald-600 dark:text-emerald-400">{b.freed}</b> 件
              </span>
              <span>連鎖 {b.downstream} 件</span>
            </div>
            <ul className="space-y-0.5">
              {b.waiters.map((w) => (
                <li key={w.id}>
                  <button type="button" onClick={() => openTask(w.id)} className="text-left hover:underline">
                    → <span className="text-zinc-400">{w.code}</span> {w.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}

export function ReviewView({ tasks, today, categories, since }: Common & { since: string }) {
  const days = reviewDays(tasks, since);
  const done = days.flatMap((d) => d.tasks).filter((t) => t.status === 'done');
  const byCat = new Map<number | null, number>();
  for (const t of done) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + 1);
  // 見積の当たり具合（design 4-12）: かかった時間と見積の両方があるものだけで比べる
  const both = done.filter((t) => t.actualMin !== null && t.estimateMin !== null);
  const actual = both.reduce((s, t) => s + t.actualMin!, 0);
  const estimate = both.reduce((s, t) => s + t.estimateMin!, 0);
  const sumActual = (ts: Task[]) => ts.reduce((s, t) => s + (t.actualMin ?? 0), 0);

  return (
    <div className="space-y-3 px-4 pb-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-sm">
          直近7日で <b className="text-lg">{done.length}</b> 件完了
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
          {[...byCat.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([cid, n]) => {
              const c = cid !== null ? categories.get(cid) : undefined;
              return (
                <span key={cid ?? 'none'} className="flex items-center gap-1">
                  {c && <span className="size-2 rounded-full" style={{ background: c.color }} />}
                  {c?.name ?? 'カテゴリなし'} {n}
                </span>
              );
            })}
        </div>
        {both.length > 0 && (
          <div className="mt-2 text-xs text-zinc-500">
            見積の当たり具合（かかった時間を残した {both.length} 件）: 実績 {fmtSpan(actual)}／見積 {fmtSpan(estimate)}
            <span className={cx('ml-1 font-medium', actual > estimate * 1.2 ? 'text-amber-600 dark:text-amber-400' : '')}>
              ＝見積の {(actual / estimate).toFixed(1)} 倍
            </span>
          </div>
        )}
      </div>
      {days.length === 0 && <p className="py-6 text-center text-sm text-zinc-400">直近7日に終わったものはない</p>}
      {days.map((d) => (
        <Box
          key={d.date}
          title={fmtDate(d.date, today)}
          count={d.tasks.length}
          note={sumActual(d.tasks) > 0 ? `実績 ${fmtSpan(sumActual(d.tasks))}` : undefined}
        >
          {d.tasks.map((t) => (
            <TaskRow key={t.id} task={t} today={today} categories={categories} showParent hideDoDates />
          ))}
        </Box>
      ))}
    </div>
  );
}
