// 設定（design 7-7）: カテゴリの追加・名前・色・並べ替え・アーカイブ、テンプレート、Google カレンダー、ボード、表示。

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { anchorLabel, flatten } from '../../shared/templates.ts';
import type { Category, Template } from '../../shared/types.ts';
import { api, useCategories, useCategoryWrite, useSettings, useTemplates, useTemplateWrite, useWrite, type AppSettings } from '../api.ts';
import { PageHeader } from '../components/Layout.tsx';
import { setThemePref, useThemePref, type ThemePref } from '../theme.ts';
import { toast } from '../toast.ts';
import { CARD, cx } from '../util.ts';

const H2 = 'px-7 pt-6 pb-2 text-xs font-semibold text-zinc-500';
const PALETTE = ['#6366f1', '#ef4444', '#f59e0b', '#10b981', '#0ea5e9', '#a855f7', '#ec4899', '#8a8a8a'];

export function SettingsPage() {
  const { data: cats = [] } = useCategories(true);
  const [name, setName] = useState('');
  const create = useCategoryWrite(api.createCategory);
  const active = cats.filter((c) => !c.archived);
  const archived = cats.filter((c) => c.archived);

  return (
    <div className="max-w-3xl">
      <PageHeader title="設定" />
      <h2 className={cx(H2, 'pt-3')}>カテゴリ</h2>
      <div className={CARD}>
        {active.map((c, i) => (
          <CategoryRow key={c.id} c={c} prev={active[i - 1]} next={active[i + 1]} />
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (n) create.mutate({ name: n, color: PALETTE[cats.length % PALETTE.length] }, { onSuccess: () => setName('') });
          }}
          className="flex gap-2 p-3.5"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="新しいカテゴリ（例: 始めた開発の名前）"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
          />
          <button type="submit" className="rounded-md bg-indigo-600 px-3 text-sm text-white disabled:opacity-40" disabled={!name.trim()}>
            追加
          </button>
        </form>
      </div>
      {archived.length > 0 && (
        <>
          <h2 className={H2}>アーカイブ済み</h2>
          <div className={CARD}>
            {archived.map((c) => (
              <CategoryRow key={c.id} c={c} />
            ))}
          </div>
        </>
      )}
      <p className="mt-2 px-7 text-xs leading-relaxed text-zinc-400">
        カテゴリはタスク1件に1つ。終わったカテゴリはアーカイブすると、そのタスクが今日・ボード・一覧から隠れる（一覧の「アーカイブしたカテゴリのタスクも出す」で見返せる・戻せば元どおり）。未完了が残っていたら中止にするか聞く。
      </p>

      <h2 className={H2}>先のタスクを隠す</h2>
      <HorizonSetting categories={active} />

      <h2 className={H2}>テンプレート</h2>
      <TemplateSetting />

      <h2 className={H2}>Google カレンダー</h2>
      <GcalSetting categories={active} />

      <h2 className={H2}>今日・ボード</h2>
      <DayRangeSetting />
      <CapacitySetting />

      <h2 className={H2}>表示</h2>
      <ThemeSetting />
    </div>
  );
}

const HORIZONS: [number | null, string][] = [
  [null, '隠さない'],
  [7, '1週間より先'],
  [14, '2週間より先'],
  [30, '1か月より先'],
  [60, '2か月より先'],
];

/** カテゴリごとの「先の分を隠す」と「計画待ちに出さない」（design 4-9） */
function HorizonSetting({ categories }: { categories: Category[] }) {
  const update = useCategoryWrite((a: { id: number; hideAfterDays?: number | null; hideFromPlan?: boolean }) =>
    api.updateCategory(a.id, { hideAfterDays: a.hideAfterDays, hideFromPlan: a.hideFromPlan }),
  );
  return (
    <>
      <div className={CARD}>
        {categories.map((c) => {
          const options = HORIZONS.some(([d]) => d === c.hideAfterDays)
            ? HORIZONS
            : [...HORIZONS, [c.hideAfterDays, `${c.hideAfterDays}日より先`] as [number | null, string]];
          return (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-100 px-3.5 py-3 last:border-b-0 dark:border-zinc-800"
            >
              <span className="flex min-w-24 flex-1 items-center gap-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                {c.name}
              </span>
              <select
                value={c.hideAfterDays ?? ''}
                onChange={(e) => update.mutate({ id: c.id, hideAfterDays: e.target.value === '' ? null : Number(e.target.value) })}
                className="rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
                aria-label={`${c.name} の先の分を隠す`}
              >
                {options.map(([d, label]) => (
                  <option key={d ?? 'none'} value={d ?? ''}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={c.hideFromPlan}
                  onChange={(e) => update.mutate({ id: c.id, hideFromPlan: e.target.checked })}
                />
                計画待ちに出さない
              </label>
            </div>
          );
        })}
      </div>
      <p className="mt-2 px-7 text-xs leading-relaxed text-zinc-400">
        締切（無ければやる日）が先のタスクを、一覧・カンバン・重要×緊急・計画待ちで隠す。日が近づけば自動で出てくる。今日・週・月とカレンダーへの書き出しはそのまま。隠しているときは一覧とボードに「先の分を隠している」と出て、押せば全部見られる。「計画待ちに出さない」は、やる日を付けない決まりのもの（予習など）向け。
      </p>
    </>
  );
}

/** テンプレートの一覧・名前の変更・削除（design 4-8）。作るのは親の詳細から、使うのは＋ボタンの「テンプレ」から */
function TemplateSetting() {
  const { data: templates = [] } = useTemplates();
  return (
    <>
      <div className={CARD}>
        {templates.length === 0 ? (
          <p className="p-3.5 text-sm text-zinc-400">まだない</p>
        ) : (
          templates.map((t) => <TemplateRow key={t.id} t={t} />)
        )}
      </div>
      <p className="mt-2 px-7 text-xs leading-relaxed text-zinc-400">
        子タスクのある親の詳細で「この形をテンプレートとして保存」すると増える（子・孫・依存・カテゴリ・優先度・見積・メモを写す）。使うのは＋ボタンの「テンプレ」から。中身を直したいときは、一度作って直してから同じ名前で保存し直す。
      </p>
    </>
  );
}

function TemplateRow({ t }: { t: Template }) {
  const rename = useTemplateWrite((name: string) => api.renameTemplate(t.id, name));
  const remove = useTemplateWrite(() => api.deleteTemplate(t.id));
  const steps = flatten(t.body.root);
  const base = t.body.anchor ? `日付は親の${anchorLabel(t.body.anchor)}から` : '日付なし';
  return (
    <div className="flex items-center gap-3 border-b border-zinc-100 px-3.5 py-3 last:border-b-0 dark:border-zinc-800">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{t.name}</div>
        <div className="truncate text-xs text-zinc-400">
          {steps.length} 件・依存 {t.body.deps.length} 本・{base}・
          {steps
            .slice(1, 4)
            .map((s) => s.node.title)
            .join(' → ')}
          {steps.length > 4 ? ' …' : ''}
        </div>
      </div>
      <button
        type="button"
        className="text-xs text-zinc-500"
        onClick={() => {
          const name = prompt('テンプレートの新しい名前', t.name)?.trim();
          if (name && name !== t.name) rename.mutate(name);
        }}
      >
        名前
      </button>
      <button
        type="button"
        className="text-xs text-red-500"
        onClick={() => confirm(`テンプレート「${t.name}」を削除する？（作ったタスクはそのまま残る）`) && remove.mutate(undefined)}
      >
        削除
      </button>
    </div>
  );
}

/**
 * Google カレンダーへの一方向同期（design 4-7）。つなぐ・状態・今すぐ同期・書き込み先のカレンダー。
 * 同意画面からは 127.0.0.1 に戻るので、つなぐのは PC のブラウザで。
 */
function GcalSetting({ categories }: { categories: Category[] }) {
  const { data: st } = useQuery({
    queryKey: ['gcal'],
    queryFn: api.gcalStatus,
    refetchInterval: (q) => (q.state.data?.running ? 2000 : 30_000),
  });
  const connected = Boolean(st?.connected);
  const { data: cals = [] } = useQuery({
    queryKey: ['gcal', 'calendars'],
    queryFn: api.gcalCalendars,
    enabled: connected,
    staleTime: 5 * 60_000,
  });
  const { data: settings } = useSettings();
  const sync = useWrite(() => api.gcalSync(), [['gcal']]);
  const disconnect = useWrite(() => api.gcalDisconnect(), [['gcal']]);
  const setDefault = useWrite(
    (id: string) => api.updateSettings({ gcalDefaultCalendarId: id }),
    [['settings'], ['gcal']],
  );
  const setCatCal = useCategoryWrite((a: { id: number; cal: string | null }) =>
    api.updateCategory(a.id, { gcalCalendarId: a.cal }),
  );

  // 同意画面から戻ってきたときの結果（/settings?gcal=ok など）
  const [params, setParams] = useSearchParams();
  const result = params.get('gcal');
  useEffect(() => {
    if (!result) return;
    toast(result === 'ok' ? 'Google カレンダーにつないだ。予定を書き出している' : result, result === 'ok' ? 'info' : 'error');
    setParams({}, { replace: true });
  }, [result, setParams]);

  const connect = async () => {
    try {
      window.location.href = (await api.gcalConnect()).url;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };
  const defaultName = cals.find((c) => c.id === settings?.gcalDefaultCalendarId)?.summary ?? '既定';
  const sel = 'min-w-0 max-w-[60%] rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700';
  const btn = 'rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300';

  if (!st) return <div className={cx(CARD, 'p-4 text-sm text-zinc-400')}>読み込み中…</div>;
  if (!st.configured) {
    return (
      <div className={cx(CARD, 'p-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300')}>
        まだ準備ができていない。Google Cloud で OAuth クライアント（デスクトップ アプリ）を作り、ダウンロードした JSON を WSL の
        <code className="mx-1 text-xs">~/.config/task-app/google-client.json</code>
        に置くと、ここに「つなぐ」が出る。
      </div>
    );
  }
  if (!connected) {
    return (
      <div className={cx(CARD, 'p-4')}>
        <button type="button" onClick={() => void connect()} className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white">
          Google につなぐ
        </button>
        <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
          締切とやる日を Google カレンダーに書き出して、スマホに通知が来るようにする（アプリ → カレンダーの一方向）。⚠ PC のブラウザで押す（同意のあと、この PC のアプリに戻ってくるため）。
        </p>
      </div>
    );
  }
  const r = st.lastResult;
  return (
    <div className={CARD}>
      <div className="p-4">
        <div className="text-sm">
          ✓ つながっている・アプリの予定 {st.events} 件
          {st.running && <span className="ml-2 text-indigo-600 dark:text-indigo-400">同期中…</span>}
        </div>
        {st.lastRunAt && (
          <div className="mt-1 text-xs text-zinc-500">
            最後の同期 {st.lastRunAt.slice(5, 10).replace('-', '/')} {st.lastRunAt.slice(11, 16)}
            {r && `（作成 ${r.created}・更新 ${r.updated}・削除 ${r.deleted}）`}
          </div>
        )}
        {st.lastError && <div className="mt-1.5 text-xs text-red-600 dark:text-red-400">⚠ {st.lastError}</div>}
        <div className="mt-3 flex gap-2">
          <button type="button" className={btn} onClick={() => sync.mutate(undefined)} disabled={sync.isPending}>
            今すぐ同期
          </button>
          <button
            type="button"
            className={cx(btn, 'ml-auto text-zinc-400')}
            onClick={() => confirm('Google カレンダーとの同期を止める？（書き出した予定はそのまま残る）') && disconnect.mutate(undefined)}
          >
            切る
          </button>
        </div>
      </div>
      <div className="border-t border-zinc-200/70 px-4 pt-3 pb-4 dark:border-zinc-800">
        <div className="mb-2 text-xs font-medium text-zinc-500">書き込み先のカレンダー</div>
        <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
          <span>既定（下で選ばなかったカテゴリ・カテゴリなし）</span>
          <select className={sel} value={settings?.gcalDefaultCalendarId ?? ''} onChange={(e) => setDefault.mutate(e.target.value)}>
            {!settings?.gcalDefaultCalendarId && <option value="">（選ぶ）</option>}
            {cals.map((c) => (
              <option key={c.id} value={c.id}>
                {c.summary}
              </option>
            ))}
          </select>
        </label>
        {categories.map((c) => (
          <label key={c.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: c.color }} />
              {c.name}
            </span>
            <select
              className={sel}
              value={c.gcalCalendarId ?? ''}
              onChange={(e) => setCatCal.mutate({ id: c.id, cal: e.target.value || null })}
            >
              <option value="">既定（{defaultName}）</option>
              {cals.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.summary}
                </option>
              ))}
            </select>
          </label>
        ))}
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          締切は「【締切16:00】」、やる日は「【タスク】」で書き出す（通知は前日20時＋時刻つきの締切は2時間前）。完了・中止すると【済】【中止】になる。やる日・締切を消すと、アプリが作った予定は消える（自分で入れた予定にはさわらない）。過去の予定はそのまま。
        </p>
      </div>
    </div>
  );
}

const THEMES: [ThemePref, string][] = [
  ['system', 'システムに合わせる'],
  ['light', 'ライト'],
  ['dark', 'ダーク'],
];

function ThemeSetting() {
  const pref = useThemePref();
  return (
    <div className={cx(CARD, 'p-4')}>
      <div className="flex flex-wrap gap-2">
        {THEMES.map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setThemePref(v)}
            className={cx(
              'rounded-md border px-3 py-1.5 text-sm',
              pref === v
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-zinc-400">この端末だけの設定（スマホと PC で別々に選べる）。</p>
    </div>
  );
}

/** 30分きざみ（0:00 からの分） */
const halfHours = (from: number, to: number) => Array.from({ length: (to - from) / 30 + 1 }, (_, i) => from + i * 30);
const clock = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

/** 今日の流れ（design 4-11）の「空き」を数える時間帯 */
function DayRangeSetting() {
  const { data } = useSettings();
  const save = useWrite((p: Partial<AppSettings>) => api.updateSettings(p), [['settings']]);
  const start = data?.dayStartMin ?? 8 * 60;
  const end = data?.dayEndMin ?? 23 * 60;
  const select = 'rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700';
  return (
    <div className={cx(CARD, 'mb-3 p-4')}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        起きている時間
        <select value={start} onChange={(e) => save.mutate({ dayStartMin: Number(e.target.value) })} className={select}>
          {halfHours(4 * 60, 12 * 60).map((m) => (
            <option key={m} value={m} disabled={m >= end}>
              {clock(m)}
            </option>
          ))}
        </select>
        〜
        <select value={end} onChange={(e) => save.mutate({ dayEndMin: Number(e.target.value) })} className={select}>
          {halfHours(18 * 60, 24 * 60).map((m) => (
            <option key={m} value={m} disabled={m <= start}>
              {clock(m)}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
        今日の「今日の流れ」で、この時間帯のうち Google の予定が入っていない時間を「空き」に数える（15分未満のすき間は数えない）。
      </p>
    </div>
  );
}

const CAPACITY_CHOICES = [2, 3, 4, 5, 6, 7, 8, 10, 12];

function CapacitySetting() {
  const { data } = useSettings();
  const save = useWrite((dailyCapacityMin: number) => api.updateSettings({ dailyCapacityMin }), [['settings']]);
  const hours = (data?.dailyCapacityMin ?? 360) / 60;
  return (
    <div className={cx(CARD, 'p-4')}>
      <label className="flex items-center gap-2 text-sm">
        1日に使えるタスク時間
        <select
          value={CAPACITY_CHOICES.includes(hours) ? hours : ''}
          onChange={(e) => save.mutate(Number(e.target.value) * 60)}
          className="rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
        >
          {!CAPACITY_CHOICES.includes(hours) && <option value="">{hours}時間</option>}
          {CAPACITY_CHOICES.map((h) => (
            <option key={h} value={h}>
              {h}時間
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
        週ビューで、この8割を超えた日は黄色、超えた日は赤で知らせる。今日の右上も、Google につながっていないときはこれと比べる。
      </p>
    </div>
  );
}

function CategoryRow({ c, prev, next }: { c: Category; prev?: Category; next?: Category }) {
  const [name, setName] = useState(c.name);
  useEffect(() => setName(c.name), [c.name]);
  const update = useCategoryWrite((p: Parameters<typeof api.updateCategory>[1]) => api.updateCategory(c.id, p));
  const swap = useCategoryWrite(async (other: Category) => {
    await api.updateCategory(c.id, { position: other.position });
    return api.updateCategory(other.id, { position: c.position });
  });
  const small = 'rounded px-1.5 py-1 text-xs text-zinc-500 disabled:opacity-30';

  // アーカイブ（design 4-6）: 未完了が残っていたら、名前を見せて中止にするか聞く
  const toggleArchive = async () => {
    if (c.archived) {
      update.mutate({ archived: false }, { onSuccess: () => toast(`「${c.name}」を戻した`) });
      return;
    }
    const open = await api.all({ categoryId: c.id }).catch(() => null);
    if (open === null) return toast('未完了のタスクを確かめられなかった', 'error');
    const list = open
      .slice(0, 5)
      .map((t) => `・${t.code} ${t.title}`)
      .join('\n');
    const msg = open.length
      ? `「${c.name}」に未完了のタスクが ${open.length} 件ある:\n${list}${open.length > 5 ? `\n・ほか ${open.length - 5} 件` : ''}\n\n全部「中止」にしてアーカイブする？\n（残したいものは、先に別のカテゴリへ移しておく）`
      : `「${c.name}」をアーカイブする？\nこのカテゴリのタスクは今日・ボード・一覧から隠れる（一覧で見返せる・戻せば元どおり）。`;
    if (!confirm(msg)) return;
    update.mutate(
      { archived: true, cancelOpen: open.length > 0 },
      { onSuccess: () => toast(`「${c.name}」をアーカイブした${open.length ? `（${open.length} 件を中止）` : ''}`) },
    );
  };

  return (
    <div className="flex items-center gap-3 border-b border-zinc-200/70 px-4 py-3 last:border-b-0 dark:border-zinc-800">
      <label className="relative size-5 shrink-0 cursor-pointer rounded-full" style={{ background: c.color }}>
        <input
          type="color"
          value={c.color}
          onChange={(e) => update.mutate({ color: e.target.value })}
          className="absolute inset-0 opacity-0"
          aria-label="色"
        />
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name.trim() !== c.name ? update.mutate({ name: name.trim() }) : setName(c.name)}
        className={cx('min-w-0 flex-1 bg-transparent text-sm outline-none', c.archived && 'text-zinc-400')}
      />
      {!c.archived && (
        <>
          <button type="button" className={small} disabled={!prev} onClick={() => prev && swap.mutate(prev)} aria-label="上へ">
            ↑
          </button>
          <button type="button" className={small} disabled={!next} onClick={() => next && swap.mutate(next)} aria-label="下へ">
            ↓
          </button>
        </>
      )}
      <button type="button" className={small} onClick={() => void toggleArchive()}>
        {c.archived ? '戻す' : 'アーカイブ'}
      </button>
    </div>
  );
}
