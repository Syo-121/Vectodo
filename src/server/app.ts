// HTTP の入口。/api（画面）・/mcp（AI）・画面の静的ファイルを1つのサーバに載せる。

import fs from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { createApi, type Services } from './api.ts';
import { handleMcp } from './mcp.ts';

export interface AppOptions {
  /** Host ヘッダのホスト名の許可リスト（DNS リバインディング対策） */
  allowedHosts: string[];
  /** ビルド済みの画面（dist/web）。無ければ配信しない */
  webRoot?: string;
}

export function createApp(s: Services, opts: AppOptions): Hono {
  const app = new Hono();
  const allowed = new Set(opts.allowedHosts.map((h) => h.toLowerCase()));

  app.use('*', async (c, next) => {
    // 悪意あるサイトが自分のドメインを 127.0.0.1 に向けて読み書きする攻撃を防ぐ
    const host = (c.req.header('host') ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
    if (!allowed.has(host)) return c.text('forbidden host', 403);
    // ブラウザの「単純リクエスト」（text/plain の POST）で書き込まれるのを防ぐ
    if (c.req.path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(c.req.method)) {
      if (!(c.req.header('content-type') ?? '').startsWith('application/json')) {
        return c.json({ error: 'Content-Type は application/json で' }, 415);
      }
    }
    await next();
    // 書き込んだら Google カレンダーへの同期を予約する（少し待ってまとめて送る・design 4-7）
    const p = c.req.path;
    // 目標はカレンダーに出ないので数えない
    const write = p === '/mcp' || (p.startsWith('/api/') && !p.startsWith('/api/gcal/') && !p.startsWith('/api/goals'));
    if (s.gcal && write && c.req.method !== 'GET' && c.res.status < 400) s.gcal.kick();
  });

  app.route('/api', createApi(s));
  app.all('/mcp', (c) => handleMcp(s, c.req.raw));

  // Google の同意画面からの戻り先（PC のブラウザで 127.0.0.1 に戻ってくる）
  app.get('/oauth/callback', async (c) => {
    if (!s.gcal) return c.text('Google カレンダー同期は動いていない', 404);
    const back = (m: string) => c.redirect(`/settings?gcal=${encodeURIComponent(m)}`);
    const error = c.req.query('error');
    if (error) return back(`つなげなかった（${error}）`);
    try {
      await s.gcal.connect(c.req.query('code') ?? '', c.req.query('state') ?? '');
      return back('ok');
    } catch (e) {
      return back(e instanceof Error ? e.message : String(e));
    }
  });

  const webRoot = opts.webRoot;
  if (webRoot && fs.existsSync(path.join(webRoot, 'index.html'))) {
    const rel = path.relative(process.cwd(), webRoot);
    // 名前にハッシュが付く /assets は長く持たせ、版が変わるもの（index.html・sw.js・manifest・version.json・アイコン）は
    // 毎回サーバに確かめさせる（端末に古い画面が残らないように・design 7-9）
    const cache = (p: string, c: Context) =>
      void c.header('Cache-Control', p.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    app.use('/*', serveStatic({ root: rel, onFound: cache }));
    // 画面内のパス（/inbox など）は index.html を返して画面側のルーターに任せる
    app.get('*', serveStatic({ root: rel, path: 'index.html', onFound: cache }));
  }
  return app;
}
