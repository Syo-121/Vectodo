import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 画面のビルド設定。本番は Hono が dist/web を配信する。
export default defineConfig({
  root: "src/web",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: {
    port: 5181,
    proxy: { "/api": "http://127.0.0.1:5180" },
  },
});
