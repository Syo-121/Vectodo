// 画面幅の判定（広い画面では一覧と詳細を左右に並べる・design 7-1）。

import { useEffect, useState, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Tailwind の lg（1024px）以上 */
export const useWideScreen = () => useMediaQuery('(min-width: 1024px)');

/**
 * スマホでキーボードが出ているときの、隠れていない範囲（visualViewport）。出ていないとき・拡大しているときは null。
 * 画面いっぱいに開くもの（ノートのエディタ）をこの範囲に合わせると、下の端がキーボードの裏に入らない
 */
export function useKeyboardViewport(): { top: number; height: number } | null {
  const [v, setV] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = document.documentElement.clientHeight - vv.height > 1 && Math.abs(vv.scale - 1) < 0.01;
      const next = covered ? { top: vv.offsetTop, height: vv.height } : null;
      setV((x) => (x?.top === next?.top && x?.height === next?.height ? x : next));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return v;
}
