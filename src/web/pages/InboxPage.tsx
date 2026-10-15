// 受信箱（design 7-5）: 未処理のメモと、タイトルだけで入れたタスク。「すべて／メモ／タスク」で絞り込む。

import { useEffect, useState } from 'react';
import type { Memo } from '../../shared/types.ts';
import { api, useCategories, useInbox, useMemos, useMemoWrite } from '../api.ts';
import { PageHeader, Section } from '../components/Layout.tsx';
import { QuickActions } from '../components/QuickActions.tsx';
import { TaskRow } from '../components/TaskRow.tsx';
import { useOpenTask } from '../nav.ts';
import { useLocalState } from '../storage.ts';
import { toast } from '../toast.ts';
import { CARD, clientToday, cx, fmtDate } from '../util.ts';

type Filter = 'all' | 'memo' | 'task';

export function InboxPage() {
  const [filter, setFilter] = useLocalState<Filter>('inbox.filter', 'all');
  const [showDone, setShowDone] = useState(false);
  const { data: tasks = [], isLoading: loadingTasks } = useInbox();
  const { data: memos = [], isLoading: loadingMemos } = useMemos('open');
  const { data: doneMemos = [] } = useMemos(showDone ? 'done' : 'open');
  const { data: cats = [] } = useCategories();
  const categories = new Map(cats.map((c) => [c.id, c]));
  const today = clientToday();

  const showMemos = filter !== 'task';
  const showTasks = filter !== 'memo';
  const empty = (showMemos ? memos.length : 0) + (showTasks ? tasks.length : 0) === 0;
  const pill = (active: boolean) =>
    cx(
      'rounded-full px-3.5 py-1.5 text-sm',
      active ? 'bg-indigo-600 text-white' : 'bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    );

  return (
    <div>
      <PageHeader title="受信箱" />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-1">
        <button type="button" className={pill(filter === 'all')} onClick={() => setFilter('all')}>
          すべて {memos.length + tasks.length}
        </button>
        <button type="button" className={pill(filter === 'memo')} onClick={() => setFilter('memo')}>
          メモ {memos.length}
        </button>
        <button type="button" className={pill(filter === 'task')} onClick={() => setFilter('task')}>
          タスク {tasks.length}
        </button>
      </div>
      <p className="px-4 pt-2.5 text-xs leading-relaxed text-zinc-500">
        メモは Claude が日記・記録・タスクに振り分けて「済」にする（自分で片付けてもいい）。タスクはカテゴリ・やる日・締切のどれかを付けるとここから消える。
      </p>

      {(loadingTasks || loadingMemos) && <p className="p-4 text-sm text-zinc-400">読み込み中…</p>}
      {!loadingTasks && !loadingMemos && empty && (
        <p className="px-4 py-8 text-center text-sm text-zinc-400">受信箱は空 🎉</p>
      )}

      {showMemos && (
        <Section title="メモ" count={memos.length}>
          {memos.map((m) => (
            <MemoRow key={m.id} memo={m} today={today} />
          ))}
        </Section>
      )}
      {showTasks && (
        <Section title="タイトルだけのタスク" count={tasks.length}>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              today={today}
              categories={categories}
              actions={<QuickActions task={t} today={today} categories={cats} />}
            />
          ))}
        </Section>
      )}

      {showMemos && (
        <div className="mt-6 px-7">
          <button type="button" onClick={() => setShowDone(!showDone)} className="py-1 text-xs text-zinc-500">
            {showDone ? '▾' : '▸'} 処理済みのメモ
          </button>
        </div>
      )}
      {showMemos && showDone && (
        <div className={cx('mt-1', CARD)}>
          {doneMemos.length === 0 && <p className="px-4 py-3 text-xs text-zinc-400">まだない</p>}
          {doneMemos.map((m) => (
            <MemoRow key={m.id} memo={m} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}

function stamp(iso: string, today: string): string {
  return `${fmtDate(iso.slice(0, 10), today)} ${iso.slice(11, 16)}`;
}

function MemoRow({ memo: m, today }: { memo: Memo; today: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  useEffect(() => setDraft(m.body), [m.body]);
  const openTask = useOpenTask();
  const update = useMemoWrite((p: Parameters<typeof api.updateMemo>[1]) => api.updateMemo(m.id, p));
  const remove = useMemoWrite(() => api.deleteMemo(m.id));
  const toTask = useMemoWrite(() => api.memoToTask(m.id));
  const done = m.status === 'done';

  const saveEdit = () => {
    setEditing(false);
    const b = draft.trim();
    if (b && b !== m.body) update.mutate({ body: b });
    else setDraft(m.body);
  };
  const btn = 'rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300';

  return (
    <div className={cx('border-b border-zinc-200/70 px-4 py-3.5 last:border-b-0 dark:border-zinc-800', done && 'opacity-60')}>
      <div className="mb-1.5 flex items-center gap-2 text-xs text-zinc-400">
        <span>✎ {m.code}</span>
        <span>{stamp(m.createdAt, today)}</span>
        {done && m.destination && (
          <span className="text-emerald-600 dark:text-emerald-400">
            → {m.taskId ? (
              <button type="button" className="underline" onClick={() => openTask(m.taskId)}>
                {m.destination}
              </button>
            ) : (
              m.destination
            )}
          </span>
        )}
      </div>
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(m.body);
              setEditing(false);
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) saveEdit();
          }}
          rows={Math.min(12, Math.max(2, draft.split('\n').length + 1))}
          className="w-full resize-none rounded-md border border-indigo-400 bg-transparent px-2 py-1.5 text-[15px] leading-relaxed outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => !done && setEditing(true)}
          className="block w-full text-left text-[15px] leading-relaxed break-words whitespace-pre-wrap"
          title={done ? undefined : '押すと書き直せる'}
        >
          {m.body}
        </button>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {done ? (
          <button type="button" className={btn} onClick={() => update.mutate({ status: 'open' })}>
            未処理に戻す
          </button>
        ) : (
          <>
            <button
              type="button"
              className={btn}
              onClick={() =>
                toTask.mutate(undefined, {
                  onSuccess: (r) => {
                    toast(`${r.task.code} にした`, 'info', { label: '開く', run: () => openTask(r.task.id) });
                  },
                })
              }
            >
              ☑ タスクにする
            </button>
            <button
              type="button"
              className={btn}
              onClick={() =>
                update.mutate(
                  { status: 'done', destination: '自分で処理' },
                  {
                    onSuccess: () =>
                      toast(`${m.code} を済にした`, 'info', {
                        label: '元に戻す',
                        run: () => update.mutate({ status: 'open', destination: null }),
                      }),
                  },
                )
              }
            >
              ✓ 済
            </button>
          </>
        )}
        <button
          type="button"
          className="ml-auto rounded-md px-2 py-1 text-xs text-zinc-400 hover:text-red-600"
          onClick={() => confirm(`${m.code} を削除する？`) && remove.mutate(undefined)}
        >
          削除
        </button>
      </div>
    </div>
  );
}
