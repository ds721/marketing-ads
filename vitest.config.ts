import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
  // Node tests don't process CSS; skip the app's Tailwind PostCSS pipeline.
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
