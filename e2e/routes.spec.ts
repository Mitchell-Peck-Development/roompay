import { expect, test } from "@playwright/test"

/**
 * One origin serves three things, and which one sits at "/" matters: a
 * visitor who lands on the app's first-run screen instead of the landing
 * page has no idea what they're being asked to set up.
 */
test("the landing page is at /, the app is at /app", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /Split the rent/ })).toBeVisible()
  await expect(page).toHaveTitle(/Split rent and bills/)

  await page.getByRole("link", { name: "Open RoomPay" }).first().click()
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByLabel("What should we call this place?")).toBeVisible()
})

test("the installed app starts at /app and keeps its identity", async ({ page }) => {
  const manifest = await (await page.request.get("/manifest.webmanifest")).json()
  // `id` stays "/" so an existing install is updated, not duplicated.
  expect(manifest).toMatchObject({ id: "/", start_url: "/app", scope: "/app" })
})

test("the landing page is shareable and indexable", async ({ page }) => {
  const og = await page.request.get("/opengraph-image")
  expect(og.status()).toBe(200)
  expect(og.headers()["content-type"]).toContain("image/png")
  for (const path of ["/robots.txt", "/sitemap.xml"]) {
    expect((await page.request.get(path)).status()).toBe(200)
  }
  await page.goto("/")
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /.+/)
})
