// アプリ（画面）の版と更新（design 7-9）。ホーム画面に置いた PWA は、開き直しても読み込み直さずに前の画面のまま再開するうえ、
// 再読み込みのボタンも無いので、新しい版を出しても古い画面のまま使い続けてしまう。ビルドごとの版（vite.config.ts が画面に埋め込み、
// 同じ値を version.json に書く）を比べて、新しい版があれば上の帯と設定から入れ替えられるようにする。

import { useEffect, useState } from 'react';
import { TZ } from './util.ts';

/** この画面のビルドの時刻（ISO）。開発中（vite の dev サーバ）は 'dev' */
export const BUILD: string = typeof __VECTODO_BUILD__ !== 'undefined' ? __VECTODO_BUILD__ : 'dev';

/** サーバにある最新の版。つながらない・取れないときは null */
export async function latestBuild(): Promise<string | null> {
  try {
    // サービスワーカーは /version.json を素通しにする（/api でも /assets でもないため）。端末のキャッシュも使わない
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { build?: unknown };
    return typeof body.build === 'string' ? body.build : null;
  } catch {
    return null;
  }
}

/** 最新の版。開いたときと、アプリに戻ってきたとき（画面が見えるようになったとき）に確かめ直す */
export function useLatestBuild(): { latest: string | null; checked: boolean; hasUpdate: boolean } {
  const [state, setState] = useState<{ latest: string | null; checked: boolean }>({ latest: null, checked: false });
  useEffect(() => {
    let alive = true;
    const check = () => void latestBuild().then((latest) => alive && setState({ latest, checked: true }));
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return { ...state, hasUpdate: state.latest !== null && BUILD !== 'dev' && state.latest !== BUILD };
}

/**
 * 新しい版に入れ替えて読み込み直す: サービスワーカーを更新し、画面の外枠のキャッシュ（古い index.html と JS・CSS）を捨ててから
 * 読み込み直す。データ（オフライン用に残した読み取り）と端末の設定は残す。
 * つながっていないときは何もしないで false（外枠を捨てると、つながるまで開けなくなるため）。
 */
export async function updateApp(): Promise<boolean> {
  if ((await latestBuild()) === null) return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.update();
      const next = reg.installing ?? reg.waiting;
      if (next) {
        // 新しいサービスワーカーが動き出すまで少し待つ（sw.js は skipWaiting するのですぐ入れ替わる）
        await new Promise<void>((done) => {
          next.addEventListener('statechange', () => next.state === 'activated' && done());
          setTimeout(done, 3000);
        });
      }
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('task-app-shell')).map((k) => caches.delete(k)));
    }
  } catch {
    // 片付けに失敗しても、読み込み直しはする
  }
  location.reload();
  return true;
}

/** 版の表示「10/20 15:40」（JST） */
export function fmtBuild(iso: string): string {
  if (iso === 'dev') return '開発中';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
