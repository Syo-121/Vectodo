// 即追加（design 7-2・7-5）。「タスク／詳しく／メモ／テンプレ」を切り替えられる。タスクとメモは、保存したあと開いたまま続けて入れるか、
// 1件で閉じるかを設定で選ぶ（端末ごと・addAfter.ts。閉じるのは保存できたときだけ＝失敗したら書いたものが残る）。
// 保存の返事が来たらすぐ欄を空ける・閉じる（画面の取り直しは待たない）。返事を待っている間は二度押ししても送らない。
// タスク: Enter で保存。何も選ばなければ受信箱に入る。
// メモ: Enter は改行、Ctrl＋Enter（⌘＋Enter）か「保存」で保存。受信箱に入り、あとで AI が記録やタスクへ振り分ける。
// 詳しく: 全項目を1画面で入れて「作成」で1回だけ保存する（FullTaskForm.tsx）。
// テンプレ: テンプレートを選び、基準日とタイトルを入れて親・子・依存をまとめて作る（design 4-8）。作ったらシートは閉じる。

import { useEffect, useRef, useState } from 'react';
import { anchorLabel, defaultTitle, flatten, offsetLabel } from '../../shared/templates.ts';
import type { Category, Template } from '../../shared/types.ts';
import type { TaskCreateInput } from '../../shared/schemas.ts';
import { useAddAfter } from '../addAfter.ts';
import { api, useMemoWrite, useTemplates, useWrite } from '../api.ts';
import { useOpenTask } from '../nav.ts';
import { sendOrQueue } from '../outbox.ts';
import { toast } from '../toast.ts';
import { addDays, clientToday, cx, fmtDate } from '../util.ts';
import { DatePicker } from './DatePicker.tsx';
import { FullTaskForm } from './FullTaskForm.tsx';
import { Buttons, chip } from './SheetParts.tsx';

export type QuickAddMode = 'task' | 'full' | 'memo' | 'template';

export function QuickAdd({
  categories,
  mode,
  onModeChange,
  onClose,
}: {
  categories: Category[];
  mode: QuickAddMode;
  onModeChange: (m: QuickAddMode) => void;
  onClose: () => void;
}) {
  const tab = (active: boolean) =>
    cx(
      'flex-1 rounded-md py-1.5 text-sm transition',
      active ? 'bg-white font-medium shadow-sm dark:bg-zinc-700' : 'text-zinc-500',
    );
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 md:items-start md:pt-[15vh]" onClick={onClose}>
      <div
        className="pb-safe scroll-hidden max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl md:max-h-[80vh] md:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
          <button type="button" className={tab(mode === 'task')} onClick={() => onModeChange('task')}>
            ☑ タスク
          </button>
          <button type="button" className={tab(mode === 'full')} onClick={() => onModeChange('full')}>
            ☰ 詳しく
          </button>
          <button type="button" className={tab(mode === 'memo')} onClick={() => onModeChange('memo')}>
            ✎ メモ
          </button>
          <button type="button" className={tab(mode === 'template')} onClick={() => onModeChange('template')}>
            ▤ テンプレ
          </button>
        </div>
        {mode === 'task' ? (
          <TaskForm categories={categories} onClose={onClose} />
        ) : mode === 'full' ? (
          <FullTaskForm categories={categories} onClose={onClose} />
        ) : mode === 'memo' ? (
          <MemoForm onClose={onClose} />
        ) : (
          <TemplateForm onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function TaskForm({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const [title, setTitle] = useState('');
  /** やる日（今日・明日・カレンダーで選んだ日） */
  const [doDate, setDoDate] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [priority, setPriority] = useState<1 | 2 | 3 | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const openTask = useOpenTask();
  const [after] = useAddAfter();
  // つながらなければ端末に溜めて、つながったら送る（outbox.ts）
  const create = useWrite((input: TaskCreateInput) => sendOrQueue({ kind: 'task', input }, () => api.create(input)), [['tasks']], {
    wait: false,
  });

  useEffect(() => input.current?.focus(), []);

  const submit = () => {
    const t = title.trim();
    if (!t || create.isPending) return;
    create.mutate(
      {
        title: t,
        categoryId: categoryId ?? undefined,
        priority: priority ?? undefined,
        doDates: doDate ? [{ date: doDate }] : undefined,
      },
      {
        onSuccess: (task) => {
          setTitle('');
          if (!task) toast('つながっていないので溜めた（つながったら追加する）');
          else toast(`${task.code} を追加`, 'info', { label: '開く', run: () => openTask(task.id) });
          if (after === 'close') onClose();
        },
      },
    );
    input.current?.focus();
  };

  const today = clientToday();
  const tomorrow = addDays(today, 1);
  const otherDate = doDate !== null && doDate !== today && doDate !== tomorrow;

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          placeholder="タスクを入力して Enter"
          enterKeyHint="send"
          className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2.5 text-base outline-none focus:border-indigo-500 dark:border-zinc-700"
        />
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={chip(doDate === today)} onClick={() => setDoDate(doDate === today ? null : today)}>
          今日
        </button>
        <button type="button" className={chip(doDate === tomorrow)} onClick={() => setDoDate(doDate === tomorrow ? null : tomorrow)}>
          明日
        </button>
        <DatePicker
          value={doDate}
          onChange={setDoDate}
          clearable
          trigger={() => (
            <button type="button" className={chip(otherDate)}>
              📅 {otherDate ? fmtDate(doDate!, today) : '日付'}
            </button>
          )}
        />
        <select
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
          className={cx(chip(categoryId !== null), 'bg-transparent')}
        >
          <option value="">カテゴリ</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={priority ?? ''}
          onChange={(e) => setPriority(e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : null)}
          className={cx(chip(priority !== null), 'bg-transparent')}
        >
          <option value="">優先度</option>
          <option value="1">高</option>
          <option value="2">中</option>
          <option value="3">低</option>
        </select>
        <Buttons onClose={onClose} onSubmit={submit} disabled={!title.trim()} label="追加" />
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        何も選ばなければ受信箱に入る。
        {after === 'close' ? '1件入れたら閉じる（設定で切り替えられる）。' : '続けて何件でも入れられる。'}
      </p>
    </>
  );
}

function MemoForm({ onClose }: { onClose: () => void }) {
  const [body, setBody] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const [after] = useAddAfter();
  const create = useMemoWrite((b: string) => sendOrQueue({ kind: 'memo', body: b }, () => api.createMemo(b)), { wait: false });

  useEffect(() => area.current?.focus(), []);

  const submit = () => {
    const b = body.trim();
    if (!b || create.isPending) return;
    create.mutate(b, {
      onSuccess: (m) => {
        setBody('');
        toast(m ? `メモを保存（${m.code}）` : 'つながっていないので溜めた（つながったら送る）');
        if (after === 'close') onClose();
      },
    });
    area.current?.focus();
  };

  return (
    <>
      <textarea
        ref={area}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          // 変換の確定（IME）中の Enter では保存しない
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        rows={Math.min(10, Math.max(3, body.split('\n').length + 1))}
        placeholder="思いついたことをそのまま（タスクでなくていい）"
        className="w-full resize-none rounded-lg border border-zinc-300 bg-transparent px-3 py-2.5 text-base leading-relaxed outline-none focus:border-indigo-500 dark:border-zinc-700"
      />
      <div className="mt-3 flex items-center gap-2">
        <span className="hidden text-xs text-zinc-400 md:inline">Ctrl＋Enter で保存</span>
        <Buttons onClose={onClose} onSubmit={submit} disabled={!body.trim()} label="保存" />
      </div>
      <p className="mt-2 text-xs text-zinc-400">受信箱に入る。あとで Claude が日記・記録・タスクなどに振り分ける。</p>
    </>
  );
}

function TemplateForm({ onClose }: { onClose: () => void }) {
  const { data: templates, isLoading } = useTemplates();
  const [picked, setPicked] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  /** null の間は、テンプレートと基準日から自動で入れる */
  const [title, setTitle] = useState<string | null>(null);
  const openTask = useOpenTask();
  const apply = useWrite(
    (a: { id: number; title: string; date: string | null }) => api.applyTemplate(a.id, { title: a.title, date: a.date }),
    [['tasks']],
    { wait: false },
  );
  const today = clientToday();

  if (isLoading) return <p className="py-4 text-sm text-zinc-400">読み込み中…</p>;
  if (!templates?.length) {
    return (
      <>
        <p className="py-3 text-sm leading-relaxed text-zinc-500">
          テンプレートがまだない。子タスクのある親の詳細で「テンプレートとして保存」すると、ここから同じ形（子・依存・見積など）をまとめて作れる。
        </p>
        <div className="flex">
          <Buttons onClose={onClose} onSubmit={onClose} disabled label="作る" />
        </div>
      </>
    );
  }
  const tpl: Template = templates.find((t) => t.id === picked) ?? templates[0]!;
  const { anchor } = tpl.body;
  const shownTitle = title ?? defaultTitle(tpl.body, date);
  const steps = flatten(tpl.body.root);
  const when = (offset: number) => (date ? fmtDate(addDays(date, offset), today) : offsetLabel(offset));

  const submit = () => {
    const t = shownTitle.trim();
    if (!t || apply.isPending) return;
    apply.mutate(
      { id: tpl.id, title: t, date: anchor ? date : null },
      {
        onSuccess: (task) => {
          toast(`${task.code}「${task.title}」を作った（子 ${task.descendantCount} 件）`, 'info', {
            label: '開く',
            run: () => openTask(task.id),
          });
          onClose();
        },
      },
    );
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            className={chip(t.id === tpl.id)}
            onClick={() => {
              setPicked(t.id);
              setTitle(null);
            }}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {anchor ? (
          <>
            <span className="text-zinc-500">{anchorLabel(anchor)}</span>
            <DatePicker
              value={date}
              onChange={setDate}
              clearable
              trigger={() => (
                <button type="button" className={chip(date !== null)}>
                  📅 {date ? fmtDate(date, today) : '日付を選ぶ'}
                </button>
              )}
            />
            {!date && <span className="text-xs text-zinc-400">入れないと日付なしで作る</span>}
          </>
        ) : (
          <span className="text-xs text-zinc-400">このテンプレートは日付を覚えていない（作ってから入れる）</span>
        )}
      </div>

      <input
        value={shownTitle}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        placeholder="親のタイトル"
        className="mt-3 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2.5 text-base outline-none focus:border-indigo-500 dark:border-zinc-700"
      />

      <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/60">
        {steps.map(({ node, depth }) => (
          <li key={node.key} className="flex items-baseline gap-2" style={{ paddingLeft: `${depth}rem` }}>
            <span className={cx('min-w-0 flex-1 truncate', depth === 0 && 'font-medium')}>
              {depth === 0 ? shownTitle || '（親のタイトル）' : node.title}
            </span>
            {node.doOffsets.length > 0 && (
              <span className="shrink-0 text-xs text-indigo-600 dark:text-indigo-400">
                📅{node.doOffsets.map((o) => when(o.offset)).join('・')}
              </span>
            )}
            {node.dueOffset !== null && <span className="shrink-0 text-xs text-red-500">⏰{when(node.dueOffset)}</span>}
          </li>
        ))}
        {tpl.body.deps.length > 0 && (
          <li className="pt-1 text-xs text-zinc-400">依存 {tpl.body.deps.length} 本もそのまま張る</li>
        )}
      </ul>

      <div className="mt-3 flex items-center">
        <Buttons onClose={onClose} onSubmit={submit} disabled={!shownTitle.trim() || apply.isPending} label="作る" />
      </div>
    </>
  );
}
