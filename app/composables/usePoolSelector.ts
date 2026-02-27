import type { ComputedRef } from 'vue'
import type { GachaStatistics } from '~/types/gacha'
import { sortHistory6Desc } from '~/utils/historySort'

type SelectItem = { label: string; value: string }

export const usePoolSelector = (params: {
  stats: ComputedRef<GachaStatistics[]>
  allValue?: string
  allLabel?: string
  getValue?: (s: GachaStatistics) => string
  getLabel?: (s: GachaStatistics) => string
}) => {
  const allValue = params.allValue || '__all__'
  const allLabel = params.allLabel || '全部'
  const getValue = params.getValue || ((s: GachaStatistics) => String(s.poolId || s.poolName || ''))
  const getLabel = params.getLabel || ((s: GachaStatistics) => String(s.poolName || getValue(s)))

  const selectedId = ref<string>('')
  const isAllSelected = computed(() => selectedId.value === allValue)

  const options = computed<SelectItem[]>(() => {
    const list = params.stats.value || []
    const base = list.map((s) => ({ label: getLabel(s), value: getValue(s) }))
    if (base.length > 1) return [{ label: allLabel, value: allValue }, ...base]
    return base
  })

  watch(
    params.stats,
    (list) => {
      if (!list || list.length <= 0) {
        selectedId.value = ''
        return
      }

      const selectedKey = selectedId.value

      if (selectedKey === allValue) {
        if (list.length > 1) return
        selectedId.value = getValue(list[0]!)
        return
      }

      if (!selectedKey) {
        if (list.length > 1) {
          selectedId.value = allValue
          return
        }
      }

      const valid = list.some((s) => getValue(s) === selectedKey)
      if (valid) return

      if (list.length > 1) {
        selectedId.value = allValue
        return
      }

      selectedId.value = getValue(list[0]!)
    },
    { immediate: true },
  )

  const allStat = computed<GachaStatistics | undefined>(() => {
    const list = params.stats.value || []
    if (list.length <= 0) return undefined

    const totalPulls = list.reduce((sum, s) => sum + (s.totalPulls || 0), 0)
    const count6 = list.reduce((sum, s) => sum + (s.count6 || 0), 0)
    const count5 = list.reduce((sum, s) => sum + (s.count5 || 0), 0)
    const count4 = list.reduce((sum, s) => sum + (s.count4 || 0), 0)
    const history6 = sortHistory6Desc(list.flatMap((s) => s.history6 || []))

    return {
      poolName: allLabel,
      poolId: allValue,
      totalPulls,
      pityCount: 0,
      count6,
      count5,
      count4,
      history6,
    }
  })

  const selectedStat = computed<GachaStatistics | undefined>(() => {
    const list = params.stats.value || []
    if (list.length <= 0) return undefined

    if (selectedId.value === allValue) {
      return allStat.value || list[0]
    }

    const key = selectedId.value
    return list.find((s) => getValue(s) === key) || list[0]
  })

  return {
    selectedId,
    options,
    isAllSelected,
    allStat,
    selectedStat,
  }
}
