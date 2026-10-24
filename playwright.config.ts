import { defineConfig, devices } from "@playwright/test";

// End-to-end tests: the production build in a real browser, with the backend
// replaced by e2e/mock-api.ts. Run with `npm run e2e`.
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    timezoneId: "Africa/Algiers",
    locale: "en-GB",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The API address is baked into the bundle at build time
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/signin`,
    env: { NEXT_PUBLIC_API_BASE_URL: "https://api.e2e.test" },
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
