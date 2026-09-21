import { readFile } from "node:fs/promises"
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

/** Walks the three onboarding steps. `movedIn` sets a mid-month arrival. */
async function setUp(page: Page, roommate = "Biscuit", movedIn?: string) {
  await page.goto("/app")
  await page.getByLabel("Name of the place").fill("Unit 3012")
  await page.getByRole("button", { name: "Next" }).click()
  await page.getByLabel("Nickname").fill(roommate)
  if (movedIn) await page.getByLabel(/Moved in/).fill(movedIn)
  await page.getByRole("button", { name: "Next" }).click()
  await page.getByLabel("Rent", { exact: true }).fill("1648")
  await page.getByRole("button", { name: /finish setting up/i }).click()
  // Setting up lands on the checklist, not on a month whose amounts would
  // only count for that month.
  await expect(page.getByTestId("setup-progress")).toBeVisible()
  await openTab(page, "Month")
  await expect(page.getByText("This month's bill")).toBeVisible()
}

/** Either nav — the header one on desktop, the bottom bar on a phone. */
function openTab(page: Page, label: string) {
  return page.getByRole("navigation").first().getByRole("button", { name: label }).click()
}

async function enterBill(page: Page) {
  for (const [label, amount] of Object.entries(BILL)) {
    await page.getByLabel(label, { exact: true }).fill(amount)
  }
  await page.getByLabel("Power", { exact: true }).blur()
}

/** A fresh device: its own storage, and no native share sheet (so links are copied). */
async function newDevice(browser: Browser, colorScheme: "light" | "dark" = "light") {
  const context = await browser.newContext({ colorScheme, timezoneId: "America/Chicago" })
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

  // Subscribing is the main calendar action, and it carries the roommate's time zone.
  const subscribe = roommate.getByRole("link", { name: /^Subscribe in/ }).first()
  await expect(subscribe).toHaveAttribute("href", /Chicago/)

  const token = new URL(url).pathname.split("/")[2]!
  const feed = await roommate.request.get(`/r/${token}/calendar.ics`)
  expect(feed.headers()["content-type"]).toBe("text/calendar; charset=utf-8")
  const ics = await feed.text()
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4)
  expect(ics).toMatch(/SUMMARY:(Future|Pending|Pay now|Overdue) · Pay \$238\.75 · Unit 3012/)
  expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:P1D")

  // --- back on the owner's device
  await page.reload()
  await expect(page.getByTestId("pick-status")).toHaveText("Biscuit picked Weekly.")
  await page.getByRole("button", { name: "Mark paid" }).first().click()
  await expect(page.getByText("$238.75 of $955.00 received")).toBeVisible()

  // The received total reaches the roommate's calendar and their page.
  await expect
    .poll(async () => (await roommate.request.get(`/r/${token}/calendar.ics?tz=America/Chicago`)).text())
    .toContain("SUMMARY:Paid · $238.75 · Unit 3012")
  await roommate.reload()
  await expect(roommate.getByTestId("received")).toHaveText("$238.75 received so far · $716.25 to go")

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
  await other.goto("/app")
  await other.locator('input[type="file"]').setInputFiles(file)
  // A device that has only just been handed the data opens on the checklist,
  // same as any household with steps left.
  await expect(other.getByTestId("setup-progress")).toBeVisible()
  await openTab(other, "Month")
  await expect(other.getByText("This month's bill")).toBeVisible()
  await expect(other.getByTestId("share-3012-B")).toHaveText("$955.00")
  await openTab(other, "History")
  await expect(other.getByText("$1,910.00")).toBeVisible()
})

test("history exports as a spreadsheet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "file download flow is covered on desktop")
  await setUp(page, "Biscuit")
  await enterBill(page)
  await page.getByRole("button", { name: "Save month" }).click()
  await page.getByRole("navigation").first().getByRole("button", { name: "History" }).click()

  const downloading = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export CSV" }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/^roompay-history-\d{4}-\d{2}-\d{2}\.csv$/)

  const csv = await readFile((await download.path())!, "utf8")
  const [header, ...rows] = csv.replace(/^\uFEFF/, "").trim().split("\r\n")
  expect(header).toBe(
    "Month,Statement,Row,Item,Type,Detail,Covers from,Covers to,Due," +
      "Currency,Bill,You,Biscuit,Biscuit received,Biscuit shared on"
  )
  const rent = rows.find((r) => r.includes(",Item,Rent,fixed,"))!
  expect(rent).toContain("USD,1648.00,824.00,824.00,,")
  // Rent covers the month it's billed in; the CSV carries the window.
  expect(rent).toMatch(/,\d{4}-\d{2}-01,\d{4}-\d{2}-\d{2},\d{4}-\d{2}-01,USD,/)
  expect(rows.at(-1)).toContain(",Total,,,,,,,USD,1910.00,955.00,955.00,0.00,")
})

test("a mid-month arrival gets a catch-up, and that month is never billed twice", async ({ page }) => {
  // Onboarding asks when they moved in, and offers the catch-up itself.
  const today = new Date()
  const movedIn = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-14`
  await setUp(page, "Biscuit", movedIn)
  await enterBill(page)

  // The month shows their share, but hands the billing to the catch-up.
  await expect(page.getByText("Biscuit's catch-up covers this month")).toBeVisible()
  await expect(page.getByRole("button", { name: "Publish & share" })).toBeHidden()

  await page.getByRole("button", { name: "Open the catch-up" }).click()
  await expect(page.getByText(/billed here, not on the Month tab/)).toBeVisible()
  // This month's real bill replaces the estimate as soon as it's entered.
  await expect(page.getByText("actual bill").first()).toBeVisible()

  // One statement for the roommate, covering both months.
  await page.getByRole("button", { name: "Publish & share" }).click()
  const url = await page.getByTestId("share-url").inputValue()
  const roommate = await newDevice(browserOf(page))
  await roommate.goto(url)
  await expect(roommate.getByText("Move-in catch-up")).toBeVisible()

  // Settling it hands the months back to the usual flow.
  await page.getByRole("button", { name: "Mark the catch-up settled" }).click()
  await openTab(page, "Month")
  await expect(page.getByRole("button", { name: /Publish|Send/ }).first()).toBeVisible()
})

test("the checklist carries the setup, and the app opens on it until it's done", async ({ page }) => {
  await setUp(page)
  // Every tab carries the way back to it.
  await expect(page.getByText(/Finish setting up · \d of 6/)).toBeVisible()
  await openTab(page, "Setup")

  const checklist = page.getByTestId("setup-progress")
  await expect(checklist).toContainText("Next: Say what each bill costs")

  // "Set up" on a step takes you to the card that does it — where switching a
  // charge off counts as answering it, same as giving it an amount.
  await checklist.getByRole("button", { name: /Set up/ }).first().click()
  for (const label of ["Service fee", "Trash disposal"]) {
    await page.getByRole("switch", { name: `Include ${label} each month` }).click()
  }
  await expect(checklist).toContainText("Next: Check when each bill covers")

  // The three judgement calls are ticked off by hand.
  for (const name of [/when each bill covers/, /default split/, /payment options/]) {
    await checklist.getByRole("checkbox", { name }).click()
  }
  await expect(checklist).toContainText("here's what to do with it")

  // Set up now, so a fresh visit opens on the month instead of the checklist.
  await page.goto("/app")
  await expect(page.getByText("This month's bill")).toBeVisible()
  await expect(page.getByText(/Finish setting up ·/)).toHaveCount(0)
})

test("a share opens onto that roommate's part of every line", async ({ page }) => {
  await setUp(page)
  await enterBill(page)

  // Nobody is settling in, so the Catch-up tab keeps out of the way.
  const nav = page.getByRole("navigation").first()
  await expect(nav.getByRole("button", { name: "Catch-up" })).toHaveCount(0)

  const share = page.locator('[data-slot="collapsible"]', {
    has: page.getByTestId("share-Biscuit"),
  })
  const lines = share.locator('[data-slot="collapsible-content"]')
  await expect(lines).toBeHidden()
  await page.getByRole("button", { name: /Biscuit's share/ }).click()
  // Half of each line, adding up to the $955.00 on the row that opened it.
  await expect(lines).toContainText("$824.00")
  await expect(lines).toContainText("$80.00")

  // The tab can be pinned on from Setup, and put away again.
  await nav.getByRole("button", { name: "Setup" }).click()
  await page.getByRole("radio", { name: "On" }).click()
  await expect(nav.getByRole("button", { name: "Catch-up" })).toBeVisible()
  await page.getByRole("radio", { name: "Off" }).click()
  await expect(nav.getByRole("button", { name: "Catch-up" })).toHaveCount(0)
})

/** The browser behind a page, so a test can open a second device. */
function browserOf(page: Page): Browser {
  return page.context().browser()!
}

test("a credit comes off the bill or off one person, and says which", async ({ page }) => {
  await setUp(page)
  await enterBill(page)
  await expect(page.getByTestId("total-bill")).toHaveText("$1,910.00")
  await expect(page.getByTestId("share-Biscuit")).toHaveText("$955.00")

  // A credit off the whole bill: the total drops, so both sides drop half.
  await page.getByRole("button", { name: "Add one-time item" }).click()
  let dialog = page.getByRole("dialog")
  await dialog.getByRole("radio", { name: "Credit" }).click()
  await dialog.getByLabel("What is it?").fill("Blender")
  await dialog.getByLabel("Amount").fill("50")
  await expect(dialog.getByRole("radio", { name: /Off the whole bill/ })).toBeChecked()
  await dialog.getByRole("button", { name: "Add to this month" }).click()

  await expect(page.getByTestId("total-bill")).toHaveText("$1,860.00")
  await expect(page.getByTestId("share-Biscuit")).toHaveText("$930.00")
  await expect(page.getByRole("button", { name: "Off the whole bill" })).toBeVisible()

  // Aimed at Biscuit instead: the full $50 comes off her side, not yours.
  await page.getByRole("button", { name: "Off the whole bill" }).click()
  await page.getByRole("radio", { name: /Off someone's share/ }).click()
  await page.getByRole("checkbox", { name: /Biscuit/ }).check()
  await page.keyboard.press("Escape")

  await expect(page.getByTestId("share-Biscuit")).toHaveText("$905.00")
  await expect(page.getByTestId("total-bill")).toHaveText("$1,860.00")
  await expect(page.getByRole("button", { name: "Off Biscuit's share" })).toBeVisible()
})
