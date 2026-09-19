"use client"

import type { SharePayload, StatementKind } from "@workspace/core"
import type { LinkStatus } from "@/app/api/share/status/route"

export type ShareError =
  | "invalid"
  | "forbidden"
  | "not_found"
  | "busy"
  | "sharing_unconfigured"
  | "server"
  | "network"

type Result<T> = ({ ok: true } & T) | { ok: false; error: ShareError }

async function post<T>(path: string, body: unknown): Promise<Result<T>> {
  try {
    const response = await fetch(`/api/share/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await response.json()) as Result<T>
    if (data && typeof data === "object" && "ok" in data) return data
    return { ok: false, error: "server" }
  } catch {
    return { ok: false, error: "network" }
  }
}

export const shareClient = {
  publish: (body: {
    token: string
    writeKey: string
    householdLabel: string
    roommateLabel: string
    payload: SharePayload
  }) => post<{ revision: number; expiresAt: string }>("publish", body),

  unpublish: (body: { token: string; writeKey: string; period: string; kind: StatementKind }) =>
    post<{ deleted: boolean }>("unpublish", body),

  revoke: (body: { token: string; writeKey: string }) => post<object>("revoke", body),

  status: (tokens: string[]) => post<{ links: Record<string, LinkStatus> }>("status", { tokens }),

  pick: (body: { token: string; period: string; kind: StatementKind; plan: string }) =>
    post<{ chosenPlan: string; revision: number }>("pick", body),
}

export function shareErrorMessage(error: ShareError): string {
  switch (error) {
    case "forbidden":
      return "This link was created with different keys, so this device can't change it. Create a new link instead."
    case "not_found":
      return "That link has expired or was removed. Publishing again will create a fresh one."
    case "busy":
      return "Sharing is busy right now. Give it a minute and try again."
    case "sharing_unconfigured":
      return "Sharing isn't set up on this server yet."
    case "network":
      return "Couldn't reach the server. Nothing was lost — try again when you're online."
    case "invalid":
      return "Something in this month couldn't be published. Check the amounts and try again."
    default:
      return "Something went wrong on the server. Nothing was lost — try again."
  }
}
