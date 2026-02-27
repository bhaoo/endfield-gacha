import type { HistoryRecord } from '~/types/gacha'

const toSortableNumber = (value?: string) => {
  if (!value) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export const sortHistory6Desc = (records: HistoryRecord[]) => {
  if (!records || records.length <= 1) return records

  return [...records].sort((a, b) => {
    const at = toSortableNumber(a.gachaTs)
    const bt = toSortableNumber(b.gachaTs)
    if (at !== bt) {
      if (at === 0) return 1
      if (bt === 0) return -1
      return bt - at
    }

    const as = toSortableNumber(a.seqId)
    const bs = toSortableNumber(b.seqId)
    if (as !== bs) {
      if (as === 0) return 1
      if (bs === 0) return -1
      return bs - as
    }

    return 0
  })
}

