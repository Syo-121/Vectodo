// Vectodo のロゴ（2026-10-15 本人決定・「スミスの合流」）。形と色の正は shared/logo.ts。
// 画面の左上は小さいので、細い線を外した小さい形を使う。ライト・ダークで地の色が変わる（html.dark で切り替え）。

import { logoSvg } from '../../shared/logo.ts';
import { cx } from '../util.ts';

export const APP_NAME = 'Vectodo';

const LIGHT = logoSvg('light', { small: true, id: 'logol' });
const DARK = logoSvg('dark', { small: true, id: 'logod' });

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cx('relative inline-block', className)} aria-hidden="true">
      <span className="block size-full dark:hidden" dangerouslySetInnerHTML={{ __html: LIGHT }} />
      <span className="hidden size-full dark:block" dangerouslySetInnerHTML={{ __html: DARK }} />
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx('flex items-center gap-2', className)}>
      <LogoMark className="size-6" />
      <span className="text-[17px] font-bold tracking-tight">{APP_NAME}</span>
    </span>
  );
}
