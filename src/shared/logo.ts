// Vectodo のロゴ（2026-10-15 本人決定・案 27h「スミスの合流」）。
// スミスチャート（高周波回路の設計で使う図）を下に向けた形。すべての円弧が下の1点で交わる
// ＝いくつもの依存が合流して「次」（琥珀の輪）が動き出す。2本の円弧は Vectodo の V にも読める。
// 形と色はここが正。画面のロゴ（components/Logo.tsx）・ブラウザのタブ（public/icon.svg）・
// ホーム画面の PNG（scripts/make-icons.ts）が、どれもこれを使う。

export type LogoMode = 'dark' | 'light';

/** 色。mid は線の薄い色（地に重ねる） */
export const LOGO_COLORS = {
  dark: { tile: '#0e1120', ink: '#eef2ff', mid: 'rgba(238,242,255,0.42)', a1: '#4f6bff', a2: '#22d3ee', hot: '#ffb547', hot2: '#ff7a45' },
  light: { tile: '#f7f8fd', ink: '#121833', mid: 'rgba(18,24,51,0.34)', a1: '#3a50f0', a2: '#06a9d6', hot: '#f59e0b', hot2: '#f2541b' },
} as const;

/**
 * 外の円の中心の高さ。目に入るのは外の円なので、その中心をタイルの中心（256）のわずかに上に置く
 * （236 だと全体が上にずれて見えた・2026-10-15）。下の琥珀の輪はそのぶん下の余白に入る
 */
const CY = 252;

/**
 * 512 マスの形。外の円（中心 c・半径 R）の真下 B で、左右の円弧（半径 R・中心は B の左右 R）が交わる。
 * full はホーム画面用（縦の軸と内側の円も描く）、small は 32px 以下用（細い線を外して太く）
 */
export const LOGO = {
  tileR: 116,
  c: [256, CY] as const,
  R: 164,
  B: [256, CY + 164] as const,
  full: { outer: 18, axis: 11, res: { r: 82, w: 11 }, arc: 18, ring: { r: 32, w: 18 } },
  small: { outer: 30, arc: 30, ring: { r: 42, w: 26 } },
  /** 円弧の色の向き（左下 → 右上）と、輪の色の向き */
  arcGrad: [120, CY + 184, 420, CY - 136] as const,
  hotGrad: [200, CY + 104, 320, CY + 224] as const,
};

/** 左右の円弧の終わり（外の円と交わるところ＝外の円の左右の端） */
const LEFT_END = [LOGO.c[0] - LOGO.R, LOGO.c[1]] as const;
const RIGHT_END = [LOGO.c[0] + LOGO.R, LOGO.c[1]] as const;

function shapes(colors: { ink: string; mid: string; tile: string }, small: boolean, arc: string, hot: string): string {
  const { c, R, B } = LOGO;
  const s = small ? LOGO.small : LOGO.full;
  const lines = small
    ? ''
    : `<path d="M${c[0]} ${c[1] - R} V${B[1]}" stroke="${colors.mid}" stroke-width="${LOGO.full.axis}"/>` +
      `<circle cx="${B[0]}" cy="${B[1] - LOGO.full.res.r}" r="${LOGO.full.res.r}" stroke="${colors.mid}" stroke-width="${LOGO.full.res.w}"/>`;
  // 円弧の丸い端が外の円からはみ出さないよう、円弧を先に描いて外の円を上に重ねる
  return (
    lines +
    `<path d="M${B[0]} ${B[1]} A${R} ${R} 0 0 0 ${LEFT_END[0]} ${LEFT_END[1]} M${B[0]} ${B[1]} A${R} ${R} 0 0 1 ${RIGHT_END[0]} ${RIGHT_END[1]}" stroke="${arc}" stroke-width="${s.arc}" stroke-linecap="round"/>` +
    `<circle cx="${c[0]}" cy="${c[1]}" r="${R}" stroke="${colors.ink}" stroke-width="${s.outer}"/>` +
    `<circle cx="${B[0]}" cy="${B[1]}" r="${s.ring.r}" fill="${colors.tile}" stroke="${hot}" stroke-width="${s.ring.w}"/>`
  );
}

function gradients(id: string, a1: string, a2: string, hot: string, hot2: string): string {
  const [ax1, ay1, ax2, ay2] = LOGO.arcGrad;
  const [hx1, hy1, hx2, hy2] = LOGO.hotGrad;
  return (
    `<linearGradient id="${id}a" x1="${ax1}" y1="${ay1}" x2="${ax2}" y2="${ay2}" gradientUnits="userSpaceOnUse"><stop stop-color="${a1}"/><stop offset="1" stop-color="${a2}"/></linearGradient>` +
    `<linearGradient id="${id}h" x1="${hx1}" y1="${hy1}" x2="${hx2}" y2="${hy2}" gradientUnits="userSpaceOnUse"><stop stop-color="${hot}"/><stop offset="1" stop-color="${hot2}"/></linearGradient>`
  );
}

/** ロゴの SVG（id は1ページに複数置くときに分ける） */
export function logoSvg(mode: LogoMode, opts: { small?: boolean; id?: string } = {}): string {
  const p = LOGO_COLORS[mode];
  const id = opts.id ?? `vl${mode[0]}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%" fill="none">` +
    `<defs>${gradients(id, p.a1, p.a2, p.hot, p.hot2)}</defs>` +
    `<rect width="512" height="512" rx="${LOGO.tileR}" fill="${p.tile}"/>` +
    shapes(p, opts.small ?? false, `url(#${id}a)`, `url(#${id}h)`) +
    `</svg>`
  );
}

/** ブラウザのタブのアイコン。小さい形で、画面のテーマ（OS の明暗）に合わせて色が変わる */
export function faviconSvg(): string {
  const L = LOGO_COLORS.light;
  const D = LOGO_COLORS.dark;
  const css =
    `.t{fill:${L.tile}}.i{stroke:${L.ink}}.f{fill:${L.tile}}.a1{stop-color:${L.a1}}.a2{stop-color:${L.a2}}.h1{stop-color:${L.hot}}.h2{stop-color:${L.hot2}}` +
    `@media (prefers-color-scheme: dark){.t{fill:${D.tile}}.i{stroke:${D.ink}}.f{fill:${D.tile}}.a1{stop-color:${D.a1}}.a2{stop-color:${D.a2}}.h1{stop-color:${D.hot}}.h2{stop-color:${D.hot2}}}`;
  const [ax1, ay1, ax2, ay2] = LOGO.arcGrad;
  const [hx1, hy1, hx2, hy2] = LOGO.hotGrad;
  const { c, R, B } = LOGO;
  const s = LOGO.small;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none"><style>${css}</style>` +
    `<defs><linearGradient id="a" x1="${ax1}" y1="${ay1}" x2="${ax2}" y2="${ay2}" gradientUnits="userSpaceOnUse"><stop class="a1"/><stop offset="1" class="a2"/></linearGradient>` +
    `<linearGradient id="h" x1="${hx1}" y1="${hy1}" x2="${hx2}" y2="${hy2}" gradientUnits="userSpaceOnUse"><stop class="h1"/><stop offset="1" class="h2"/></linearGradient></defs>` +
    `<rect class="t" width="512" height="512" rx="${LOGO.tileR}"/>` +
    `<path d="M${B[0]} ${B[1]} A${R} ${R} 0 0 0 ${LEFT_END[0]} ${LEFT_END[1]} M${B[0]} ${B[1]} A${R} ${R} 0 0 1 ${RIGHT_END[0]} ${RIGHT_END[1]}" stroke="url(#a)" stroke-width="${s.arc}" stroke-linecap="round"/>` +
    `<circle class="i" cx="${c[0]}" cy="${c[1]}" r="${R}" stroke-width="${s.outer}"/>` +
    `<circle class="f" cx="${B[0]}" cy="${B[1]}" r="${s.ring.r}" stroke="url(#h)" stroke-width="${s.ring.w}"/>` +
    `</svg>\n`
  );
}
