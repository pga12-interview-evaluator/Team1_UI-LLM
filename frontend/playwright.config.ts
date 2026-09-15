import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
const consolePassword = process.env.E2E_CONSOLE_PASSWORD ?? "change-me";

/**
 * Locally: `npm run dev` in one terminal, then `PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run e2e`
 * (Next 16 allows one dev server per directory). CI: `npm run build` then `npm run e2e` — the config
 * starts the production server on 3100 with mock mode and known dev credentials.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    permissions: ["microphone", "camera"],
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
    extraHTTPHeaders: {},
  },
  metadata: { consolePassword },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npx next start --port 3100",
        url: "http://localhost:3100",
        reuseExistingServer: true,
        env: {
          NEXT_PUBLIC_API_MODE: "mock",
          CONSOLE_DEV_PASSWORD: consolePassword,
          CONSOLE_COOKIE_SECRET: "e2e-secret-e2e-secret-e2e-secret",
        },
        timeout: 120_000,
      },
});
