// 即追加の「詳しく」（design 7-2）。タイトル・カテゴリ・優先度・締切・やる日・見積・親・先にやる・繰り返し・メモを
// 1画面で入れて、「作成」で1回だけ保存する（途中で閉じたら何も残らない）。
// 保存したあと閉じるかは、即追加のタスク・メモと同じ設定（addAfter.ts）に従う。続けて入れるときは、
// カテゴリと親だけ残して次へ（同じ親の子を続けて作りやすくする）。
// つながっていないときは、ほかの即追加と同じく端末に溜めて、つながったら送る（outbox.ts）。

import { useEffect, useRef, useState } from 'react';
import type { RecurrenceInput, TaskCreateInput } from '../../shared/schemas.ts';
import type { Category, Task } from '../../shared/types.ts';
import { useAddAfter } from '../addAfter.ts';
import { api, useWrite } from '../api.ts';
import { useOpenTask } from '../nav.ts';
import { sendOrQueue } from '../outbox.ts';
import { toast } from '../toast.ts';
import { addDays, clientToday, cx, ESTIMATES, fmtMin } from '../util.ts';
import { DatePicker } from './DatePicker.tsx';
import { Buttons, chip } from './SheetParts.tsx';
import { TaskPicker } from './TaskPicker.tsx';

type Picked = Pick<Task, 'id' | 'code' | 'title' | 'categoryId'>;
type DoDate = { date: string; minutes: number | null; start: string | null };
type RecKind = RecurrenceInput['kind'] | 'none';

const rowCls = 'border-t border-zinc-200 py-3 dark:border-zinc-800';
const labelCls = 'mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400';
const inputCls =
  'rounded-md border border-zinc-300 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700';
const smallBtn = 'rounded-md border border-zinc-300 px-2.5 py-1 text-sm dark:border-zinc-700';

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
const MINUTES: [number | null, string][] = [[null, '時間'], ...ESTIMATES];

export function FullTaskForm({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [priority, setPriority] = useState<1 | 2 | 3 | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueTime, setDueTime] = useState('');
  const [doDates, setDoDates] = useState<DoDate[]>([]);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [parent, setParent] = useState<Picked | null>(null);
  const [deps, setDeps] = useState<Picked[]>([]);
  const [picking, setPicking] = useState<'parent' | 'dep' | null>(null);
  const [recKind, setRecKind] = useState<RecKind>('none');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [monthDay, setMonthDay] = useState(() => Number(clientToday().slice(8, 10)));
  const [intervalDays, setIntervalDays] = useState(7);
  const [anchor, setAnchor] = useState<'do' | 'due'>('do');
  const [notes, setNotes] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const openTask = useOpenTask();
  const [after] = useAddAfter();
  // 保存の返事が来たらすぐ欄を空ける・閉じる（画面の取り直しは待たない・即追加のタスクと同じ）
  const create = useWrite((input: TaskCreateInput) => sendOrQueue({ kind: 'task', input }, () => api.create(input)), [['tasks']], {
    wait: false,
  });

  useEffect(() => titleRef.current?.focus(), []);

  const today = clientToday();
  const catName = (id: number | null) => categories.find((c) => c.id === id)?.name;

  /** 続けて入れるとき: カテゴリと親だけ残す */
  const reset = () => {
    setTitle('');
    setPriority(null);
    setDueDate(null);
    setDueTime('');
    setDoDates([]);
    setEstimate(null);
    setDeps([]);
    setPicking(null);
    setRecKind('none');
    setWeekdays([]);
    setNotes('');
    titleRef.current?.focus();
  };

  const recurrence = (): RecurrenceInput | undefined | 'invalid' => {
    switch (recKind) {
      case 'none':
        return undefined;
      case 'weekly':
        if (weekdays.length === 0) return 'invalid';
        return { kind: 'weekly', weekdays: [...weekdays].sort((a, b) => a - b), anchor };
      case 'monthly':
        return { kind: 'monthly', monthDay, anchor };
      default:
        return { kind: recKind, intervalDays, anchor };
    }
  };

  const submit = () => {
    const t = title.trim();
    if (!t || create.isPending) return;
    const rec = recurrence();
    if (rec === 'invalid') {
      toast('繰り返しの曜日を1つ以上選んで', 'error');
      return;
    }
    const input: TaskCreateInput = {
      title: t,
      parentId: parent?.id,
      categoryId: categoryId ?? undefined,
      priority: priority ?? undefined,
      dueDate: dueDate ?? undefined,
      dueTime: dueDate && dueTime ? dueTime : undefined,
      estimateMin: estimate ?? undefined,
      notes: notes.trim() ? notes : undefined,
      doDates: doDates.length ? doDates : undefined,
      dependsOn: deps.length ? deps.map((d) => d.id) : undefined,
      recurrence: rec,
    };
    create.mutate(input, {
      onSuccess: (task) => {
        if (!task) toast('つながっていないので溜めた（つながったら追加する）');
        else toast(`${task.code} を追加`, 'info', { label: '開く', run: () => openTask(task.id) });
        if (after === 'close') onClose();
        else reset();
      },
    });
  };

  const addDoDate = (d: string) => {
    if (doDates.some((x) => x.date === d)) return;
    setDoDates([...doDates, { date: d, minutes: null, start: null }].sort((a, b) => a.date.localeCompare(b.date)));
  };
  const editDoDate = (i: number, patch: Partial<DoDate>) =>
    setDoDates(doDates.map((x, j) => (j === i ? { ...x, ...patch } : x)).sort((a, b) => a.date.localeCompare(b.date)));

  return (
    <div
      onKeyDown={(e) => {
        // Ctrl＋Enter（⌘＋Enter）はどの欄からでも作成（変換の確定中は除く）
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          // 詳しく入れる画面なので、Enter だけでは作らない（Ctrl＋Enter か「作成」）
          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) e.preventDefault();
        }}
        placeholder="タイトル"
        enterKeyHint="next"
        className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2.5 text-base outline-none focus:border-indigo-500 dark:border-zinc-700"
      />

      <div className={cx(rowCls, 'grid grid-cols-1 gap-3 sm:grid-cols-2')}>
        <div>
          <div className={labelCls}>カテゴリ</div>
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
            className={cx(inputCls, 'w-full')}
          >
            <option value="">
              {parent ? `親と同じ${catName(parent.categoryId) ? `（${catName(parent.categoryId)}）` : '（なし）'}` : 'なし'}
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className={labelCls}>優先度</div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                [null, '－'],
                [1, '高'],
                [2, '中'],
                [3, '低'],
              ] as const
            ).map(([v, label]) => (
              <button key={String(v)} type="button" className={chip(priority === v)} onClick={() => setPriority(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={rowCls}>
        <div className={labelCls}>締切</div>
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker
            value={dueDate}
            onChange={setDueDate}
            clearable
            placeholder="締切なし"
            marks={doDates.map((d) => d.date)}
          />
          <input
            type="time"
            value={dueTime}
            disabled={!dueDate}
            onChange={(e) => setDueTime(e.target.value)}
            className={cx(inputCls, 'min-h-9 disabled:opacity-40')}
            aria-label="締切の時刻"
          />
        </div>
      </div>

      <div className={rowCls}>
        <div className={labelCls}>やる日（いくつでも・日ごとに時間と時刻）</div>
        <div className="space-y-1.5">
          {doDates.map((d, i) => (
            <div key={d.date} className="flex items-center gap-2">
              <DatePicker
                value={d.date}
                onChange={(next) => next && !doDates.some((x) => x.date === next) && editDoDate(i, { date: next })}
                marks={doDates.filter((x) => x.date !== d.date).map((x) => x.date)}
              />
              <select
                value={d.minutes ?? ''}
                onChange={(e) => editDoDate(i, { minutes: e.target.value ? Number(e.target.value) : null })}
                className={inputCls}
              >
                {MINUTES.map(([m, label]) => (
                  <option key={String(m)} value={m ?? ''}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="time"
                step={300}
                value={d.start ?? ''}
                onChange={(e) => editDoDate(i, { start: e.target.value || null })}
                className={cx(inputCls, 'min-h-9 w-[6.5rem]')}
                aria-label="その日の時刻"
              />
              <button type="button" onClick={() => setDoDates(doDates.filter((_, j) => j !== i))} className="text-xs text-zinc-500">
                消す
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {!doDates.some((d) => d.date === today) && (
              <button type="button" onClick={() => addDoDate(today)} className={smallBtn}>
                ＋ 今日
              </button>
            )}
            {!doDates.some((d) => d.date === addDays(today, 1)) && (
              <button type="button" onClick={() => addDoDate(addDays(today, 1))} className={smallBtn}>
                ＋ 明日
              </button>
            )}
            <DatePicker
              value={null}
              onChange={(d) => d && addDoDate(d)}
              marks={doDates.map((x) => x.date)}
              trigger={() => (
                <button type="button" className={smallBtn}>
                  ＋ 日付を選ぶ
                </button>
              )}
            />
          </div>
        </div>
      </div>

      <div className={rowCls}>
        <div className={labelCls}>見積{estimate ? `（${fmtMin(estimate)}）` : ''}</div>
        <div className="flex flex-wrap gap-1.5">
          {([[null, '－'], ...ESTIMATES] as [number | null, string][]).map(([v, label]) => (
            <button key={String(v)} type="button" className={chip(estimate === v)} onClick={() => setEstimate(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={rowCls}>
        <div className={labelCls}>親タスク（シリーズの子にする）</div>
        {picking === 'parent' ? (
          <TaskPicker
            exclude={new Set()}
            placeholder="親にするタスクを検索"
            onPick={(_, t) => {
              setParent(t);
              setPicking(null);
            }}
            onCancel={() => setPicking(null)}
          />
        ) : (
          <div className="flex items-center gap-3 text-sm">
            <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-300">
              {parent ? (
                <>
                  <span className="mr-1.5 text-xs text-zinc-400">{parent.code}</span>
                  {parent.title}
                </>
              ) : (
                'なし（トップレベル）'
              )}
            </span>
            <button type="button" onClick={() => setPicking('parent')} className="shrink-0 text-indigo-600 dark:text-indigo-400">
              {parent ? '変更' : '＋ 選ぶ'}
            </button>
            {parent && (
              <button type="button" onClick={() => setParent(null)} className="shrink-0 text-zinc-500">
                外す
              </button>
            )}
          </div>
        )}
      </div>

      <div className={rowCls}>
        <div className={labelCls}>先にやる（これが終わるまで着手できない）</div>
        <ul className="space-y-1">
          {deps.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="mr-1.5 text-xs text-zinc-400">{d.code}</span>
                {d.title}
              </span>
              <button type="button" onClick={() => setDeps(deps.filter((x) => x.id !== d.id))} className="text-xs text-zinc-500">
                外す
              </button>
            </li>
          ))}
        </ul>
        {picking === 'dep' ? (
          <TaskPicker
            exclude={new Set(deps.map((d) => d.id))}
            placeholder="先にやるタスクを検索"
            onPick={(_, t) => {
              setDeps([...deps, t]);
              setPicking(null);
            }}
            onCancel={() => setPicking(null)}
          />
        ) : (
          <button type="button" onClick={() => setPicking('dep')} className="mt-1 text-sm text-indigo-600 dark:text-indigo-400">
            ＋ 追加
          </button>
        )}
      </div>

      <div className={rowCls}>
        <div className={labelCls}>繰り返し</div>
        <div className="space-y-2">
          <select value={recKind} onChange={(e) => setRecKind(e.target.value as RecKind)} className={inputCls}>
            <option value="none">なし</option>
            <option value="weekly">毎週◯曜</option>
            <option value="monthly">毎月◯日</option>
            <option value="interval">N 日ごと</option>
            <option value="after_done">完了から N 日後</option>
          </select>
          {recKind === 'weekly' && (
            <div className="flex gap-1">
              {WEEKDAYS.map((label, i) => {
                const w = i + 1;
                const on = weekdays.includes(w);
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== w) : [...weekdays, w])}
                    className={cx(
                      'size-8 rounded-full border text-sm',
                      on ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-300 dark:border-zinc-700',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          {recKind === 'monthly' && (
            <label className="flex items-center gap-2 text-sm">
              毎月
              <input
                type="number"
                min={1}
                max={31}
                value={monthDay}
                onChange={(e) => setMonthDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                className={cx(inputCls, 'w-16')}
              />
              日（無い月は月末）
            </label>
          )}
          {(recKind === 'interval' || recKind === 'after_done') && (
            <label className="flex items-center gap-2 text-sm">
              {recKind === 'after_done' ? '完了から' : ''}
              <input
                type="number"
                min={1}
                value={intervalDays}
                onChange={(e) => setIntervalDays(Math.max(1, Number(e.target.value) || 1))}
                className={cx(inputCls, 'w-16')}
              />
              {recKind === 'after_done' ? '日後' : '日ごと'}
            </label>
          )}
          {recKind !== 'none' && (
            <label className="flex items-center gap-2 text-sm">
              日付を入れる先
              <select value={anchor} onChange={(e) => setAnchor(e.target.value as 'do' | 'due')} className={inputCls}>
                <option value="do">やる日</option>
                <option value="due">締切</option>
              </select>
            </label>
          )}
        </div>
      </div>

      <div className={rowCls}>
        <div className={labelCls}>メモ</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={Math.min(10, Math.max(3, notes.split('\n').length + 1))}
          placeholder="自由記述（Markdown）"
          className={cx(inputCls, 'w-full font-mono text-[13px] leading-relaxed')}
        />
      </div>

      {/* 長いので、作成ボタンはいつも見えるように下に貼り付ける */}
      <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-zinc-200 bg-white px-4 pt-3 pb-1 dark:border-zinc-800 dark:bg-zinc-900">
        <span className="hidden text-xs text-zinc-400 md:inline">Ctrl＋Enter で作成</span>
        <Buttons onClose={onClose} onSubmit={submit} disabled={!title.trim() || create.isPending} label="作成" />
      </div>
    </div>
  );
}
