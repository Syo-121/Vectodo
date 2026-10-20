// API が返す形。画面と MCP で共有する。

import type { NoteColor } from './constants.ts';
import type { Status } from './schemas.ts';

export interface TaskRef {
  id: number;
  code: string;
  title: string;
  status: Status;
}

export interface Recurrence {
  id: number;
  kind: 'weekly' | 'monthly' | 'interval' | 'after_done';
  weekdays: number[] | null;
  monthDay: number | null;
  intervalDays: number | null;
  anchor: 'do' | 'due';
  active: boolean;
}

export interface Task {
  id: number;
  code: string;
  parentId: number | null;
  parentTitle: string | null;
  position: number;
  title: string;
  status: Status;
  categoryId: number | null;
  priority: 1 | 2 | 3 | null;
  dueDate: string | null;
  dueTime: string | null;
  estimateMin: number | null;
  /** 実際にかかった時間（分）。完了したときに残す（design 4-12） */
  actualMin: number | null;
  notes: string;
  recurrence: Recurrence | null;
  legacyId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** start: その日の時刻 HH:MM（今日の流れの空きに置いたもの・design 4-11）。無ければ時刻なし */
  doDates: { date: string; minutes: number | null; start?: string | null }[];
  /** 先にやるタスク（完了・中止済みも含む） */
  dependsOn: TaskRef[];
  /** 依存先に未完了が残っている、または祖先が依存待ち・待ち（＝依存待ち・design 4-2） */
  blocked: boolean;
  /** 祖先（親・その上）が依存待ちか「待ち」で手を付けられないとき、自分で待っている祖先のうちいちばん近いもの（＝待たせている元） */
  waitVia?: TaskRef;
  /** 子の進み具合（中止は数えない） */
  children: { total: number; done: number };
  /** 締切が親から受け継いだものなら、その親（行動の画面で計算する印・API は返さない・design 4-3） */
  dueFrom?: { id: number; title: string };
}

export interface TaskDetail extends Task {
  /** このタスクの後にやるタスク */
  dependents: TaskRef[];
  childTasks: Task[];
  /** 子・孫…の総数（削除の確認に使う） */
  descendantCount: number;
}

export interface TodayView {
  today: string;
  /** 作った時刻 HH:MM（MCP の「締切を過ぎた」の判定に使う。画面は自分の時計で進める） */
  now: string;
  overdue: Task[];
  /** carriedOver: やる日が全部過去で終わっていない（持ち越し） */
  todo: (Task & { carriedOver: boolean })[];
  dueSoon: Task[];
  doneToday: Task[];
  /** 着手できるものを「次にやる順」に並べたもの（design 4-10）。先頭3件が「次にやること」 */
  ranked: NextItem[];
  /** 待ち・依存待ちで、7日以内に締切があるか、やる日が今日までのもの */
  waiting: Task[];
  /** 今日が締切で時刻のある未完了（子が残る親も）。時刻順。今日の流れ（design 4-11）に締切の印として並べる */
  deadlines: Task[];
  /** 今日のやる日に時刻がある未完了（今日の流れの空きに置いたもの）。時刻順 */
  placed: Task[];
  /** 子が全部終わって、締切かやる日がある親（「閉じる？」と聞く・design 4-3） */
  closable: Task[];
  /** 子が残っている親のうち、締切が7日以内（過ぎたものも）のもの。MCP の今日で「シリーズの締切」として出す */
  seriesDue: Task[];
  /** seriesDue の親ごとの「いま着手できる子」の番号（親の番号 → T-NNN） */
  steps: Record<number, string[]>;
}

/** 「次にやること」の段（design 4-10）。上ほど先 */
export type NextKind = 'overdue' | 'dueToday' | 'doing' | 'doToday' | 'atRisk' | 'dueSoon' | 'important';

export interface NextItem {
  task: Task;
  kind: NextKind;
  /** 段を決めた締切までの日数（負＝過ぎた）。親から受け継いだときは親の締切 */
  daysLeft: number | null;
  /** やる日が過ぎて持ち越している */
  carriedOver: boolean;
  /** やる日に今日が入っている */
  plannedToday: boolean;
  /** 子が残っている親の段を受け継いだとき、その親（親の代わりに、着手できる子を出す） */
  via: { id: number; title: string } | null;
}

export interface Memo {
  id: number;
  code: string;
  body: string;
  status: 'open' | 'done';
  /** 振り分け先の一言（例: 日記 2026-10-13・タスク T-150） */
  destination: string | null;
  taskId: number | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  position: number;
  archived: boolean;
  gcalCalendarId: string | null;
  /** 締切（無ければやる日）が今日から N 日より先の未完了を、一覧・カンバン・重要×緊急・計画待ちで隠す（null＝隠さない・design 4-9） */
  hideAfterDays: number | null;
  /** ボードの「計画待ち」に出さない（やる日を付けない決まりのもの・design 4-9） */
  hideFromPlan: boolean;
}

/** テンプレートの1工程（design 3-6d）。日付は基準日からの日数（負＝前）で覚える */
export interface TemplateNode {
  /** テンプレートの中だけの番号（依存の両端を指す） */
  key: number;
  title: string;
  categoryId: number | null;
  priority: 1 | 2 | 3 | null;
  estimateMin: number | null;
  notes: string;
  dueOffset: number | null;
  dueTime: string | null;
  doOffsets: { offset: number; minutes: number | null }[];
  children: TemplateNode[];
}

export interface TemplateBody {
  root: TemplateNode;
  /** [後の key, 先の key]（後は先が終わるまで着手できない） */
  deps: [number, number][];
  /** 基準日を親の何から取ったか（締切／やる日の最後の日）。null は日付を覚えていない */
  anchor: 'due' | 'do' | null;
  /** 親のタイトルが「10/18 ブログ」のように日付で始まっていた（root.title からは外してある） */
  datePrefix: boolean;
}

export interface Template {
  id: number;
  name: string;
  body: TemplateBody;
  sourceTaskId: number | null;
  createdAt: string;
  updatedAt: string;
}

/** シリーズ＝子を持つタスク（v4・design 7-12）。id 0 は「親なし」（いちばん上の段で依存のあるもの） */
export interface SeriesSummary {
  id: number;
  code: string;
  title: string;
  status: Status;
  categoryId: number | null;
  dueDate: string | null;
  /** 子の進み具合（中止は数えない） */
  children: { total: number; done: number };
  /** 中身に触れている依存の線の数 */
  edges: number;
}

/** 依存の図の材料（v4） */
export interface SeriesGraph {
  /** 親（「親なし」では null） */
  parent: Task | null;
  /** 中身＝子（全状態・並び順どおり）。「親なし」では依存のあるトップレベルのタスク */
  nodes: Task[];
  /** 線でつながっている、シリーズの外のタスク */
  outside: Task[];
  /** from が先・to が後（to は from が終わるまで着手できない） */
  edges: { from: number; to: number }[];
}

/** 画面に重ねて見せる Google カレンダーの予定（v3・design 7-11）。日付・時刻は JST */
export interface OverlayEvent {
  id: string;
  /** カレンダーの名前（バイト・授業 など） */
  calendar: string;
  color: string | null;
  title: string;
  /** 始まる日 */
  date: string;
  /** 終わる日の翌日（終日の連続予定は date〜endDate の前日まで続く） */
  endDate: string;
  /** 時刻（終日なら null） */
  start: string | null;
  end: string | null;
}

/** ノート（design 3-6e）。Google Keep のような自由なメモ。受信箱のクイックメモ（Memo）とは別 */
export interface NoteItem {
  text: string;
  done: boolean;
}

export interface Note {
  id: number;
  /** N-001 */
  code: string;
  title: string;
  /** 文章のノートの本文 */
  body: string;
  /** text＝文章・list＝チェックリスト */
  kind: 'text' | 'list';
  items: NoteItem[];
  color: NoteColor | null;
  labels: string[];
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteLabel {
  label: string;
  count: number;
}

/** 目標（design 3-6f・4-13）。rate＝期間ごとの量（週に2回・1日に10ページ）、total＝期限までの総量 */
export type GoalPeriod = 'day' | 'week' | 'month';

/** 1つの期間（1日・1週・1か月）の合計 */
export interface GoalSpan {
  from: string;
  to: string;
  sum: number;
  achieved: boolean;
}

/** 進み具合（毎回計算する・shared/goals.ts の goalProgress） */
export interface GoalProgress {
  /** 今日の記録の合計 */
  todaySum: number;
  /** 数え始める日がまだ来ていない */
  notStarted: boolean;
  /** 終わる日（total は期限）を過ぎた */
  ended: boolean;
  /** rate: 今の期間（終わった・始まっていないなら null） */
  current: GoalSpan | null;
  /** rate: 最近の期間（古い順・今の期間まで） */
  history: GoalSpan[];
  /** rate: 続けて達成した期間の数（今の期間は達成していれば数える） */
  streak: number;
  /** rate: 終わった期間のうち達成した数 */
  record: { achieved: number; total: number };
  /** rate: 数え始めてからの累計／total: 数え始める日〜期限の合計 */
  sum: number;
  /** total: 今日までに済んでいたい量（日割り） */
  expected: number | null;
  /** total: 残りを1日あたりに（済んだ・期限を過ぎたら null） */
  perDay: number | null;
  /** total: 期限まで何日（今日を含む） */
  daysLeft: number | null;
}

export interface Goal {
  id: number;
  /** G-001 */
  code: string;
  title: string;
  kind: 'rate' | 'total';
  period: GoalPeriod | null;
  target: number;
  unit: string;
  startDate: string;
  endDate: string | null;
  notes: string;
  position: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  progress: GoalProgress;
}

export interface GoalLog {
  id: number;
  goalId: number;
  date: string;
  amount: number;
  note: string;
  createdAt: string;
}

export interface GoalDetail extends Goal {
  /** 記録（新しい順） */
  logs: GoalLog[];
}
