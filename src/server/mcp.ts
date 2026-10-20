// MCP（設計の正= docs/design.md 6章）。アプリ本体の /mcp に同居し、画面と同じサービス層を通る。
// ⛔ 削除のツールは持たせない（AI は中止まで）。

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { parseMemoRef, parseNoteRef, parseTaskRef } from '../shared/ids.ts';
import { zDate, zMemoBody, zPriority, zStatus, zTime } from '../shared/schemas.ts';
import { NOTE_COLORS } from '../shared/constants.ts';
import { nextSteps } from '../shared/series.ts';
import type { Category } from '../shared/types.ts';
import type { Services } from './api.ts';
import { AppError, badRequest } from './errors.ts';
import { goalDetailText, goalLine, goalPlanLine, memoText, noteText, taskDetailText, taskLine, templateText, todayText } from './format.ts';

const zRef = z.union([z.number(), z.string()]).describe('タスク番号（例: "T-130"・"130"・130）');
const zCategoryRef = z
  .union([z.number(), z.string()])
  .describe('カテゴリ名（例: "勉強"）またはカテゴリ番号。list_categories で確認できる');
const zDoDates = z
  .array(
    z.object({
      date: zDate,
      minutes: z.number().int().positive().nullable().optional(),
      start: zTime.nullable().optional(),
    }),
  )
  .describe(
    'やる日（複数可）。minutes はその日に割り当てる時間（分）。start はその日にやる時刻 HH:MM（省くと今の時刻のまま・null で消す。入れると Google に時刻つきの予定として書き出される）',
  );

const taskFields = {
  title: z.string().trim().min(1).max(500).optional(),
  parent: zRef.nullable().optional().describe('親タスクの番号（子タスクにする）。null で親から外す'),
  status: zStatus.optional().describe('todo=未着手 doing=進行中 waiting=待ち（他人・結果待ち） done=完了 canceled=中止'),
  category: zCategoryRef.nullable().optional(),
  priority: zPriority.nullable().optional().describe('1=高 2=中 3=低'),
  due_date: zDate.nullable().optional().describe('締切日 YYYY-MM-DD'),
  due_time: zTime.nullable().optional().describe('締切時刻 HH:MM（締切日が必要）'),
  estimate_min: z.number().int().positive().nullable().optional().describe('見積（分）'),
  notes: z.string().optional().describe('メモ（Markdown）。update では丸ごと置き換わる'),
};

function text(s: string) {
  return { content: [{ type: 'text' as const, text: s }] };
}

function ref(r: string | number, what = 'タスク番号'): number {
  const id = parseTaskRef(r);
  if (id === null) throw badRequest(`${what}が読めない: ${r}`);
  return id;
}

export function createMcpServer(s: Services): McpServer {
  const server = new McpServer({ name: 'task-app', version: '1.0.0' });

  const cats = () => new Map<number, Category>(s.categories.list(true).map((c) => [c.id, c]));
  const categoryId = (r: string | number | null | undefined): number | null | undefined => {
    if (r === undefined || r === null) return r;
    const all = s.categories.list(true);
    const hit = typeof r === 'number' ? all.find((c) => c.id === r) : all.find((c) => c.name === r.trim());
    if (!hit) throw badRequest(`カテゴリ「${r}」はない。いまあるのは: ${all.map((c) => c.name).join('・') || '（なし）'}`);
    return hit.id;
  };
  const detail = (id: number) => text(taskDetailText(s.tasks.get(id), cats()));

  /** エラーは AI が読める文章で返す */
  const safe =
    <A>(fn: (args: A) => ReturnType<typeof text>) =>
    async (args: A) => {
      try {
        return fn(args);
      } catch (e) {
        const msg =
          e instanceof AppError
            ? e.message
            : e instanceof z.ZodError
              ? e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
              : String(e);
        return { ...text(`エラー: ${msg}`), isError: true };
      }
    };

  server.registerTool(
    'list_tasks',
    {
      description:
        'タスクの一覧。view=today は「次にやること・期限切れ・今日やる（持ち越し含む）・締切間近7日・シリーズの締切・子が全部終わった親（閉じる？）・今日完了」、all は未完了の全件（include_done で完了・中止も）、inbox はタイトルだけで入った未整理のもの。子が残っている親は「シリーズ 0/7 次:T-155」（次＝いま着手できる子）と出る——親はまとめ役で、やることは子のほう。',
      inputSchema: {
        view: z.enum(['today', 'all', 'inbox']).default('today'),
        category: zCategoryRef.optional(),
        query: z.string().optional().describe('タイトル・メモ・番号で検索（view=all のとき）'),
        include_done: z.boolean().optional().describe('完了・中止を全期間ぶん含める'),
        done_since: zDate
          .optional()
          .describe('未完了に加えて、この日以降に完了・中止したものも含める（振り返り用。例: 7日前の日付）'),
        include_archived: z
          .boolean()
          .optional()
          .describe('アーカイブしたカテゴリのタスクも含める（既定は隠す。category を指定したときは常に含む）'),
      },
      annotations: { readOnlyHint: true },
    },
    safe(({ view, category, query, include_done, done_since, include_archived }) => {
      const c = cats();
      if (view === 'today') return text(todayText(s.tasks.today(), c));
      const list =
        view === 'inbox'
          ? s.tasks.inbox()
          : s.tasks.all({
              categoryId: categoryId(category) ?? undefined,
              q: query,
              includeDone: include_done,
              doneSince: done_since,
              includeArchived: include_archived,
            });
      // 親の「次:」は、絞り込みで子が抜けないよう未完了の全件から求める
      const steps = new Map(
        [...nextSteps(view === 'all' ? s.tasks.all({ includeArchived: true }) : list)].map(([id, ts]) => [
          id,
          ts.map((t) => t.code),
        ]),
      );
      return text(list.length ? list.map((t) => taskLine(t, c, steps)).join('\n') : '（該当なし）');
    }),
  );

  server.registerTool(
    'get_task',
    {
      description: 'タスク1件の詳細（メモ・子タスク・依存の両方向・繰り返し）。',
      inputSchema: { id: zRef },
      annotations: { readOnlyHint: true },
    },
    safe(({ id }) => detail(ref(id))),
  );

  server.registerTool(
    'add_task',
    {
      description: 'タスクを追加する。title 以外は省略可。子タスクは parent を指定（カテゴリは親から引き継ぐ）。',
      inputSchema: {
        ...taskFields,
        title: z.string().trim().min(1).max(500),
        do_dates: zDoDates.optional(),
        depends_on: z.array(zRef).optional().describe('先にやるタスクの番号'),
      },
    },
    safe((a) => {
      const t = s.tasks.create({
        title: a.title,
        parentId: a.parent == null ? undefined : ref(a.parent, '親タスクの番号'),
        status: a.status,
        categoryId: categoryId(a.category),
        priority: a.priority ?? undefined,
        dueDate: a.due_date ?? undefined,
        dueTime: a.due_time ?? undefined,
        estimateMin: a.estimate_min ?? undefined,
        notes: a.notes,
        doDates: a.do_dates,
        dependsOn: a.depends_on?.map((d) => ref(d, '依存先の番号')),
      });
      return text(`追加した:\n${taskDetailText(t, cats())}`);
    }),
  );

  server.registerTool(
    'update_task',
    {
      description:
        'タスクを部分更新する（渡した項目だけ変わる・null で消す）。完了は status=done、今回は飛ばす／やめるは canceled。繰り返しのタスクは完了・中止すると次の回が自動でできる。',
      inputSchema: {
        id: zRef,
        ...taskFields,
        actual_min: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe('実際にかかった時間（分）。完了のときに本人に聞いて入れる（見積の補正に使う）'),
      },
    },
    safe(({ id, ...a }) => {
      const t = s.tasks.update(ref(id), {
        actualMin: a.actual_min,
        title: a.title,
        parentId: a.parent === undefined ? undefined : a.parent === null ? null : ref(a.parent, '親タスクの番号'),
        status: a.status,
        categoryId: categoryId(a.category),
        priority: a.priority,
        dueDate: a.due_date,
        dueTime: a.due_time,
        estimateMin: a.estimate_min,
        notes: a.notes,
      });
      return text(`更新した:\n${taskDetailText(t, cats())}`);
    }),
  );

  server.registerTool(
    'set_do_dates',
    {
      description: 'やる日を丸ごと置き換える（空配列で全部消す）。',
      inputSchema: { id: zRef, do_dates: zDoDates },
    },
    safe(({ id, do_dates }) => {
      s.tasks.setDoDates(ref(id), do_dates);
      return detail(ref(id));
    }),
  );

  server.registerTool(
    'add_dependency',
    {
      description: '依存を張る: task は depends_on が終わるまで着手できない。循環はエラーになる。',
      inputSchema: { task: zRef, depends_on: zRef },
    },
    safe(({ task, depends_on }) => {
      s.tasks.addDependency(ref(task), ref(depends_on, '依存先の番号'));
      return detail(ref(task));
    }),
  );

  server.registerTool(
    'remove_dependency',
    {
      description: '依存を外す。',
      inputSchema: { task: zRef, depends_on: zRef },
    },
    safe(({ task, depends_on }) => {
      s.tasks.removeDependency(ref(task), ref(depends_on, '依存先の番号'));
      return detail(ref(task));
    }),
  );

  server.registerTool(
    'set_recurrence',
    {
      description:
        '繰り返しを設定・変更・解除する。kind: weekly（weekdays: 1=月…7=日）／monthly（month_day）／interval（interval_days ごと）／after_done（完了から interval_days 後）。anchor は生成した日付を do=やる日（既定）と due=締切 のどちらに入れるか。clear=true で解除。',
      inputSchema: {
        id: zRef,
        clear: z.boolean().optional(),
        kind: z.enum(['weekly', 'monthly', 'interval', 'after_done']).optional(),
        weekdays: z.array(z.number().int().min(1).max(7)).optional(),
        month_day: z.number().int().min(1).max(31).optional(),
        interval_days: z.number().int().min(1).optional(),
        anchor: z.enum(['do', 'due']).optional(),
      },
    },
    safe(({ id, clear, kind, weekdays, month_day, interval_days, anchor }) => {
      const tid = ref(id);
      if (clear) {
        s.tasks.setRecurrence(tid, null);
      } else {
        if (!kind) throw badRequest('kind が必要（解除なら clear=true）');
        const need = (v: unknown, name: string) => {
          if (v === undefined) throw badRequest(`kind=${kind} には ${name} が必要`);
        };
        if (kind === 'weekly') need(weekdays, 'weekdays');
        if (kind === 'monthly') need(month_day, 'month_day');
        if (kind === 'interval' || kind === 'after_done') need(interval_days, 'interval_days');
        s.tasks.setRecurrence(
          tid,
          kind === 'weekly'
            ? { kind, weekdays: weekdays!, anchor }
            : kind === 'monthly'
              ? { kind, monthDay: month_day!, anchor }
              : { kind, intervalDays: interval_days!, anchor },
        );
      }
      return detail(tid);
    }),
  );

  server.registerTool(
    'list_categories',
    {
      description: 'カテゴリの一覧（アーカイブ済みも含む）。',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safe(() => {
      const list = s.categories.list(true);
      return text(
        list.length
          ? list.map((c) => `#${c.id} ${c.name}${c.archived ? '（アーカイブ）' : ''}`).join('\n')
          : '（カテゴリなし）',
      );
    }),
  );

  server.registerTool(
    'add_category',
    {
      description: 'カテゴリを追加する。',
      inputSchema: { name: z.string().trim().min(1).max(50), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() },
    },
    safe(({ name, color }) => {
      const c = s.categories.create({ name, color });
      return text(`追加した: #${c.id} ${c.name}`);
    }),
  );

  server.registerTool(
    'archive_category',
    {
      description:
        '終わったカテゴリ（プロジェクト）をアーカイブする。そのカテゴリのタスクは今日・一覧・ボードから隠れる（list_tasks の include_archived で見られる）。未完了が残っているとエラーになるので、本人に確かめてから cancel_open=true で全部中止にしてアーカイブする。restore=true で戻す。',
      inputSchema: {
        category: zCategoryRef,
        cancel_open: z.boolean().optional().describe('残っている未完了を全部中止にしてからアーカイブする'),
        restore: z.boolean().optional().describe('アーカイブを戻す'),
      },
    },
    safe(({ category, cancel_open, restore }) => {
      const id = categoryId(category)!;
      if (restore) {
        const c = s.categories.update(id, { archived: false });
        return text(`戻した: #${c.id} ${c.name}（タスクがまた出るようになった。止めた繰り返しは止まったまま）`);
      }
      const { canceled } = s.tasks.archiveCategory(id, cancel_open ?? false);
      return text(`アーカイブした: ${s.categories.get(id).name}${canceled ? `（未完了 ${canceled} 件を中止）` : ''}`);
    }),
  );

  // ── クイックメモ（design 3-6b）
  const memoRef = (r: string | number) => {
    const id = parseMemoRef(r);
    if (id === null) throw badRequest(`メモ番号が読めない: ${r}`);
    return id;
  };
  const zMemoRef = z.union([z.number(), z.string()]).describe('メモ番号（例: "M-012"・"12"）');

  server.registerTool(
    'list_memos',
    {
      description:
        '受信箱のクイックメモ（本人が外出先などで書いたもの）。既定は未処理だけ。未処理のメモを読んで日記・記録・タスクなどに振り分けたら、complete_memo で済にする。',
      inputSchema: {
        status: z.enum(['open', 'done', 'all']).default('open'),
        query: z.string().optional().describe('本文・振り分け先で検索'),
      },
      annotations: { readOnlyHint: true },
    },
    safe(({ status, query }) => {
      const list = s.memos.list({ status, q: query });
      return text(list.length ? list.map(memoText).join('\n\n') : '（メモなし）');
    }),
  );

  server.registerTool(
    'add_memo',
    { description: 'クイックメモを受信箱に追加する。', inputSchema: { body: zMemoBody } },
    safe(({ body }) => text(`追加した:\n${memoText(s.memos.create(body))}`)),
  );

  server.registerTool(
    'complete_memo',
    {
      description:
        'メモを「済」にする。どこへ振り分けたか（例: "日記 2026-10-13"・"支出の記録"・"タスク T-150"・"不要"）を destination に必ず書く。タスクにするなら memo_to_task を使う。',
      inputSchema: { id: zMemoRef, destination: z.string().trim().min(1).max(200) },
    },
    safe(({ id, destination }) => text(`済にした:\n${memoText(s.memos.update(memoRef(id), { status: 'done', destination }))}`)),
  );

  server.registerTool(
    'memo_to_task',
    {
      description:
        'メモからタスクを作る（1行目がタイトル・残りがメモ欄。title で上書き可）。メモは「済・タスク T-xxx」になる。',
      inputSchema: {
        id: zMemoRef,
        title: z.string().trim().min(1).max(500).optional(),
        category: zCategoryRef.optional(),
        priority: zPriority.optional(),
        due_date: zDate.optional(),
        due_time: zTime.optional(),
        do_dates: zDoDates.optional(),
      },
    },
    safe((a) => {
      const { task } = s.memos.toTask(memoRef(a.id), {
        title: a.title,
        categoryId: categoryId(a.category) ?? undefined,
        priority: a.priority,
        dueDate: a.due_date,
        dueTime: a.due_time,
        doDates: a.do_dates,
      });
      return text(`タスクにした:\n${taskDetailText(task, cats())}`);
    }),
  );

  // ── ノート（design 3-6e）。読む・作る・書き足すだけ。⛔ 書き換え・削除は持たせない（画面から）
  const noteRef = (r: string | number) => {
    const id = parseNoteRef(r);
    if (id === null) throw badRequest(`ノート番号が読めない: ${r}`);
    return id;
  };

  server.registerTool(
    'list_notes',
    {
      description:
        'ノート（本人が画面で書く自由なメモ・Google Keep のようなもの。買い物リストやアイデアなど）。中身を全部返す。受信箱のクイックメモ（list_memos）とは別で、振り分けない。固定したものが先、あとは新しい順。',
      inputSchema: {
        query: z.string().optional().describe('タイトル・本文・チェックリスト・ラベルから探す'),
        label: z.string().optional().describe('このラベルのノートだけ'),
        archived: z.boolean().optional().describe('true でアーカイブしたノート'),
      },
    },
    safe(({ query, label, archived }) => {
      const list = s.notes.list({ q: query, label, archived });
      return text(list.length ? list.map(noteText).join('\n\n') : '（ノートなし）');
    }),
  );

  server.registerTool(
    'add_note',
    {
      description:
        'ノートを作る。items を渡すとチェックリスト（買い物・持ち物など）、渡さなければ文章のノート。本人に頼まれたときだけ使う。⛔ パスワード・カード番号などは書かない。',
      inputSchema: {
        title: z.string().max(500).optional(),
        body: z.string().max(50_000).optional().describe('文章のノートの本文'),
        items: z.array(z.string().trim().min(1).max(2000)).max(100).optional().describe('チェックリストの項目'),
        labels: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
        color: z.enum(NOTE_COLORS).optional(),
        pinned: z.boolean().optional(),
      },
    },
    safe((a) =>
      text(
        `作った:\n${noteText(
          s.notes.create({
            title: a.title,
            body: a.body,
            items: a.items?.map((t) => ({ text: t, done: false })),
            labels: a.labels,
            color: a.color,
            pinned: a.pinned,
          }),
        )}`,
      ),
    ),
  );

  server.registerTool(
    'append_to_note',
    {
      description:
        'ノートに書き足す（例: 「買い物リストに卵を足して」）。チェックリストには未チェックの項目として、文章のノートには末尾の行として足す。既にある中身は変えない（チェックを付ける・消すのは本人が画面で）。',
      inputSchema: {
        id: z.union([z.number(), z.string()]).describe('ノート番号（例: "N-003"・"3"）。list_notes で確認'),
        text: z.string().max(20_000).optional().describe('足す行（改行で複数）'),
        items: z.array(z.string().trim().min(1).max(2000)).max(100).optional().describe('足す項目'),
      },
    },
    safe(({ id, text: t, items }) => text(`書き足した:\n${noteText(s.notes.append(noteRef(id), { text: t, items }))}`)),
  );

  // ── 目標（design 3-6f・4-13）。読む・作る・記録を足すだけ。⛔ 書き換え・記録の削除は持たせない（画面から）
  const zGoalRef = z.union([z.number(), z.string()]).describe('目標の番号（例: "G-001"・"1"）か名前。list_goals で確認');

  server.registerTool(
    'list_goals',
    {
      description:
        '目標の一覧と進み具合（例: 週に2回・1日に10ページ・12/31 までに 300ページ）。期間ごとの目標は今の期間の合計・連続達成・終わった期間のうち達成した数・累計、期限までの目標は合計・ペース（予定より遅れ／先）・残りを1日あたりに。',
      inputSchema: { archived: z.boolean().optional().describe('true でアーカイブした目標') },
      annotations: { readOnlyHint: true },
    },
    safe(({ archived }) => {
      const list = s.goals.list({ archived });
      return text(list.length ? list.map(goalLine).join('\n') : '（目標なし）');
    }),
  );

  server.registerTool(
    'get_goal',
    {
      description: '目標1つの進み具合・メモ・記録（新しい順。日付・量・一言）。',
      inputSchema: {
        goal: zGoalRef,
        limit: z.number().int().positive().max(500).optional().describe('記録を何件まで出すか（既定 30）'),
      },
      annotations: { readOnlyHint: true },
    },
    safe(({ goal, limit }) => text(goalDetailText(s.goals.get(s.goals.resolve(goal)), limit))),
  );

  server.registerTool(
    'add_goal',
    {
      description:
        '目標を作る。kind=rate は「期間ごとに target（unit）」（period=day・week〈月曜はじまり〉・month）、kind=total は「end_date までに target（unit）」。本人と中身を決めてから使う。',
      inputSchema: {
        title: z.string().trim().min(1).max(200).describe('名前（例: "プール"・"回路の本を読む"）'),
        kind: z.enum(['rate', 'total']),
        period: z.enum(['day', 'week', 'month']).optional().describe('rate のとき'),
        target: z.number().positive().describe('目標の量'),
        unit: z.string().trim().max(20).optional().describe('単位（既定 "回"。例: "ページ"・"分"）'),
        start_date: zDate.optional().describe('数え始める日（省くと rate は今の期間の頭、total は今日）'),
        end_date: zDate.optional().describe('total は期限（必須）。rate は終わる日（省くとずっと）'),
        notes: z.string().max(20_000).optional().describe('メモ（本の名前・ルールなど）'),
      },
    },
    safe((a) =>
      text(
        `作った:\n${goalDetailText(
          s.goals.create({
            title: a.title,
            kind: a.kind,
            period: a.period,
            target: a.target,
            unit: a.unit,
            startDate: a.start_date,
            endDate: a.end_date,
            notes: a.notes,
          }),
        )}`,
      ),
    ),
  );

  server.registerTool(
    'log_goal',
    {
      description:
        '目標に記録を足す（例: 「プール行った」→ amount 1、「10ページ読んだ」→ amount 10）。date を省くと今日。先の日付と、数え始める日より前は記録できない。その日にまだ済んでいない「やる時間」があれば、最初のものが済になる。間違えた記録を消す・直すのは本人が画面で。',
      inputSchema: {
        goal: zGoalRef,
        amount: z.number().positive().optional().describe('量（省くと 1）'),
        date: zDate.optional().describe('やった日 YYYY-MM-DD（省くと今日）'),
        note: z.string().trim().max(500).optional().describe('一言（例: "90分"・"3章まで"）'),
      },
    },
    safe(({ goal, amount, date, note }) => {
      const g = s.goals.addLog(s.goals.resolve(goal), { amount, date, note });
      return text(`記録した:\n${goalLine(g)}`);
    }),
  );

  server.registerTool(
    'plan_goal',
    {
      description:
        '目標をやる時間を置く（例: 「明日の21時から30分、本を10ページ読む枠を入れて」）。タスクは作らない。時間割（今日の流れ・ボードの日・週・月）に緑の枠で出て、Google カレンダーにも【目標】として書き出される（時刻があれば5分前に通知）。記録するとその予定は済になる。外す・動かすのは本人が画面で。',
      inputSchema: {
        goal: zGoalRef,
        date: zDate.describe('やる日 YYYY-MM-DD'),
        start: zTime.optional().describe('始める時刻 HH:MM（省くと時刻なし）'),
        minutes: z.number().int().positive().max(1440).optional().describe('長さ（分・省くと 30）'),
        amount: z.number().positive().optional().describe('この時間にやる量（例: 10）'),
      },
    },
    safe(({ goal, date, start, minutes, amount }) => {
      const p = s.goals.addPlan(s.goals.resolve(goal), { date, start: start ?? null, minutes: minutes ?? (start ? 30 : null), amount: amount ?? null });
      return text(`置いた:\n${p.goalCode} ${p.title}\n${goalPlanLine(p)}`);
    }),
  );

  // ── テンプレート（design 4-8）。⛔ 削除は持たせない（画面の設定から）
  server.registerTool(
    'list_templates',
    {
      description:
        'テンプレートの一覧と中身（工程・依存・基準日からの日付）。apply_template で、ここにある形のタスク（親・子・依存）をまとめて作れる。',
      inputSchema: {},
    },
    safe(() => {
      const all = s.templates.list();
      return text(
        all.length
          ? all.map((t) => templateText(t, cats())).join('\n\n')
          : 'テンプレートはまだない（save_template で今あるタスクから作れる）',
      );
    }),
  );

  server.registerTool(
    'apply_template',
    {
      description:
        'テンプレートからタスクをまとめて作る（親・子・孫・依存・カテゴリ・見積・メモ）。date（基準日）を渡すと、覚えている「基準日の◯日前・後」からやる日・締切を入れる（渡さなければ日付なし）。title を省くと親の名前（元が「10/18 ブログ」のように日付で始まっていたなら、基準日を M/D で付ける）。',
      inputSchema: {
        template: z.union([z.number(), z.string()]).describe('テンプレートの名前か番号（list_templates で確認）'),
        title: z.string().trim().min(1).max(500).optional().describe('親のタイトル'),
        date: zDate.optional().describe('基準日 YYYY-MM-DD（テンプレートの親の締切、無ければやる日にあたる日）'),
      },
    },
    safe(({ template, title, date }) => {
      const created = s.templates.apply(template, { title, date });
      return text(`作った:\n${taskDetailText(created, cats())}`);
    }),
  );

  server.registerTool(
    'save_template',
    {
      description:
        '今あるタスク（親）の形をテンプレートとして保存する。子・孫・依存・カテゴリ・優先度・見積・メモを写し、日付は親の締切（無ければやる日）からの相対で覚える。中止した子は入れない。同じ名前があるとエラー（overwrite=true で置き換える＝本人に確かめてから）。',
      inputSchema: {
        task: zRef.describe('親にするタスクの番号'),
        name: z.string().trim().min(1).max(40).describe('テンプレートの名前（例: "ブログ"）'),
        overwrite: z.boolean().optional(),
      },
    },
    safe(({ task, name, overwrite }) =>
      text(`保存した:\n${templateText(s.templates.saveFromTask(ref(task), name, overwrite), cats())}`),
    ),
  );

  return server;
}

/** ステートレス: リクエストごとにサーバとトランスポートを作る */
export async function handleMcp(s: Services, req: Request): Promise<Response> {
  const server = createMcpServer(s);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}
