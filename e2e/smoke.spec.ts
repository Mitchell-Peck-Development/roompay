import { type Browser, type Page, expect, test } from "@playwright/test"

// The artifact's own example month: $1,910 split evenly two ways.
const BILL = {
  Rent: "1648",
  "Service fee": "6",
  "Trash disposal": "20",
  Sewer: "38",
  Water: "38",
  Power: "160",
}

async function setUp(page: Page, roommate = "Biscuit") {
  await page.goto("/")
  await page.getByLabel("What should we call this place?").fill("Unit 3012")
  await page.getByLabel("A nickname for your roommate").fill(roommate)
  await page.getByRole("button", { name: "Start splitting" }).click()
  await expect(page.getByText("This month's bill")).toBeVisible()
}

async function enterBill(page: Page) {
  for (const [label, amount] of Object.entries(BILL)) {
    await page.getByLabel(label, { exact: true }).fill(amount)
  }
  await page.getByLabel("Power", { exact: true }).blur()
}

/** A fresh device: its own storage, and no native share sheet (so links are copied). */
async function newDevice(browser: Browser, colorScheme: "light" | "dark" = "light") {
  const context = await browser.newContext({ colorScheme })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true })
  })
  return context.newPage()
}

test("owner publishes, roommate picks a plan and gets the dates, owner sees the pick", async ({ page, browser }) => {
  await setUp(page)
  await enterBill(page)
  await expect(page.getByTestId("total-bill")).toHaveText("$1,910.00")
  await expect(page.getByTestId("share-Biscuit")).toHaveText("$955.00")

  await page.getByRole("button", { name: "Publish & share" }).click()
  const shareUrl = page.getByTestId("share-url")
  await expect(shareUrl).toBeVisible()
  const url = await shareUrl.inputValue()
  expect(url).toMatch(/\/r\/[A-Za-z0-9_-]{22}\/\d{4}-\d{2}$/)

  // Publishing saves the month to History.
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible()

  // --- the roommate, on their own device
  const roommate = await newDevice(browser, "dark")
  await roommate.goto(url)
  await expect(roommate.getByText("Unit 3012")).toBeVisible()
  await expect(roommate.getByTestId("roommate-share")).toHaveText("$955.00")
  await expect(roommate.getByRole("radio")).toHaveCount(3)
  // Link previews and search engines get nothing useful.
  await expect(roommate).toHaveTitle("Your share · RoomPay")
  await expect(roommate.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)

  await roommate.getByRole("radio", { name: /Weekly/ }).click()
  await expect(roommate.getByTestId("pick-feedback")).toContainText("Weekly")

  const token = new URL(url).pathname.split("/")[2]!
  const feed = await roommate.request.get(`/r/${token}/calendar.ics`)
  expect(feed.headers()["content-type"]).toBe("text/calendar; charset=utf-8")
  const ics = await feed.text()
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4)
  expect(ics).toContain("SUMMARY:Pay $238.75 · Unit 3012")

  // --- back on the owner's device
  await page.reload()
  await expect(page.getByTestId("pick-status")).toHaveText("Biscuit picked Weekly.")
  await page.getByRole("button", { name: "Mark paid" }).first().click()
  await expect(page.getByText("$238.75 of $955.00 received")).toBeVisible()

  // Changing a number flags the link as stale until it's updated.
  await page.getByLabel("Water", { exact: true }).fill("40")
  await page.getByLabel("Water", { exact: true }).blur()
  await page.getByRole("button", { name: "Update link" }).click()
  await expect(page.getByText(/up to date/)).toBeVisible()
  await roommate.reload()
  await expect(roommate.getByTestId("roommate-share")).toHaveText("$956.00")

  // Deleting the link ends it for the roommate and empties the feed.
  await page.getByRole("button", { name: "Link options" }).click()
  await page.getByRole("menuitem", { name: /Delete Biscuit's link/ }).click()
  await page.getByRole("button", { name: "Delete link" }).click()
  await expect(page.getByRole("button", { name: "Publish & share" })).toBeVisible()
  const gone = await roommate.goto(url)
  expect(gone?.status()).toBe(404)
  await expect(roommate.getByText("This link has ended")).toBeVisible()
  expect((await (await roommate.request.get(`/r/${token}/calendar.ics`)).text())).not.toContain("BEGIN:VEVENT")
})

test("a backup moves everything to another device", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "file download flow is covered on desktop")
  await setUp(page, "3012-B")
  await enterBill(page)
  await page.getByRole("button", { name: "Save month" }).click()
  await page.getByRole("navigation").first().getByRole("button", { name: "Setup" }).click()

  const downloading = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export backup" }).click()
  const file = await (await downloading).path()
  await expect(page.getByText("Last backup: today.")).toBeVisible()

  const other = await newDevice(browser)
  await other.goto("/")
  await other.locator('input[type="file"]').setInputFiles(file)
  await expect(other.getByText("This month's bill")).toBeVisible()
  await expect(other.getByTestId("share-3012-B")).toHaveText("$955.00")
  await other.getByRole("navigation").first().getByRole("button", { name: "History" }).click()
  await expect(other.getByText("$1,910.00")).toBeVisible()
})
