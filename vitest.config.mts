import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Read by src/lib/config.ts when it is first imported
    env: { NEXT_PUBLIC_API_BASE_URL: "https://api.test" },
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Every exclusion is listed with its reason in docs/TEST_FINDINGS.md
      exclude: [
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/lib/i18n/fr.ts",
        "src/lib/i18n/ar.ts",
      ],
      reporter: ["text-summary", "html", "json-summary"],
      // Raised after each phase so coverage can only go up (see the plan)
      thresholds: {
        "src/lib/**": { lines: 95, functions: 95, branches: 90, statements: 95 },
      },
    },
  },
});
