// PWA のアイコン（Vectodo のロゴ＝「スミスの合流」・2026-10-15 本人決定）を PNG で作り、ブラウザのタブ用の SVG も書く。
// 形と色の正は src/shared/logo.ts。ホーム画面は1枚しか置けないので、明るい壁紙でも暗い壁紙でも沈まないダーク版。
// 画像ライブラリを使わず zlib だけで書く（形は円・線分・円弧だけなので、点からの距離で塗る）。
// 実行: npx tsx scripts/make-icons.ts

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { faviconSvg, LOGO, LOGO_COLORS } from '../src/shared/logo.ts';

const OUT = path.join(import.meta.dirname, '../src/web/public');

type RGB = [number, number, number];
/** 塗り: 単色（a は不透明度）か、512 マスの (x1,y1)→(x2,y2) のグラデーション */
type Paint = { c: RGB; a: number } | { g: readonly [number, number, number, number]; c1: RGB; c2: RGB };
/** 図形（座標は 512 マス）。ring＝円の線・disc＝塗った円・seg＝線分・arc＝円弧（角度は度・from から to へ時計回り） */
type Shape =
  | { t: 'ring'; cx: number; cy: number; r: number; w: number; paint: Paint }
  | { t: 'disc'; cx: number; cy: number; r: number; paint: Paint }
  | { t: 'seg'; x1: number; y1: number; x2: number; y2: number; w: number; paint: Paint }
  | { t: 'arc'; cx: number; cy: number; r: number; w: number; from: number; to: number; paint: Paint };

function color(s: string): { c: RGB; a: number } {
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(s);
  if (m) return { c: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) };
  const h = s.replace('#', '');
  return { c: [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)], a: 1 };
}

/** ダーク版の、ホーム画面用（細い線も描く）の図形 */
function scene(): { tile: RGB; shapes: Shape[] } {
  const p = LOGO_COLORS.dark;
  const { c, R, B } = LOGO;
  const f = LOGO.full;
  const arc: Paint = { g: LOGO.arcGrad, c1: color(p.a1).c, c2: color(p.a2).c };
  const hot: Paint = { g: LOGO.hotGrad, c1: color(p.hot).c, c2: color(p.hot2).c };
  const tile = color(p.tile).c;
  return {
    tile,
    shapes: [
      { t: 'seg', x1: c[0], y1: c[1] - R, x2: B[0], y2: B[1], w: f.axis, paint: color(p.mid) },
      { t: 'ring', cx: B[0], cy: B[1] - f.res.r, r: f.res.r, w: f.res.w, paint: color(p.mid) },
      // 左の円弧（中心は B の左 R）: 0°（B）から反時計回りに 270°（外の円の左端）まで＝時計回りに 270°→360°
      { t: 'arc', cx: B[0] - R, cy: B[1], r: R, w: f.arc, from: 270, to: 360, paint: arc },
      // 右の円弧（中心は B の右 R）: 180°（B）から時計回りに 270°（外の円の右端）まで
      { t: 'arc', cx: B[0] + R, cy: B[1], r: R, w: f.arc, from: 180, to: 270, paint: arc },
      // 外の円は円弧の上に重ねる（円弧の丸い端が外にはみ出さない）
      { t: 'ring', cx: c[0], cy: c[1], r: R, w: f.outer, paint: color(p.ink) },
      { t: 'disc', cx: B[0], cy: B[1], r: f.ring.r, paint: { c: tile, a: 1 } },
      { t: 'ring', cx: B[0], cy: B[1], r: f.ring.r, w: f.ring.w, paint: hot },
    ],
  };
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** 点 p と線分 ab の距離 */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 中心 (cx, cy)・半辺 h・角丸 r の角丸四角の輪郭までの符号付き距離（内側が負） */
function distToRoundRect(px: number, py: number, cx: number, cy: number, h: number, r: number): number {
  const qx = Math.abs(px - cx) - (h - r);
  const qy = Math.abs(py - cy) - (h - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 512 マスの点 (x, y) での図形の覆い具合（0〜1・端は1px でなめらかに）。k は 512 マス → ピクセルの倍率 */
function coverage(s: Shape, x: number, y: number, k: number): number {
  if (s.t === 'disc') return clamp01((s.r - Math.hypot(x - s.cx, y - s.cy)) * k + 0.5);
  let d: number;
  switch (s.t) {
    case 'ring':
      d = Math.abs(Math.hypot(x - s.cx, y - s.cy) - s.r);
      break;
    case 'seg':
      d = distToSegment(x, y, s.x1, s.y1, s.x2, s.y2);
      break;
    case 'arc': {
      const a = ((Math.atan2(y - s.cy, x - s.cx) * 180) / Math.PI + 360) % 360;
      const span = (s.to - s.from + 360) % 360 || 360;
      const rel = (a - s.from + 360) % 360;
      if (rel <= span) d = Math.abs(Math.hypot(x - s.cx, y - s.cy) - s.r);
      else {
        // 範囲の外は、両端の丸い端までの距離
        const end = (deg: number) => [s.cx + s.r * Math.cos((deg * Math.PI) / 180), s.cy + s.r * Math.sin((deg * Math.PI) / 180)];
        const [x1, y1] = end(s.from);
        const [x2, y2] = end(s.to);
        d = Math.min(Math.hypot(x - x1!, y - y1!), Math.hypot(x - x2!, y - y2!));
      }
      break;
    }
  }
  return clamp01((s.w / 2 - d) * k + 0.5);
}

function paintAt(paint: Paint, x: number, y: number): { c: RGB; a: number } {
  if ('c' in paint) return paint;
  const [x1, y1, x2, y2] = paint.g;
  const t = clamp01(((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2));
  return { c: [0, 1, 2].map((i) => paint.c1[i]! + (paint.c2[i]! - paint.c1[i]!) * t) as RGB, a: 1 };
}

function icon(size: number, maskable: boolean): Buffer {
  const { tile, shapes } = scene();
  const raw = Buffer.alloc((size * 4 + 1) * size);
  // maskable は全面塗りにして、中身を安全領域（真ん中の 80% の円）に収める
  const s = maskable ? 0.72 : 1;
  const k = (size / 512) * s; // 512 マス → ピクセル
  const half = size / 2;
  const corner = maskable ? 0 : LOGO.tileR * (size / 512);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      const cx = px + 0.5;
      const cy = py + 0.5;
      // 背景の角丸の外は透明
      const alpha = maskable ? 1 : clamp01(0.5 - distToRoundRect(cx, cy, half, half, half, corner));
      const x = 256 + (cx - half) / k;
      const y = 256 + (cy - half) / k;
      let col: number[] = [...tile];
      for (const sh of shapes) {
        const cov = coverage(sh, x, y, k);
        if (cov <= 0) continue;
        const { c, a } = paintAt(sh.paint, x, y);
        const m = cov * a;
        col = col.map((v, i) => v * (1 - m) + c[i]! * m);
      }
      const i = py * (size * 4 + 1) + 1 + px * 4;
      for (let j = 0; j < 3; j++) raw[i + j] = Math.round(col[j]!);
      raw[i + 3] = Math.round(alpha * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon-192.png'), icon(192, false));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), icon(512, false));
fs.writeFileSync(path.join(OUT, 'icon-maskable-512.png'), icon(512, true));
fs.writeFileSync(path.join(OUT, 'icon.svg'), faviconSvg());
console.log('icons written to', OUT);
