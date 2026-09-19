import {
  TOKEN_RE,
  periodSchema,
  sharePayloadSchema,
  statementKindSchema,
} from "@workspace/core"
import { z } from "zod"

export const tokenSchema = z.string().regex(TOKEN_RE)
const label = z.string().max(80)

export const publishBody = z.object({
  token: tokenSchema,
  writeKey: tokenSchema,
  householdLabel: label,
  roommateLabel: label,
  payload: sharePayloadSchema,
})

export const unpublishBody = z.object({
  token: tokenSchema,
  writeKey: tokenSchema,
  period: periodSchema,
  kind: statementKindSchema,
})

export const revokeBody = z.object({ token: tokenSchema, writeKey: tokenSchema })

export const receivedBody = z.object({
  token: tokenSchema,
  writeKey: tokenSchema,
  period: periodSchema,
  kind: statementKindSchema,
  receivedCents: z.number().int().min(0).max(1e11),
})

export const statusBody = z.object({ tokens: z.array(tokenSchema).max(12) })

export const pickBody = z.object({
  token: tokenSchema,
  period: periodSchema,
  kind: statementKindSchema,
  plan: z.string().min(1).max(64),
})
