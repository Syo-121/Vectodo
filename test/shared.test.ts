import { describe, expect, it } from 'vitest';
import { addDays, isoWeekday, isValidDate, nowIsoIn, todayIn } from '../src/shared/dates.ts';
import { formatTaskCode, parseTaskRef } from '../src/shared/ids.ts';
import { firstDate, nextDate } from '../src/shared/recurrence.ts';

describe('番号（design 3-7）', () => {
  it('最低3桁で表示し、1000 以上はそのまま', () => {
    expect(formatTaskCode(60)).toBe('T-060');
    expect(formatTaskCode(999)).toBe('T-999');
    expect(formatTaskCode(1000)).toBe('T-1000');
    expect(formatTaskCode(12345)).toBe('T-12345');
  });
  it('表記の揺れを吸収する', () => {
    for (const s of ['T-60', 'T-060', 't60', 't-060', '60', ' 060 ']) expect(parseTaskRef(s)).toBe(60);
    expect(parseTaskRef('T-1000')).toBe(1000);
    expect(parseTaskRef(60)).toBe(60);
    for (const s of ['', 'T-', 'abc', '0', 'T-0', '-5', '1.5']) expect(parseTaskRef(s)).toBeNull();
  });
});

describe('日付', () => {
  it('不正な日付を弾く', () => {
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-1-01')).toBe(false);
  });
  it('JST で今日を決める（UTC では前日でも）', () => {
    const utc = new Date('2026-10-12T16:30:00Z'); // JST 10/13 01:30
    expect(todayIn('Asia/Tokyo', utc)).toBe('2026-10-13');
    expect(nowIsoIn('Asia/Tokyo', utc)).toBe('2026-10-13T01:30:00+09:00');
  });
  it('曜日と月またぎ', () => {
    expect(isoWeekday('2026-10-13')).toBe(2); // 火
    expect(isoWeekday('2026-10-18')).toBe(7); // 日
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('繰り返し（design 4-4）', () => {
  const tue = { kind: 'weekly' as const, weekdays: [2] };
  const today = '2026-10-15'; // 木

  it('weekly: 遅れて完了したら、サボった回を積まずに今日より後の最初の回', () => {
    expect(nextDate(tue, { current: '2026-09-29', today, completedOn: today })).toBe('2026-10-20');
  });
  it('weekly: 当日に完了したら翌週', () => {
    expect(nextDate(tue, { current: '2026-10-13', today: '2026-10-13', completedOn: '2026-10-13' })).toBe(
      '2026-10-20',
    );
  });
  it('weekly: 前倒しで完了したら、今の回の次', () => {
    expect(nextDate(tue, { current: '2026-10-20', today, completedOn: today })).toBe('2026-10-27');
  });
  it('weekly: 複数曜日', () => {
    const tueFri = { kind: 'weekly' as const, weekdays: [2, 5] };
    expect(nextDate(tueFri, { current: '2026-10-13', today: '2026-10-13', completedOn: '2026-10-13' })).toBe(
      '2026-10-16',
    );
  });
  it('monthly: 31日指定はその月の末日に丸める', () => {
    const m31 = { kind: 'monthly' as const, monthDay: 31 };
    expect(nextDate(m31, { current: '2026-01-31', today: '2026-01-31', completedOn: '2026-01-31' })).toBe(
      '2026-02-28',
    );
    expect(nextDate(m31, { current: '2026-02-28', today: '2026-02-28', completedOn: '2026-02-28' })).toBe(
      '2026-03-31',
    );
  });
  it('interval: 今の回＋N、過去なら今日を越えるまで足す', () => {
    const every3 = { kind: 'interval' as const, intervalDays: 3 };
    expect(nextDate(every3, { current: '2026-10-14', today: '2026-10-14', completedOn: '2026-10-14' })).toBe(
      '2026-10-17',
    );
    expect(nextDate(every3, { current: '2026-10-01', today, completedOn: today })).toBe('2026-10-16');
  });
  it('after_done: 完了した日＋N', () => {
    const r = { kind: 'after_done' as const, intervalDays: 10 };
    expect(nextDate(r, { current: '2026-10-01', today, completedOn: today })).toBe('2026-10-25');
  });
  it('最初の回は今日を含めて探す', () => {
    expect(firstDate({ kind: 'weekly', weekdays: [4] }, today)).toBe('2026-10-15');
    expect(firstDate({ kind: 'weekly', weekdays: [1] }, today)).toBe('2026-10-19');
    expect(firstDate({ kind: 'monthly', monthDay: 1 }, today)).toBe('2026-11-01');
    expect(firstDate({ kind: 'after_done', intervalDays: 7 }, today)).toBe(today);
  });
});
