// アプリの設定。既定値はここが正で、変えたものだけ settings テーブルに入る。

import { z } from 'zod';
import type { DB } from './db.ts';
import { badRequest } from './errors.ts';

export const zSettings = z.object({
  /** 1日に使えるタスク時間（分）。週ビューの詰め込みすぎ警告の基準 */
  dailyCapacityMin: z.number().int().min(30).max(24 * 60),
  /** 今日の流れ（design 4-11）: 起きている時間帯（0:00 からの分）。この間の予定の無い時間を「空き」に数える */
  dayStartMin: z.number().int().min(0).max(24 * 60),
  dayEndMin: z.number().int().min(0).max(24 * 60),
  /** Google カレンダー同期（design 4-7）: カテゴリに書き込み先が無いときのカレンダー */
  gcalDefaultCalendarId: z.string().min(1).nullable(),
  /** tasks.md 時代の予定を引き取り済みか（一度だけ・日時） */
  gcalLegacyAdoptedAt: z.string().nullable(),
});
export type Settings = z.infer<typeof zSettings>;
export const zSettingsPatch = zSettings.partial();

const DEFAULTS: Settings = {
  dailyCapacityMin: 360,
  dayStartMin: 8 * 60,
  dayEndMin: 23 * 60,
  gcalDefaultCalendarId: null,
  gcalLegacyAdoptedAt: null,
};

export class SettingsService {
  constructor(private readonly db: DB) {}

  get(): Settings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value) as unknown]));
    return zSettings.parse({ ...DEFAULTS, ...stored });
  }

  update(patch: z.infer<typeof zSettingsPatch>): Settings {
    const merged = { ...this.get(), ...patch };
    if (merged.dayStartMin >= merged.dayEndMin) throw badRequest('起きる時刻は寝る時刻より前にする');
    const upsert = this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    );
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) upsert.run(k, JSON.stringify(v));
    return this.get();
  }
}
