import { createInitialData, newMonth } from "./defaults"
import {
  type AppData,
  type Cadence,
  type CatchupRecord,
  type ItemTemplate,
  type LinkSecrets,
  type MonthRecord,
  type Person,
  type Prefs,
  type Split,
  appDataSchema,
  cadenceSchema,
  catchupRecordSchema,
  itemTemplateSchema,
  linkSecretsSchema,
  monthLineSchema,
  monthRecordSchema,
  personSchema,
  prefsSchema,
  splitSchema,
} from "./schema"

/**
 * Reading the saved document back.
 *
 * It's one JSON blob, so a strict all-or-nothing parse would trade a year of
 * saved months for a single bad value — the worst way to lose data. Instead,
 * anything that can't be read is dropped on its own and named in `dropped`,
 * so the rest survives and the app can say what went missing.
 */
export type LoadResult = {
  data: AppData
  /** Plain-language notes about anything that couldn't be read. */
  dropped: string[]
  /** True when nothing could be salvaged and this is a fresh start. */
  fresh: boolean
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/** Keeps the elements that parse on their own, and counts the rest. */
function keepValid<T>(
  value: unknown,
  parse: (item: unknown) => T | undefined,
  label: string,
  dropped: string[]
): T[] {
  if (!Array.isArray(value)) {
    if (value !== undefined) dropped.push(`the list of ${label}s`)
    return []
  }
  const kept: T[] = []
  let lost = 0
  for (const item of value) {
    const parsed = parse(item)
    if (parsed === undefined) lost++
    else kept.push(parsed)
  }
  if (lost > 0) dropped.push(plural(lost, label))
  return kept
}

function keepValidRecord<T>(
  value: unknown,
  parse: (item: unknown) => T | undefined,
  label: string,
  dropped: string[]
): Record<string, T> {
  if (!value || typeof value !== "object") return {}
  const kept: Record<string, T> = {}
  let lost = 0
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const parsed = parse(item)
    if (parsed === undefined) lost++
    else kept[key] = parsed
  }
  if (lost > 0) dropped.push(plural(lost, label))
  return kept
}

const parser =
  <T>(schema: { safeParse(value: unknown): { success: boolean; data?: unknown } }) =>
  (value: unknown): T | undefined => {
    const result = schema.safeParse(value)
    return result.success ? (result.data as T) : undefined
  }

/** A month with its unreadable lines removed, or undefined if it's beyond repair. */
function repairMonth(value: unknown, dropped: string[]): MonthRecord | undefined {
  const whole = parser<MonthRecord>(monthRecordSchema)(value)
  if (whole) return whole
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  const lines = keepValid(record.lines, parser(monthLineSchema), "bill line", dropped)
  return parser<MonthRecord>(monthRecordSchema)({ ...record, lines })
}

const META_KEYS = ["createdAt", "lastBackupAt", "installNudgeDismissedAt"] as const

function timestamps(value: unknown): Partial<AppData["meta"]> {
  if (!value || typeof value !== "object") return {}
  const stored = value as Record<string, unknown>
  const kept: Partial<AppData["meta"]> = {}
  for (const key of META_KEYS) {
    const at = stored[key]
    if (typeof at === "string" && at.length > 0 && at.length <= 40) kept[key] = at
  }
  return kept
}

export function parseAppData(raw: unknown, now = new Date()): LoadResult {
  const strict = appDataSchema.safeParse(raw)
  if (strict.success) return { data: strict.data, dropped: [], fresh: false }

  const fallback = createInitialData(now)
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { data: fallback, dropped: ["everything that was saved"], fresh: true }
  }

  const stored = raw as Record<string, unknown>
  const dropped: string[] = []

  // Field by field, so one unreadable setting doesn't cost the label as well.
  const storedHousehold = (stored.household ?? {}) as Record<string, unknown>
  const household = {
    label:
      typeof storedHousehold.label === "string" && storedHousehold.label.length <= 80
        ? storedHousehold.label
        : fallback.household.label,
    currency:
      typeof storedHousehold.currency === "string" &&
      /^[A-Za-z]{3}$/.test(storedHousehold.currency)
        ? storedHousehold.currency.toUpperCase()
        : fallback.household.currency,
  }
  if (JSON.stringify(household) !== JSON.stringify(storedHousehold)) {
    dropped.push("a household setting")
  }
  const people = keepValid(stored.people, parser<Person>(personSchema), "roommate", dropped)
  const items = keepValid(stored.items, parser<ItemTemplate>(itemTemplateSchema), "line item", dropped)
  const cadences = keepValid(stored.cadences, parser<Cadence>(cadenceSchema), "payment option", dropped)
  const months = keepValid(
    stored.months,
    (month) => repairMonth(month, dropped),
    "saved month",
    dropped
  )
  const split = parser<Split>(splitSchema)(stored.split)
  if (!split) dropped.push("the default split")
  const catchups = keepValidRecord(
    stored.catchups,
    parser<CatchupRecord>(catchupRecordSchema),
    "move-in catch-up",
    dropped
  )
  const prefs = parser<Prefs>(prefsSchema)(stored.prefs ?? {})
  if (!prefs) dropped.push("a display setting")
  const links = keepValidRecord(
    stored.links,
    parser<LinkSecrets>(linkSecretsSchema),
    "share link",
    dropped
  )

  const base = {
    items: items.length > 0 ? items : fallback.items,
    people,
    split: split ?? fallback.split,
    months,
  }
  let current = repairMonth(stored.current, dropped)
  if (!current) {
    dropped.push("the month you were working on")
    current = newMonth(base, months[0]?.period ?? fallback.current.period, now)
  }

  const repaired = {
    ...fallback,
    household,
    ...base,
    cadences: cadences.length > 0 ? cadences : fallback.cadences,
    current,
    catchups,
    prefs: prefs ?? fallback.prefs,
    links,
    // Timestamps only, so a damaged one costs the date rather than the document.
    meta: { ...fallback.meta, ...timestamps(stored.meta), updatedAt: now.toISOString() },
  }

  const salvaged = appDataSchema.safeParse(repaired)
  if (salvaged.success) {
    return {
      data: salvaged.data,
      // Nothing identifiable was lost, but something at the top level was off.
      dropped: dropped.length > 0 ? dropped : ["a setting that couldn't be read"],
      fresh: false,
    }
  }
  return { data: fallback, dropped: ["everything that was saved"], fresh: true }
}
