import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** ビルドごとの版（ビルドした時刻）。画面に埋め込み、同じ値を version.json にも書く（design 7-9 の「アプリを更新」） */
const BUILD = new Date().toISOString();

const versionFile = (): Plugin => ({
  name: "vectodo-version",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD }) });
  },
});

// 画面のビルド設定。本番は Hono が dist/web を配信する。
export default defineConfig({
  root: "src/web",
  plugins: [react(), tailwindcss(), versionFile()],
  define: { __VECTODO_BUILD__: JSON.stringify(BUILD) },
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: {
    port: 5181,
    proxy: { "/api": "http://127.0.0.1:5180" },
  },
});
