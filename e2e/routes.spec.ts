import { expect, test } from "@playwright/test"
import { SUPPORT_URL } from "../apps/app/lib/support"

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
  await expect(page.getByRole("heading", { name: "What should we call this place?" })).toBeVisible()
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

/**
 * RoomPay has no paid tier, so the tip jar is the whole of its funding — and
 * one constant switches it on or off everywhere. Either it's configured and
 * every surface points at the same address, or it isn't and nothing asks. A
 * half-wired tip link, pointing somewhere that isn't there, is the one
 * outcome worth failing a build over.
 */
test("the tip jar is wired everywhere, or nowhere", async ({ page }) => {
  await page.goto("/")
  const landing = page.getByTestId("support-link")

  if (!SUPPORT_URL) {
    await expect(landing).toHaveCount(0)
    return
  }

  // Twice on the landing page: the band that explains why it's free, and the footer.
  expect(await landing.count()).toBeGreaterThan(1)
  for (const link of await landing.all()) {
    await expect(link).toHaveAttribute("href", SUPPORT_URL)
    // Nothing follows the person out — not even where they came from.
    await expect(link).toHaveAttribute("rel", /noopener/)
    await expect(link).toHaveAttribute("rel", /noreferrer/)
  }

  // And again in the app, once there's a household to see it from.
  await page.goto("/app")
  await page.getByLabel("Name of the place").fill("Unit 3012")
  await page.getByRole("button", { name: "Next" }).click()
  await page.getByLabel("Nickname").fill("Biscuit")
  await page.getByRole("button", { name: "Next" }).click()
  await page.getByRole("button", { name: /^Start / }).click()
  await page.getByRole("navigation").first().getByRole("button", { name: "Setup" }).click()

  await expect(page.getByTestId("support-link")).toHaveAttribute("href", SUPPORT_URL)
})
