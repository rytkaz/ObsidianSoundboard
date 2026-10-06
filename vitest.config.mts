import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The real "obsidian" package only ships types, so tests run against an in-memory mock.
    alias: { obsidian: fileURLToPath(new URL("./test/mocks/obsidian.ts", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // host.ts only declares an interface; there is no code to cover.
      exclude: ["src/ui/host.ts"],
      thresholds: { statements: 95, branches: 85, functions: 92, lines: 95 },
      reporter: ["text-summary", "text", "html", "lcov"],
    },
  },
});
