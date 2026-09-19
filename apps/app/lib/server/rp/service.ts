import {
  type SharePayload,
  type StatementKind,
  lastDueOn,
  sharePayloadSchema,
} from "@workspace/core"
import { getBackend } from "./backend"
import { sha256Hex } from "./hash"
import type { RpResult } from "./types"

export type StatementView = {
  period: string
  kind: StatementKind
  payload: SharePayload
  chosenPlan: string | null
  chosenAt: string | null
  revision: number
  publishedAt: string
  updatedAt: string
}

export type LinkView = {
  link: {
    /** The row id — safe to expose; used for calendar event ids. */
    id: string
    householdLabel: string
    roommateLabel: string
    preferredPlan: string | null
    expiresAt: string
  }
  statements: StatementView[]
}

type RawView = {
  link: {
    id: string
    household_label: string
    roommate_label: string
    preferred_plan: string | null
    expires_at: string
  }
  statements: {
    period: string
    kind: StatementKind
    payload: unknown
    chosen_plan: string | null
    chosen_at: string | null
    revision: number
    published_at: string
    updated_at: string
  }[]
}

export async function publishStatement(input: {
  token: string
  writeKey: string
  householdLabel: string
  roommateLabel: string
  payload: SharePayload
}): Promise<RpResult<{ revision: number; expiresAt: string }>> {
  const backend = await getBackend()
  const result = await backend.call<{ revision: number; expires_at: string }>(
    "publish",
    {
      p_token_hash: sha256Hex(input.token),
      p_write_key_hash: sha256Hex(input.writeKey),
      p_household_label: input.householdLabel,
      p_roommate_label: input.roommateLabel,
      p_period: input.payload.period,
      p_kind: input.payload.kind,
      p_payload: input.payload,
      p_last_due_on: lastDueOn(input.payload),
    }
  )
  if (!result.ok) return result
  return { ok: true, revision: result.revision, expiresAt: result.expires_at }
}

export async function unpublishStatement(input: {
  token: string
  writeKey: string
  period: string
  kind: StatementKind
}): Promise<RpResult<{ deleted: boolean }>> {
  const backend = await getBackend()
  return backend.call("unpublish", {
    p_token_hash: sha256Hex(input.token),
    p_write_key_hash: sha256Hex(input.writeKey),
    p_period: input.period,
    p_kind: input.kind,
  })
}

export async function revokeLink(input: {
  token: string
  writeKey: string
}): Promise<RpResult> {
  const backend = await getBackend()
  return backend.call("revoke", {
    p_token_hash: sha256Hex(input.token),
    p_write_key_hash: sha256Hex(input.writeKey),
  })
}

export async function pickPlanFor(input: {
  token: string
  period: string
  kind: StatementKind
  plan: string
}): Promise<RpResult<{ chosenPlan: string; revision: number }>> {
  const backend = await getBackend()
  const result = await backend.call<{ chosen_plan: string; revision: number }>(
    "pick",
    {
      p_token_hash: sha256Hex(input.token),
      p_period: input.period,
      p_kind: input.kind,
      p_plan: input.plan,
    }
  )
  if (!result.ok) return result
  return { ok: true, chosenPlan: result.chosen_plan, revision: result.revision }
}

/** Everything a link token unlocks, or null if it's unknown, expired or revoked. */
export async function viewLink(token: string): Promise<LinkView | null> {
  const backend = await getBackend()
  const result = await backend.call<RawView>("view", {
    p_token_hash: sha256Hex(token),
  })
  if (!result.ok) return null

  const statements: StatementView[] = []
  for (const s of result.statements) {
    // Stored payloads are re-validated on the way out: anything that doesn't
    // match the schema this build understands is skipped, never rendered.
    const payload = sharePayloadSchema.safeParse(s.payload)
    if (!payload.success) continue
    statements.push({
      period: s.period,
      kind: s.kind,
      payload: payload.data,
      chosenPlan: s.chosen_plan,
      chosenAt: s.chosen_at,
      revision: s.revision,
      publishedAt: s.published_at,
      updatedAt: s.updated_at,
    })
  }

  return {
    link: {
      id: result.link.id,
      householdLabel: result.link.household_label,
      roommateLabel: result.link.roommate_label,
      preferredPlan: result.link.preferred_plan,
      expiresAt: result.link.expires_at,
    },
    statements,
  }
}
