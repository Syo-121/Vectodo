import { describe, expect, it } from 'vitest';
import { dayFlow, fmtClock, timedOn, toMin } from '../src/shared/flow.ts';
import type { OverlayEvent, Task } from '../src/shared/types.ts';

const TODAY = '2026-10-14';
const ev = (title: string, start: string | null, end: string | null, date = TODAY): OverlayEvent => ({
  id: title,
  calendar: 'バイト',
  color: null,
  title,
  date,
  endDate: '2026-10-15',
  start,
  end,
});
const due = (title: string, time: string) => ({ title, dueDate: TODAY, dueTime: time }) as Task;
const placed = (title: string, start: string, minutes: number | null, estimateMin: number | null = null) =>
  ({ title, estimateMin, doDates: [{ date: TODAY, minutes, start }] }) as Task;
const flow = (events: OverlayEvent[], deadlines: Task[], now: string, dayStart = '08:00', dayEnd = '23:00') =>
  dayFlow({ today: TODAY, events, deadlines, now: toMin(now), dayStart: toMin(dayStart), dayEnd: toMin(dayEnd) });
const show = (f: ReturnType<typeof flow>) =>
  f.items.map((x) =>
    x.kind === 'due'
      ? `締切 ${fmtClock(x.at)} ${x.task.title}${x.past ? '（過ぎた）' : ''}`
      : x.kind === 'event'
        ? `${fmtClock(x.start)}-${fmtClock(x.end)} ${x.event.title}${x.now ? '（いま）' : ''}`
        : x.kind === 'plan'
          ? `${x.over ? 'ながら' : '置いた'} ${fmtClock(x.start)}-${fmtClock(x.end)} ${x.task.title}${x.now ? '（いま）' : ''}`
          : `空き ${fmtClock(x.start)}-${fmtClock(x.end)}`,
  );

describe('今日の流れ（design 4-11）', () => {
  const baito = [
    ev('移動: 自宅→横浜校', '14:55', '16:20'),
    ev('横浜校へ行く', '14:55', '16:17'),
    ev('横浜: 4年25', '16:30', '20:15'),
    ev('移動: 横浜校→自宅', '20:15', '21:35'),
  ];

  it('予定と締切を時刻順に1本に並べ、いま以降の空きを出す（重なる予定はまとめる・15分未満のすき間は数えない）', () => {
    const f = flow(baito, [due('予習', '14:55')], '11:58');
    expect(show(f)).toEqual([
      '空き 11:58-14:55',
      '締切 14:55 予習',
      '14:55-16:17 横浜校へ行く',
      '14:55-16:20 移動: 自宅→横浜校',
      '16:30-20:15 横浜: 4年25',
      '20:15-21:35 移動: 横浜校→自宅',
      '空き 21:35-23:00',
    ]);
    expect(f.freeMin).toBe(177 + 85);
  });

  it('締切が空きの途中にあれば、そこで空きを切って見せる（合計は変わらない）', () => {
    const f = flow([ev('TM', '13:00', '15:00')], [due('レポート', '18:00')], '10:00', '08:00', '22:00');
    expect(show(f)).toEqual(['空き 10:00-13:00', '13:00-15:00 TM', '空き 15:00-18:00', '締切 18:00 レポート', '空き 18:00-22:00']);
    expect(f.freeMin).toBe(180 + 420);
  });

  it('予定の最中は「いま」。終わった予定は並べないが帯用には残す。過ぎた締切は先頭に', () => {
    const f = flow(baito, [due('予習', '14:55')], '17:00');
    expect(show(f)).toEqual([
      '締切 14:55 予習（過ぎた）',
      '16:30-20:15 横浜: 4年25（いま）',
      '20:15-21:35 移動: 横浜校→自宅',
      '空き 21:35-23:00',
    ]);
    expect(f.timed).toHaveLength(4);
    expect(f.freeMin).toBe(85);
  });

  it('起きる前は起きる時刻から数え、寝る時刻を過ぎたら空きは0。終日の予定は空きを減らさない', () => {
    const early = flow([ev('旅行', null, null)], [], '06:30');
    expect(early.allDay.map((e) => e.title)).toEqual(['旅行']);
    expect(early.freeMin).toBe(15 * 60);
    expect(flow([], [], '23:30').freeMin).toBe(0);
  });

  it('空きに置いたタスクは空きの中に並べ、残りを空きとして見せる（合計の空きは減らさない・長さは配分→見積→30m）', () => {
    const f = dayFlow({
      today: TODAY,
      events: baito,
      deadlines: [due('予習', '14:55')],
      placed: [placed('予習', '12:00', null, 60), placed('ゴミ', '21:40', null), placed('終わった', '09:00', 30)],
      now: toMin('11:58'),
      dayStart: toMin('08:00'),
      dayEnd: toMin('23:00'),
    });
    // 11:58-12:00 と 21:35-21:40 の切れ端（15分未満）は並べない
    expect(show(f)).toEqual([
      '置いた 12:00-13:00 予習',
      '空き 13:00-14:55',
      '締切 14:55 予習',
      '14:55-16:17 横浜校へ行く',
      '14:55-16:20 移動: 自宅→横浜校',
      '16:30-20:15 横浜: 4年25',
      '20:15-21:35 移動: 横浜校→自宅',
      '置いた 21:40-22:10 ゴミ',
      '空き 22:10-23:00',
    ]);
    expect(f.freeMin).toBe(177 + 85);
    expect(f.placedMin).toBe(60 + 30);
    expect(f.alongMin).toBe(0);
  });

  it('予定に重ねて置いた（ながら）タスクは予定のすぐ下に並び、その時間は空きとは別に数える', () => {
    const f = dayFlow({
      today: TODAY,
      events: baito,
      deadlines: [],
      placed: [placed('単語', '15:00', 30), placed('メール', '20:15', 15), placed('予習', '12:00', 60)],
      now: toMin('11:58'),
      dayStart: toMin('08:00'),
      dayEnd: toMin('23:00'),
    });
    expect(show(f)).toEqual([
      '置いた 12:00-13:00 予習',
      '空き 13:00-14:55',
      '14:55-16:17 横浜校へ行く',
      '14:55-16:20 移動: 自宅→横浜校',
      'ながら 15:00-15:30 単語',
      '16:30-20:15 横浜: 4年25',
      '20:15-21:35 移動: 横浜校→自宅',
      'ながら 20:15-20:30 メール',
      '空き 21:35-23:00',
    ]);
    expect([f.freeMin, f.placedMin, f.alongMin]).toEqual([177 + 85, 60, 30 + 15]);
  });

  it('その日の予定だけを拾う（週の範囲で取った予定を日ごとに分ける）', () => {
    const week = [ev('月の授業', '10:00', '11:00', '2026-10-13'), ev('火の授業', '10:00', '11:00'), ev('夜勤', '22:00', '02:00', '2026-10-13')];
    expect(timedOn(week, TODAY).map((x) => [x.event.title, x.start, x.end])).toEqual([
      ['火の授業', 600, 660],
      ['夜勤', 0, 120],
    ]);
  });

  it('日をまたぐ予定は 24:00 まで、前の日から続く予定は 0:00 から', () => {
    const f = flow([ev('夜行', '22:00', '06:00'), ev('前夜から', '23:00', '09:00', '2026-10-13')], [], '07:00');
    expect(f.timed.map((x) => [x.start, x.end])).toEqual([
      [22 * 60, 24 * 60],
      [0, 9 * 60],
    ]);
    expect(f.freeMin).toBe((22 - 9) * 60);
  });
});
