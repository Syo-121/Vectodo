# 別のマシンへ移す手順

たとえば「手元の PC の WSL で動かしていたものを、常時つけておく別の PC（Ubuntu Server など）へ移す」ときの手順。⛔ **コピーで移す**（元のマシンは、切り替えが終わるまで消さない）。

## 前提

- 移す先に Node 22.13 以上（`node:sqlite` が使えること）・git・（スマホから開くなら）Tailscale が入っている。
- 移す先のユーザー名・tailnet の名前を確認しておく（下の `<user>`・`<host>`・`<tailnet>`）。

## 手順

1. **元のマシンでアプリを止める**: `sudo systemctl stop task-app`（止めてから DB を写す。動いたままだと最新の書き込みが漏れる）
2. **コードを運ぶ**: GitHub から `git clone` するか、`git bundle create task-app.bundle --all` → 移す先で `git clone task-app.bundle`
3. **依存を入れ直して画面をビルド**: 移す先で `npm install && npm run build`（`node_modules`・`dist` はコピーしない）
4. **DB を運ぶ**: 元の `data/tasks.db` を移す先の `data/` へ（`-wal`・`-shm` が残っていれば一緒に運ぶ）
5. **config.json を書き換える**:
   - `backupDir`: 移す先でバックアップに乗る場所へ
   - `allowedHosts`: `localhost`・`127.0.0.1`・`<host>.<tailnet>.ts.net`
   - `gcal.appUrl`: `https://<host>.<tailnet>.ts.net:5180`（カレンダーの予定に載るリンク）
6. **Google カレンダーの資格情報を運ぶ**: `~/.config/task-app/`（`google-client.json`・`google-token.json`）を移す先の同じ場所へ（ディレクトリ `700`・ファイル `600`）。⛔ USB やクラウドに平文で置きっぱなしにしない。運ばなかったら移す先の設定画面から「Google につなぐ」をやり直せばよい（同期の状態は DB の `gcal_events` にあるので、二重に作らない）。
7. **常駐**: `deploy/task-app.service` の `<ユーザー名>`・`<置き場所>` を直して `/etc/systemd/system/` へ → `sudo systemctl enable --now task-app`
8. **tailnet へ公開**: `tailscale serve --bg --https=5180 http://127.0.0.1:5180`
9. **MCP の登録**: 移す先の Claude Code で `claude mcp add --transport http --scope user task-app http://localhost:5180/mcp`
10. **確認**:
    - [ ] `curl -H 'Host: localhost' http://127.0.0.1:5180/api/health` が `{"ok":true}`
    - [ ] タスクの件数が元と一致（MCP の `list_tasks view=all include_done=true` の行数）
    - [ ] スマホのホーム画面のアイコンを新しい URL で作り直して開ける
    - [ ] Claude Code から `list_tasks` が通る
    - [ ] 翌日にバックアップのファイルができている
11. **切り替え後**: 元のマシンは `sudo systemctl disable --now task-app`、元のマシンの Claude Code の MCP 登録を消す（または移す先を向ける）。元のフォルダは1週間ほど残してから片付ける。

## 戻すとき

移す先で不具合が出たら、元のマシンで `sudo systemctl start task-app` すれば戻る（手順 1 で止めた時点の DB のまま）。移す先で書き込んだ分は、移す先の `data/tasks.db` を元へ写し戻す。
