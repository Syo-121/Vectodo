import { describe, expect, it } from 'vitest';
import { lanes, placeOn, slotAt, snap, unplaceTo } from '../src/web/grid.ts';

const h = (s: string) => {
  const [a = 0, b = 0] = s.split(':').map(Number);
  return a * 60 + b;
};

describe('今日の流れの時間割（design 4-11）', () => {
  it('重なるものは横に並べ、重なりの塊ごとに列数をそろえる', () => {
    const laid = lanes([
      { item: 'A', start: h('9:00'), end: h('10:00') },
      { item: 'B', start: h('9:30'), end: h('10:30') },
      { item: 'C', start: h('10:00'), end: h('11:00') },
      { item: 'D', start: h('12:00'), end: h('13:00') },
      { item: '長さ0', start: h('12:00'), end: h('12:00') },
    ]);
    expect(laid.map((x) => [x.item, x.col, x.cols])).toEqual([
      ['A', 0, 2],
      ['B', 1, 2],
      // A が 10:00 に終わるので、C は A の列に入る
      ['C', 0, 2],
      ['D', 0, 2],
      ['長さ0', 1, 2],
    ]);
  });

  it('15分に丸める（ドラッグは近いほう・タップは切り捨て）', () => {
    expect([snap(h('12:07')), snap(h('12:08')), snap(h('12:14'), 'floor')]).toEqual([h('12:00'), h('12:15'), h('12:00')]);
  });

  it('タップした枠: 予定の上ならその予定に重ねて、空いていれば次の予定（無ければ寝る時刻）まで', () => {
    const events = [
      { start: h('14:55'), end: h('16:20'), title: '移動' },
      { start: h('16:30'), end: h('20:15'), title: '横浜' },
    ];
    const D = '2026-10-14';
    expect(slotAt(D, h('15:00'), events, h('23:00'))).toEqual({ date: D, start: h('15:00'), end: h('16:20'), host: '移動' });
    expect(slotAt(D, h('12:00'), events, h('23:00'))).toEqual({ date: D, start: h('12:00'), end: h('14:55') });
    expect(slotAt(D, h('22:00'), events, h('23:00'))).toEqual({ date: D, start: h('22:00'), end: h('23:00') });
    expect(slotAt(D, h('23:30'), events, h('23:00'))).toEqual({ date: D, start: h('23:30'), end: h('23:45') });
  });

  it('落としたときのやる日: 時間の欄なら時刻つきで置き換え、終日の段なら時刻を外して移す', () => {
    const dates = [
      { date: '2026-10-14', minutes: 60, start: '12:00' },
      { date: '2026-10-16', minutes: 30, start: null },
    ];
    // 別の日の時間の欄へ
    expect(placeOn(dates, '2026-10-14', '2026-10-15', '09:00', 60)).toEqual([
      { date: '2026-10-15', minutes: 60, start: '09:00' },
      { date: '2026-10-16', minutes: 30, start: null },
    ]);
    // 終日のカードを、同じ日の時間の欄へ（その日の分は置き換え）
    expect(placeOn(dates, '2026-10-16', '2026-10-16', '13:30', 30)).toEqual([
      { date: '2026-10-14', minutes: 60, start: '12:00' },
      { date: '2026-10-16', minutes: 30, start: '13:30' },
    ]);
    // 同じ日の終日へ＝時刻だけ外す
    expect(unplaceTo(dates, '2026-10-14', '2026-10-14')[0]).toEqual({ date: '2026-10-14', minutes: 60, start: null });
    // 別の日の終日へ（そこに既にあれば時間を足す）
    expect(unplaceTo(dates, '2026-10-14', '2026-10-16')).toEqual([{ date: '2026-10-16', minutes: 90, start: null }]);
  });
});
