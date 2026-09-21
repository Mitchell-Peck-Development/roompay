import { lineAmountCents } from "./meter"
import type { AppData } from "./schema"

/**
 * Setting up is more than the three questions the first run asks. The rest —
 * what each bill costs, when it covers, how it splits, how a roommate can pay
 * it — decides whether the numbers come out right, and none of it belongs in
 * a single sitting. So it's a checklist: what's done, what's next, and where.
 *
 * Some steps can be read straight off the data (a household has a name, or it
 * doesn't). The ones that are a judgement rather than a value — the timing of
 * each bill, the default split, the payment options — start out with sensible
 * defaults, so nothing here can tell whether they've been *looked at*. Those
 * are confirmed by the owner, and that confirmation is what `prefs.reviewed`
 * holds.
 */
export type SetupStepId =
  | "place"
  | "people"
  | "items"
  | "timing"
  | "split"
  | "cadences"
  | "month"
  | "share"
  | "backup"

/**
 * The steps nothing in the data can answer, so the owner confirms them. They
 * also stand for "this household has been set up", which is what a document
 * written before the checklist existed is read as.
 */
export const CONFIRMED_STEPS = ["timing", "split", "cadences"] as const

/** Where a step is done: a section of Setup, or the Month tab. */
export type SetupWhere =
  | { tab: "setup"; anchor: SetupAnchor }
  | { tab: "month" }

export type SetupAnchor =
  | "household"
  | "people"
  | "items"
  | "cadences"
  | "split"
  | "backup"

export type SetupStep = {
  id: SetupStepId
  title: string
  /** Why it matters, in one line. */
  blurb: string
  done: boolean
  /**
   * True when there's nothing to read off the data, so the step is done when
   * the owner says they've checked it.
   */
  confirms: boolean
  /** Required before the app is set up; the rest are what to do next with it. */
  required: boolean
  where: SetupWhere
}

const at = (anchor: SetupAnchor): SetupWhere => ({ tab: "setup", anchor })

/** True when the owner has ticked a step off by hand. */
export function isReviewed(
  data: Pick<AppData, "prefs">,
  id: SetupStepId
): boolean {
  return (data.prefs?.reviewed ?? []).includes(id)
}

/** Whether anything has been published for anyone, ever. */
function hasShared(data: AppData): boolean {
  const months = [data.current, ...data.months]
  if (months.some((m) => Object.keys(m.published).length > 0)) return true
  return Object.values(data.catchups).some((c) => Boolean(c.published))
}

/**
 * Every enabled item says what it costs — or is the kind that can't, because
 * the figure comes off the statement each month.
 */
function itemsPriced(data: AppData): boolean {
  const enabled = data.items.filter((item) => item.enabled)
  if (enabled.length === 0) return false
  return enabled
    .filter((item) => item.kind === "fixed")
    .every((item) => item.defaultAmountCents !== undefined)
}

export function setupSteps(data: AppData): SetupStep[] {
  const people = data.people.filter((p) => !p.archived)
  const step = (
    id: SetupStepId,
    title: string,
    blurb: string,
    done: boolean,
    where: SetupWhere,
    options: { confirms?: boolean; required?: boolean } = {}
  ): SetupStep => ({
    id,
    title,
    blurb,
    done,
    confirms: options.confirms ?? false,
    required: options.required ?? true,
    where,
  })

  return [
    step(
      "place",
      "Name the place",
      "It heads the link your roommates open, so make it something they'll recognise.",
      data.household.label.trim() !== "",
      at("household")
    ),
    step(
      "people",
      "Add your roommates",
      "Nicknames only. A move-in or move-out date is what decides whether someone owes a whole month or part of one.",
      people.length > 0,
      at("people")
    ),
    step(
      "items",
      "Say what each bill costs",
      "Fixed charges get an amount that carries into every month. Switch off anything this place doesn't pay.",
      itemsPriced(data),
      at("items")
    ),
    step(
      "timing",
      "Check when each bill covers and falls due",
      "Water billed in September is usually August's usage — and August's residents owe it. Worth a look before you split anything.",
      isReviewed(data, "timing"),
      at("items"),
      { confirms: true }
    ),
    step(
      "split",
      "Set the default split",
      "Where every new month starts. Individual months and single line items can still differ.",
      isReviewed(data, "split") || data.split.mode === "percent",
      at("split"),
      { confirms: true }
    ),
    step(
      "cadences",
      "Check the payment options",
      "The ways a roommate can spread their share — in full, in two, weekly. They pick one from their link.",
      isReviewed(data, "cadences"),
      at("cadences"),
      { confirms: true }
    ),
    step(
      "month",
      "Put in this month's numbers",
      "Amounts on the Month tab belong to that month alone — the usual ones live in Setup.",
      data.current.lines.some((line) => lineAmountCents(line) !== null),
      { tab: "month" },
      { required: false }
    ),
    step(
      "share",
      "Send a roommate their link",
      "A read-only page with their share, the payment options and the dates for their calendar.",
      hasShared(data),
      { tab: "month" },
      { required: false }
    ),
    step(
      "backup",
      "Export a backup",
      "Everything lives in this browser and nowhere else. A backup file is what moves it to another device.",
      Boolean(data.meta.lastBackupAt),
      at("backup"),
      { required: false }
    ),
  ]
}

export type SetupProgress = {
  steps: SetupStep[]
  /** Required steps only — what the progress bar counts. */
  done: number
  total: number
  /** The first thing left to do, required steps first. */
  next: SetupStep | null
  /** True once every required step is done. */
  ready: boolean
  /** True when there's nothing left at all, optional steps included. */
  complete: boolean
}

export function setupProgress(data: AppData): SetupProgress {
  const steps = setupSteps(data)
  const required = steps.filter((s) => s.required)
  const done = required.filter((s) => s.done).length
  return {
    steps,
    done,
    total: required.length,
    next: required.find((s) => !s.done) ?? steps.find((s) => !s.done) ?? null,
    ready: done === required.length,
    complete: steps.every((s) => s.done),
  }
}

/** Whether the app has everything it needs to bill a month properly. */
export function isSetupReady(data: AppData): boolean {
  return setupSteps(data).every((step) => !step.required || step.done)
}
