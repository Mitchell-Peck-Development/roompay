import type { Metadata } from "next"
import { AppShell } from "@/components/shell/app-shell"
import { SwRegister } from "@/components/shell/sw-register"

/** The app proper. The landing page sits at "/" and links here. */
export const metadata: Metadata = {
  title: "Your months",
  robots: { index: false, follow: true },
}

export default function Page() {
  return (
    <>
      <AppShell />
      <SwRegister />
    </>
  )
}
