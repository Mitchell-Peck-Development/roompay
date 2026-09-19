import { defineConfig, devices } from "@playwright/test"

const PORT = 3001

/**
 * End-to-end smoke run against the app on its in-process database (PGlite),
 * so it exercises the real migration without touching Supabase.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["iPhone 15"], browserName: "chromium" } },
  ],
  webServer: {
    command: "pnpm --filter app dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { RP_BACKEND: "pglite", RP_PGLITE_DIR: "memory://" },
  },
})
