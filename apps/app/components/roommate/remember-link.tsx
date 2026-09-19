"use client"

import * as React from "react"
import { rememberReceived } from "@/lib/received"

/** Notes this link on the roommate's device so they can find it again. */
export function RememberLink(props: { token: string; householdLabel: string; roommateLabel: string }) {
  const { token, householdLabel, roommateLabel } = props
  React.useEffect(() => {
    rememberReceived({ token, householdLabel, roommateLabel })
  }, [token, householdLabel, roommateLabel])
  return null
}
