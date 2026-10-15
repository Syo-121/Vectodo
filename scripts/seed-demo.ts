// デモ用の架空のデータを入れた DB を作る（README・紹介記事のスクリーンショット・お試し用）。
// 中身はすべて架空。日付は「作った日」を今日として並べるので、作り直せばいつでも同じ見え方になる。
// 実行: npx tsx scripts/seed-demo.ts [DB のパス（既定 data/demo.db）]  ※ 既にあるファイルには書かない

import fs from 'node:fs';
import path from 'node:path';
import { addDays, isoWeekday, todayIn, type Clock } from '../src/shared/dates.ts';
import type { DoDateInput, TaskCreateInput } from '../src/shared/schemas.ts';
import { CategoryService } from '../src/server/categories.ts';
import { PROJECT_ROOT } from '../src/server/config.ts';
import { openDb } from '../src/server/db.ts';
import { MemoService } from '../src/server/memos.ts';
import { NoteService } from '../src/server/notes.ts';
import { TaskService } from '../src/server/tasks.ts';
import { TemplateService } from '../src/server/templates.ts';

const file = path.resolve(PROJECT_ROOT, process.argv[2] ?? 'data/demo.db');
if (fs.existsSync(file)) {
  console.error(`${file} は既にある（消してから作り直して）`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(file), { recursive: true });

const T = todayIn('Asia/Tokyo');
/** 日付を動かせる時計（終わったタスクを数日前に終えたことにする） */
const clock = {
  current: T,
  time: '09:00',
  today() {
    return this.current;
  },
  now() {
    return `${this.current}T${this.time}:00+09:00`;
  },
} satisfies Clock & { current: string; time: string };
const at = (date: string, time = '09:00') => {
  clock.current = date;
  clock.time = time;
};

const db = openDb(file);
// 番号は T-001 から
db.prepare("DELETE FROM sqlite_sequence WHERE name = 'tasks'").run();
const tasks = new TaskService(db, clock);
const categories = new CategoryService(db);
const memos = new MemoService(db, clock, tasks);
const notes = new NoteService(db, clock);
const templates = new TemplateService(db, clock, tasks);

const cat = (name: string, color: string) => categories.create({ name, color }).id;
const dev = cat('開発', '#6366f1');
const study = cat('勉強', '#0ea5e9');
const life = cat('生活', '#10b981');
const work = cat('バイト', '#f59e0b');
const hobby = cat('趣味', '#ec4899');

const d = (n: number) => addDays(T, n);
/** 今日から見て次の、その曜日（1=月〜7=日）の日 */
const next = (weekday: number) => {
  let x = T;
  while (isoWeekday(x) !== weekday) x = addDays(x, 1);
  return x;
};
const add = (input: TaskCreateInput) => tasks.create(input).id;
const on = (date: string, start?: string, minutes?: number): DoDateInput[] => [{ date, start: start ?? null, minutes: minutes ?? null }];
/** days 日前の time に終えたことにする */
const finish = (id: number, daysAgo: number, actualMin: number, time = '18:00') => {
  at(d(-daysAgo), time);
  tasks.update(id, { status: 'done', actualMin });
  at(T);
};

// ── 依存のあるシリーズ 1: 個人サイトのリニューアル ──
at(d(-6));
const site = add({ title: '個人サイトをリニューアルする', categoryId: dev, dueDate: d(12), priority: 1 });
const siteA = add({ title: '今のサイトの不満を書き出す', parentId: site, estimateMin: 30 });
const siteB = add({ title: 'デザインの方向を決める', parentId: site, estimateMin: 60, dependsOn: [siteA] });
const siteC = add({ title: 'トップページを作る', parentId: site, estimateMin: 180, dependsOn: [siteB], doDates: on(T, '10:30', 120) });
const siteD = add({ title: '記事ページを作る', parentId: site, estimateMin: 120, dependsOn: [siteB] });
const siteE = add({ title: 'ダークモードに対応する', parentId: site, estimateMin: 60, dependsOn: [siteC, siteD] });
add({ title: '公開して告知する', parentId: site, estimateMin: 30, dependsOn: [siteE], dueDate: d(12) });
at(T);
finish(siteA, 4, 25);
finish(siteB, 1, 90);
tasks.update(siteC, { status: 'doing' });

// ── シリーズ 2: 勉強会で発表する（テンプレートにもする） ──
at(d(-5));
const talk = add({ title: '勉強会で発表する', categoryId: study, dueDate: d(6), dueTime: '19:00' });
const talkA = add({ title: 'テーマを決める', parentId: talk, estimateMin: 30 });
const talkB = add({ title: 'スライドの構成を考える', parentId: talk, estimateMin: 60, dependsOn: [talkA], doDates: on(T, '20:00', 60) });
const talkC = add({ title: 'スライドを作る', parentId: talk, estimateMin: 180, dependsOn: [talkB] });
add({ title: '通しで練習する', parentId: talk, estimateMin: 30, dependsOn: [talkC], doDates: on(d(5)) });
at(T);
finish(talkA, 3, 40);
templates.saveFromTask(talk, '勉強会の発表');

// ── シリーズ 3: 引っ越しの準備 ──
at(d(-4));
const move = add({ title: '引っ越しの準備', categoryId: life, dueDate: d(24) });
const moveA = add({ title: '物件を3つに絞る', parentId: move, estimateMin: 60 });
const moveB = add({ title: '内見を予約する', parentId: move, estimateMin: 15, dependsOn: [moveA], doDates: on(T) });
const moveC = add({ title: '申し込み・契約', parentId: move, estimateMin: 120, dependsOn: [moveB], dueDate: d(10) });
add({ title: '荷造り', parentId: move, estimateMin: 240, dependsOn: [moveC] });
add({ title: '住所変更の手続き', parentId: move, estimateMin: 60, dependsOn: [moveC] });
add({ title: '粗大ゴミの回収を申し込む', parentId: move, estimateMin: 15, dependsOn: [moveC] });
at(T);
finish(moveA, 2, 75);

// ── ひとつだけのタスク ──
at(d(-3));
add({ title: 'レポート: 統計学 第5回', categoryId: study, dueDate: T, dueTime: '17:00', estimateMin: 90, priority: 1, doDates: on(T, '14:00', 90) });
add({ title: '洗剤とトイレットペーパーを買う', categoryId: life, estimateMin: 15, doDates: on(T) });
add({ title: '図書館の本を返す', categoryId: life, dueDate: d(1), estimateMin: 15 });
// 移動中にやる（予定に重ねて置く＝ながら）
add({ title: 'シフトの希望を出す', categoryId: work, dueDate: d(3), estimateMin: 10, doDates: on(T, '12:45', 10) });
add({ title: '新人向けの手順書を直す', categoryId: work, estimateMin: 60, doDates: on(d(2)) });
add({ title: '店長からの資料待ち', categoryId: work, status: 'waiting' });
add({ title: 'ポートフォリオに作品を追加する', categoryId: dev, dueDate: d(14), estimateMin: 90 });
add({ title: 'Raspberry Pi で温湿度ロガーを作る', categoryId: hobby, priority: 3, estimateMin: 240 });
add({ title: '積読を1冊読む', categoryId: hobby, priority: 3 });
add({
  title: '燃えるゴミを出す',
  categoryId: life,
  estimateMin: 5,
  dueDate: [next(2), next(5)].sort()[0]!,
  dueTime: '08:30',
  recurrence: { kind: 'weekly', weekdays: [2, 5], anchor: 'due' },
});
add({ title: '週の振り返り', categoryId: life, estimateMin: 30, doDates: on(next(7)), recurrence: { kind: 'weekly', weekdays: [7], anchor: 'do' } });
const clean = add({ title: '部屋の掃除', categoryId: life, estimateMin: 30 });
const mail = add({ title: 'メールの返信をまとめて片付ける', categoryId: work, estimateMin: 15 });
at(T);
finish(clean, 2, 45, '11:00');
finish(mail, 1, 10, '21:00');

// 受信箱: タイトルだけのタスクと、クイックメモ
at(T, '08:10');
add({ title: '確定申告が要るか調べる' });
add({ title: '傘を買う' });
memos.create('駅前の新しいカフェ、土曜に行ってみる');
memos.create('スライドの最初に自己紹介を1枚入れる');
memos.create('自転車のタイヤに空気を入れる');

// ── ノート ──
at(d(-2), '19:00');
notes.create({
  title: '買い物リスト',
  kind: 'list',
  color: 'yellow',
  pinned: true,
  labels: ['買い物'],
  items: [
    { text: '牛乳', done: false },
    { text: '卵', done: false },
    { text: '単3電池', done: false },
    { text: '洗剤', done: true },
  ],
});
notes.create({
  title: 'キャンプの持ち物',
  kind: 'list',
  color: 'green',
  labels: ['旅行'],
  items: [
    { text: 'テント・ペグ', done: false },
    { text: '寝袋', done: false },
    { text: 'ランタン（電池も）', done: false },
    { text: 'モバイルバッテリー', done: true },
    { text: '着替え・雨具', done: false },
    { text: '虫よけ', done: false },
  ],
});
notes.create({
  title: '勉強会のネタ',
  kind: 'text',
  color: 'purple',
  labels: ['アイデア'],
  body: '・自作ツールを AI から操作できるようにした話\n・依存関係のあるタスクを図にする方法\n・Service Worker でオフラインでも読めるようにする',
});
notes.create({
  title: '読みたい本',
  kind: 'list',
  color: 'blue',
  labels: ['本'],
  items: [
    { text: 'リーダブルコード', done: true },
    { text: 'ドメイン駆動設計 入門', done: false },
    { text: 'イシューからはじめよ', done: false },
  ],
});
notes.create({ title: '', kind: 'text', body: '駅の北口のラーメン屋、火曜定休。' });

db.close();
console.log(`デモの DB を作った: ${file}（今日= ${T}）`);
