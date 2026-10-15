// 画面の外枠をキャッシュして起動を速くする（design 7-9）。
// データ（/api の読み取り）はネットワーク優先で、取れた中身を端末に残しておく。つながらない（電波がない・PC が止まっている）
// ときや WAIT ミリ秒で返らないときは、残しておいた最後の中身を返す＝読むだけならオフラインでも使える。
// そのときは印 x-vectodo-saved（保存した時刻）が付くので、画面は「つながっていない」と出す（web/offline.ts）。
// 書き込みは素通し（つながらない書き込みは画面が端末に溜めて、つながったら送る＝web/outbox.ts）。

const CACHE = 'task-app-shell-v1';
const DATA = 'task-app-data-v1';
const WAIT = 4000;
/** 残しておく読み取りの数（週や月を送るたびに増えるので、古いものから捨てる） */
const KEEP = 300;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/mcp') || url.pathname === '/api/health' || url.pathname === '/api/gcal/connect') return;
  // 書き溜めを送るとき（web/outbox.ts）は、残しておいた中身でなく今の中身が要る
  if (e.request.headers.get('x-vectodo-live')) return;
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkOrSaved(e.request));
    return;
  }

  // ビルド済みの JS・CSS はファイル名にハッシュが付くのでキャッシュ優先
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ??
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // ページ本体はネットワーク優先（つながらないときだけキャッシュ）
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
  }
});

/** 読み取り: 取れたら残して返す。つながらない・WAIT で返らないときは残しておいた中身（印つき）。それも無ければネットワークの結果を待つ */
async function networkOrSaved(req) {
  const net = fetch(req).then(async (res) => {
    if (res.ok && res.type === 'basic') {
      const headers = new Headers(res.headers);
      headers.set('x-vectodo-saved', new Date().toISOString());
      const saved = new Response(await res.clone().blob(), { status: res.status, statusText: res.statusText, headers });
      const c = await caches.open(DATA);
      await c.put(req, saved);
      const keys = await c.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - KEEP)).map((k) => c.delete(k)));
    }
    return res;
  });
  net.catch(() => {});
  const late = new Promise((resolve) => setTimeout(() => resolve(null), WAIT));
  try {
    const res = await Promise.race([net, late]);
    if (res) return res;
  } catch {
    // つながらない → 残しておいた中身へ
  }
  const hit = await caches.match(req, { cacheName: DATA });
  return hit ?? net;
}
