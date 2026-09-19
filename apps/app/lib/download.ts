"use client"

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers and non-secure contexts.
    try {
      const area = document.createElement("textarea")
      area.value = text
      area.style.position = "fixed"
      area.style.opacity = "0"
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand("copy")
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

export const copyText = copy

const isTouch = () =>
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches

/**
 * On a phone, opens the native share sheet (Messages, WhatsApp, …). On a
 * desktop, copies the link. Reports which, so the caller can say so.
 */
export async function shareOrCopy(data: {
  title: string
  text: string
  url: string
}): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (isTouch() && typeof navigator.share === "function") {
    try {
      await navigator.share(data)
      return "shared"
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return "cancelled"
    }
  }
  return (await copy(data.url)) ? "copied" : "failed"
}

/** Saves a file, or on a phone offers it to the share sheet (AirDrop, Files…). */
export async function saveFile(
  filename: string,
  contents: string,
  type = "application/json"
): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([contents], filename, { type })
  if (isTouch() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return "shared"
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return "cancelled"
    }
  }
  const url = URL.createObjectURL(file)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return "downloaded"
}
