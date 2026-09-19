import { z } from "zod"
import { isISODate, isPeriod } from "./dates"
import { TOKEN_RE } from "./ids"

const id = z.string().min(1).max(64)
const label = z.string().max(80)
const cents = z.number().int().min(-1e11).max(1e11)
const percent = z.number().min(0).max(100)
const timestamp = z.string().min(1).max(40)
const decimalText = z.string().max(24)

export const isoDateSchema = z.string().refine(isISODate, "Expected YYYY-MM-DD")
export const periodSchema = z.string().refine(isPeriod, "Expected YYYY-MM")

export const personSchema = z.object({
  id,
  nickname: label,
  archived: z.boolean().optional(),
  /** Residency, inclusive at both ends. Undefined means "always here". */
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
})

export const participantSchema = z.object({
  personId: id,
  nickname: label,
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
})

/** The service a bill pays for, relative to the month it's billed in. */
export const coverageSchema = z.object({
  /** 0 = this month, 1 = the month before, and so on. */
  offsetMonths: z.number().int().min(0).max(24),
  /** How many months of service one bill covers. */
  spanMonths: z.number().int().min(1).max(12),
})

/** A concrete stretch of service, inclusive at both ends. */
export const serviceWindowSchema = z.object({
  start: isoDateSchema,
  end: isoDateSchema,
})

export const splitSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("even") }),
  z.object({ mode: z.literal("percent"), pct: z.record(z.string(), percent) }),
])

export const itemSplitSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("default") }),
  z.object({ mode: z.literal("even") }),
  z.object({ mode: z.literal("percent"), pct: z.record(z.string(), percent) }),
  z.object({ mode: z.literal("exclude") }),
])

export const itemKindSchema = z.enum(["fixed", "variable", "metered"])

export const meterConfigSchema = z.object({
  unit: z.string().max(16),
  /** Price per unit as decimal text, e.g. "0.13456". */
  rate: decimalText,
  baseFeeCents: cents,
  input: z.enum(["usage", "readings"]),
})

export const itemTemplateSchema = z.object({
  id,
  label,
  kind: itemKindSchema,
  enabled: z.boolean(),
  defaultAmountCents: cents.optional(),
  meter: meterConfigSchema.optional(),
  split: itemSplitSchema,
  /** Omitted means the bill covers the month it's billed in. */
  coverage: coverageSchema.optional(),
  /** Day of the month the bill usually falls due, for the bills calendar. */
  dueDay: z.number().int().min(1).max(31).optional(),
})

export const cadenceSchema = z.object({
  id,
  /** Stable key used in share payloads and picks; never changes once made. */
  key: z.string().min(1).max(64),
  name: label,
  days: z.array(z.number().int().min(1).max(31)).min(1).max(24),
})

export const monthLineSchema = z.object({
  id,
  templateId: id.optional(),
  label,
  kind: itemKindSchema,
  oneOff: z.boolean().optional(),
  /** null means "not entered yet". Ignored for metered lines. */
  amountCents: cents.nullable(),
  meter: meterConfigSchema
    .extend({
      usage: decimalText.optional(),
      prev: decimalText.optional(),
      curr: decimalText.optional(),
    })
    .optional(),
  split: itemSplitSchema,
  /** The service this line pays for. Absent on lines from before coverage. */
  covers: serviceWindowSchema.optional(),
  dueDate: isoDateSchema.optional(),
})

export const paidEntrySchema = z.object({
  id,
  amountCents: cents,
  date: isoDateSchema,
})

export const publishedSchema = z.object({ at: timestamp, hash: z.string().max(64) })

export const monthRecordSchema = z.object({
  id,
  period: periodSchema,
  title: z.string().max(120),
  lines: z.array(monthLineSchema).max(100),
  split: splitSchema,
  participants: z.array(participantSchema).max(24),
  paid: z.record(z.string(), z.array(paidEntrySchema)),
  published: z.record(z.string(), publishedSchema),
  createdAt: timestamp,
  updatedAt: timestamp,
  savedAt: timestamp.optional(),
})

export const catchupRecordSchema = z.object({
  personId: id,
  moveIn: isoDateSchema,
  /** Full-month estimate per item template, overriding the item's default. */
  estimates: z.record(z.string(), cents),
  includeNextMonth: z.boolean(),
  installments: z.number().int().min(1).max(12),
  start: isoDateSchema,
  end: isoDateSchema,
  paid: z.array(paidEntrySchema),
  published: publishedSchema.optional(),
  updatedAt: timestamp.optional(),
})

export const linkSecretsSchema = z.object({
  token: z.string().regex(TOKEN_RE),
  writeKey: z.string().regex(TOKEN_RE),
  createdAt: timestamp,
})

export const appDataSchema = z.object({
  version: z.literal(1),
  household: z.object({ label, currency: z.string().length(3) }),
  people: z.array(personSchema).max(24),
  items: z.array(itemTemplateSchema).max(60),
  cadences: z.array(cadenceSchema).min(1).max(12),
  split: splitSchema,
  current: monthRecordSchema,
  months: z.array(monthRecordSchema).max(600),
  catchups: z.record(z.string(), catchupRecordSchema),
  links: z.record(z.string(), linkSecretsSchema),
  meta: z.object({
    createdAt: timestamp,
    updatedAt: timestamp,
    lastBackupAt: timestamp.optional(),
    installNudgeDismissedAt: timestamp.optional(),
  }),
})

export type Person = z.infer<typeof personSchema>
export type Participant = z.infer<typeof participantSchema>
export type Coverage = z.infer<typeof coverageSchema>
export type ServiceWindow = z.infer<typeof serviceWindowSchema>
export type Split = z.infer<typeof splitSchema>
export type ItemSplit = z.infer<typeof itemSplitSchema>
export type ItemKind = z.infer<typeof itemKindSchema>
export type MeterConfig = z.infer<typeof meterConfigSchema>
export type ItemTemplate = z.infer<typeof itemTemplateSchema>
export type Cadence = z.infer<typeof cadenceSchema>
export type MonthLine = z.infer<typeof monthLineSchema>
export type LineMeter = NonNullable<MonthLine["meter"]>
export type PaidEntry = z.infer<typeof paidEntrySchema>
export type Published = z.infer<typeof publishedSchema>
export type MonthRecord = z.infer<typeof monthRecordSchema>
export type CatchupRecord = z.infer<typeof catchupRecordSchema>
export type LinkSecrets = z.infer<typeof linkSecretsSchema>
export type AppData = z.infer<typeof appDataSchema>
