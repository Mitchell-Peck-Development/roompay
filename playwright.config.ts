import { defineConfig, devices } from "@playwright/test"

// Its own port, so a dev server already running on 3001 is never reused (it
// may hold an older database or build). Next allows one `next dev` per app, so
// this runs a production build — closer to what ships anyway.
const PORT = 3101

/**
 * End-to-end smoke run against the app on its in-process database (PGlite),
 * so it exercises the real migrations without touching Supabase.
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
    command: `pnpm --filter app build && pnpm --filter app exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { RP_BACKEND: "pglite", RP_PGLITE_DIR: "memory://", APP_URL: `http://localhost:${PORT}` },
  },
})
