"use client"

import {
  type AppData,
  type ISODate,
  type ItemSplit,
  type ItemTemplate,
  type LineMeter,
  type LinkSecrets,
  type PaidEntry,
  type Period,
  type Published,
  type ServiceWindow,
  type Split,
  type StatementRef,
  mergeData,
} from "@workspace/core"
import * as M from "@workspace/core"
import { useStore } from "./store"

/** Runs a core mutation against the store and hands back its result. */
function run<T>(mutate: (draft: AppData) => T): T {
  let result!: T
  useStore.getState().update((draft) => {
    result = mutate(draft)
  })
  return result
}

export const actions = {
  setHousehold: (patch: Partial<AppData["household"]>) =>
    run((d) => void Object.assign(d.household, patch)),

  addPerson: (nickname: string) => run((d) => M.addPerson(d, nickname)),
  renamePerson: (id: string, nickname: string) => run((d) => M.renamePerson(d, id, nickname)),
  setPersonArchived: (id: string, archived: boolean) =>
    run((d) => M.setPersonArchived(d, id, archived)),
  setPersonResidency: (id: string, patch: { from?: ISODate | null; to?: ISODate | null }) =>
    run((d) => M.setPersonResidency(d, id, patch)),
  removePerson: (id: string) => run((d) => M.removePerson(d, id)),

  upsertItem: (item: ItemTemplate) => run((d) => M.upsertItem(d, item)),
  removeItem: (id: string) => run((d) => M.removeItem(d, id)),
  moveItem: (id: string, delta: -1 | 1) => run((d) => M.moveItem(d, id, delta)),

  upsertCadence: (cadence: { id: string; name: string; days: number[] }) =>
    run((d) => M.upsertCadence(d, cadence)),
  removeCadence: (id: string) => run((d) => M.removeCadence(d, id)),

  setDefaultSplit: (split: Split) => run((d) => void (d.split = split)),
  setMonthSplit: (split: Split) => run((d) => M.setMonthSplit(d, split)),
  setMonthTitle: (title: string) => run((d) => M.setMonthTitle(d, title)),

  setLineAmount: (lineId: string, cents: number | null) =>
    run((d) => M.setLineAmount(d, lineId, cents)),
  setLineMeter: (lineId: string, patch: Partial<LineMeter>) =>
    run((d) => M.setLineMeter(d, lineId, patch)),
  setLineSplit: (lineId: string, split: ItemSplit) =>
    run((d) => M.setLineSplit(d, lineId, split)),
  setLineCoverage: (lineId: string, covers: ServiceWindow) =>
    run((d) => M.setLineCoverage(d, lineId, covers)),
  setLineDueDate: (lineId: string, date: ISODate | null) =>
    run((d) => M.setLineDueDate(d, lineId, date)),
  addOneOffLine: (input: Parameters<typeof M.addOneOffLine>[1]) =>
    run((d) => M.addOneOffLine(d, input)),
  removeLine: (lineId: string) => run((d) => M.removeLine(d, lineId)),

  startNewMonth: (period: Period) => run((d) => M.startNewMonth(d, period)),
  saveCurrent: () => run((d) => M.saveCurrent(d)),
  openMonth: (id: string) => run((d) => M.openMonth(d, id)),
  deleteMonth: (id: string) => run((d) => M.deleteMonth(d, id)),

  addPaid: (ref: StatementRef, personId: string, entry: Omit<PaidEntry, "id">) =>
    run((d) => M.addPaid(d, ref, personId, entry)),
  removePaid: (ref: StatementRef, personId: string, entryId: string) =>
    run((d) => M.removePaid(d, ref, personId, entryId)),
  setPublished: (ref: StatementRef, personId: string, published: Published | null) =>
    run((d) => M.setPublished(d, ref, personId, published)),

  ensureLink: (personId: string): LinkSecrets =>
    structuredClone(run((d) => M.ensureLink(d, personId))),
  forgetLink: (personId: string) => run((d) => M.forgetLink(d, personId)),

  ensureCatchup: (personId: string, today: ISODate) =>
    run((d) => void M.ensureCatchup(d, personId, today)),
  patchCatchup: (personId: string, patch: Parameters<typeof M.patchCatchup>[2]) =>
    run((d) => M.patchCatchup(d, personId, patch)),
  closeCatchup: (personId: string) => run((d) => M.closeCatchup(d, personId)),
  reopenCatchup: (personId: string) => run((d) => M.reopenCatchup(d, personId)),

  importData(incoming: AppData, mode: "replace" | "merge") {
    const { data, replace } = useStore.getState()
    replace(mode === "replace" ? incoming : mergeData(data, incoming))
  },
  markBackup: () => run((d) => void (d.meta.lastBackupAt = new Date().toISOString())),
  dismissInstallNudge: () =>
    run((d) => void (d.meta.installNudgeDismissedAt = new Date().toISOString())),
}
