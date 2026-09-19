"use client"

import { type AppData, appDataSchema, createInitialData } from "@workspace/core"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

/**
 * Everything the owner enters lives in this one document, persisted to this
 * browser only. Nothing here is sent anywhere unless they publish a link.
 */
export const STORAGE_KEY = "roompay:v1"
const CORRUPT_KEY = "roompay:v1:corrupt"

type Store = {
  data: AppData
  /** False until localStorage has been read; render a skeleton until then. */
  hydrated: boolean
  update(mutate: (draft: AppData) => void): void
  replace(data: AppData): void
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      data: createInitialData(new Date()),
      hydrated: false,
      update(mutate) {
        set((state) => {
          const draft = structuredClone(state.data)
          mutate(draft)
          draft.meta.updatedAt = new Date().toISOString()
          return { data: draft }
        })
      },
      replace(data) {
        set({ data })
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ data: state.data }),
      // Hydrated by hand after mount so server and first client render agree.
      skipHydration: true,
      merge(persisted, current) {
        const stored = (persisted as { data?: unknown } | undefined)?.data
        if (stored === undefined) return current
        const parsed = appDataSchema.safeParse(stored)
        if (parsed.success) return { ...current, data: parsed.data }
        // Never crash on, or silently overwrite, data we can't read: park it
        // where a person (or a future version) can still get at it.
        try {
          localStorage.setItem(CORRUPT_KEY, JSON.stringify(stored))
        } catch {
          // Storage is full or unavailable; nothing more we can do.
        }
        return current
      },
    }
  )
)

let started = false

/** Reads localStorage once, then keeps tabs in sync with each other. */
export function startPersistence() {
  if (started || typeof window === "undefined") return
  started = true
  const finish = () => useStore.setState({ hydrated: true })
  Promise.resolve(useStore.persist.rehydrate()).then(finish, finish)
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) void useStore.persist.rehydrate()
  })
}

export const useData = () => useStore((s) => s.data)
export const useHydrated = () => useStore((s) => s.hydrated)
