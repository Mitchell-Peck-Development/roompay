import { type Page, expect, test } from "@playwright/test"

const BILL = { Rent: "1648", Sewer: "38", Water: "38", Power: "160" }

async function setUpWithBill(page: Page) {
  await page.goto("/app")
  await page.getByLabel("What should we call this place?").fill("Unit 3012")
  await page.getByLabel("A nickname for your roommate").fill("Biscuit")
  await page.getByRole("button", { name: "Start splitting" }).click()
  for (const [label, amount] of Object.entries(BILL)) {
    await page.getByLabel(label, { exact: true }).fill(amount)
  }
  await page.getByLabel("Power", { exact: true }).blur()
  await page.getByRole("button", { name: "Save month" }).click()
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible()
}

/** Reads the saved document straight out of the browser. */
const readSaved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("roompay:v1")!).state.data)

test("what you enter is still there after a reload", async ({ page }) => {
  await setUpWithBill(page)
  await page.reload()

  await expect(page.getByTestId("total-bill")).toHaveText("$1,884.00")
  await expect(page.getByLabel("Rent", { exact: true })).toHaveValue("1648.00")
  await page.getByRole("navigation").first().getByRole("button", { name: "History" }).click()
  await expect(page.getByText("$1,884.00")).toBeVisible()

  // Bills keep the period they cover: utilities are billed a month in arrears.
  const data = await readSaved(page)
  const line = (label: string) =>
    data.months[0].lines.find((l: { label: string }) => l.label === label)
  expect(line("Rent").covers.start).toBe(line("Rent").covers.start.slice(0, 8) + "01")
  expect(new Date(line("Water").covers.end) < new Date(line("Rent").covers.start)).toBe(true)
  expect(line("Rent").dueDate).toBeTruthy()
})

test("a damaged month doesn't take the rest of the data with it", async ({ page }) => {
  await setUpWithBill(page)

  // Something scribbles on one saved month — a half-written tab, a bad sync.
  await page.evaluate(() => {
    const key = "roompay:v1"
    const saved = JSON.parse(localStorage.getItem(key)!)
    saved.state.data.months[0].period = "not-a-month"
    localStorage.setItem(key, JSON.stringify(saved))
  })
  await page.reload()

  // The working month, the household and the roommate all survive.
  await expect(page.getByText("Part of your saved data couldn't be read")).toBeVisible()
  await expect(page.getByText("1 saved month")).toBeVisible()
  await expect(page.getByTestId("total-bill")).toHaveText("$1,884.00")
  await expect(page.getByTestId("share-Biscuit")).toHaveText("$942.00")
  await expect(page.getByText("Unit 3012")).toBeVisible()

  // The original is kept, so nothing is lost for good.
  const original = await page.evaluate(() => localStorage.getItem("roompay:v1:corrupt"))
  expect(original).toContain("not-a-month")

  // And the notice goes away once it's been read.
  await page.getByRole("button", { name: "Dismiss the data notice" }).click()
  await expect(page.getByText("Part of your saved data couldn't be read")).toBeHidden()
})

test("a bill period set by hand survives editing the item", async ({ page }) => {
  await setUpWithBill(page)

  // That sewer bill covered a whole quarter, not just one month.
  await page.getByRole("button", { name: "Period and due date for Sewer" }).click()
  const start = page.getByLabel("From", { exact: true })
  await start.fill("2026-06-01")
  await start.blur()
  await page.keyboard.press("Escape")

  const covered = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("roompay:v1")!).state.data
    return data.current.lines.find((l: { label: string }) => l.label === "Sewer").covers
  })
  expect(covered.start).toBe("2026-06-01")

  // Renaming the item in Setup must not quietly put it back to one month.
  await page.getByRole("navigation").first().getByRole("button", { name: "Setup" }).click()
  await page.getByRole("button", { name: "Edit Sewer" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Name").fill("Sewer & drainage")
  await dialog.getByRole("button", { name: "Save" }).click()

  await page.getByRole("navigation").first().getByRole("button", { name: "Month" }).click()
  await page.reload()
  const after = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("roompay:v1")!).state.data
    return data.current.lines.find((l: { label: string }) => l.label === "Sewer & drainage").covers
  })
  expect(after).toEqual(covered)
})
