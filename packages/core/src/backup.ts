import { toISODate } from "./dates"
import { type AppData, appDataSchema } from "./schema"

export const BACKUP_FORMAT = "roompay-backup"

export type BackupFile = {
  format: typeof BACKUP_FORMAT
  version: 1
  exportedAt: string
  data: AppData
}

export function makeBackup(data: AppData, now: Date): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    data,
  }
}

export function backupFilename(now: Date): string {
  return `roompay-backup-${toISODate(now)}.json`
}

export function parseBackup(
  text: string
): { ok: true; data: AppData } | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: "That file isn't valid JSON." }
  }
  const file = raw as Partial<BackupFile> | null
  if (!file || typeof file !== "object" || file.format !== BACKUP_FORMAT) {
    return { ok: false, error: "That doesn't look like a RoomPay backup." }
  }
  if (file.version !== 1) {
    return {
      ok: false,
      error: "This backup was made by a newer version of RoomPay.",
    }
  }
  const parsed = appDataSchema.safeParse(file.data)
  if (!parsed.success) {
    return { ok: false, error: "The backup is damaged or incomplete." }
  }
  return { ok: true, data: parsed.data }
}

/** Keeps local order, lets `pick` settle clashes, appends what's new. */
function mergeById<T extends { id: string }>(
  local: T[],
  incoming: T[],
  pick: (local: T, incoming: T) => T = (l) => l
): T[] {
  const byId = new Map(incoming.map((item) => [item.id, item]))
  const merged = local.map((item) => {
    const other = byId.get(item.id)
    byId.delete(item.id)
    return other ? pick(item, other) : item
  })
  return [...merged, ...byId.values()]
}

function mergeRecord<T>(
  local: Record<string, T>,
  incoming: Record<string, T>,
  stamp: (value: T) => string | undefined
): Record<string, T> {
  const merged = { ...local }
  for (const [key, value] of Object.entries(incoming)) {
    const mine = merged[key]
    if (!mine || (stamp(value) ?? "") > (stamp(mine) ?? "")) merged[key] = value
  }
  return merged
}

const newer = <T extends { updatedAt: string }>(a: T, b: T): T =>
  b.updatedAt > a.updatedAt ? b : a

/**
 * Combines a backup with what's already on this device. Lists merge by id;
 * where both sides have the same record, the more recently updated one wins.
 */
export function mergeData(local: AppData, incoming: AppData): AppData {
  const incomingIsNewer = incoming.meta.updatedAt > local.meta.updatedAt
  const lead = incomingIsNewer ? incoming : local
  return {
    version: 1,
    household: lead.household,
    split: lead.split,
    current: lead.current,
    people: mergeById(local.people, incoming.people),
    items: mergeById(local.items, incoming.items),
    cadences: mergeById(local.cadences, incoming.cadences),
    months: mergeById(local.months, incoming.months, newer),
    catchups: mergeRecord(local.catchups, incoming.catchups, (c) => c.updatedAt),
    prefs: lead.prefs,
    links: mergeRecord(local.links, incoming.links, (l) => l.createdAt),
    meta: {
      ...local.meta,
      updatedAt: lead.meta.updatedAt,
    },
  }
}
