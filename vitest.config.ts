import { defineConfig } from "vitest/config";

// テストは画面のビルド設定（vite.config.ts の root=src/web）とは別に、リポジトリ直下から test/ を探す
export default defineConfig({ test: { root: ".", include: ["test/**/*.test.ts"] } });
