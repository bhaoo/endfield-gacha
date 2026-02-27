<template>
  <div v-if="uid === 'none' || !uid" class="text-center text-gray-500 py-16">
    <div class="mb-2 text-4xl">👋</div>
    <p class="text-lg font-medium">欢迎使用</p>
    <p class="text-sm mt-1">请先点击左上角添加账号，或选择一个已有账号。</p>
  </div>

  <div v-else-if="statistics.length > 0" class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <UCard v-if="allWeaponStat" :key="'weapon-all'">
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="text-lg font-bold">所有武器池</h3>
        </div>
      </template>

      <PieChart :data="allWeaponStat"></PieChart>

      <div class="space-y-2 text-sm">
        <div class="flex justify-between border-b pb-1">
          <span>总抽数:</span> <span>{{ allWeaponStat.totalPulls }}</span>
        </div>

        <div v-for="row in getStarRows(allWeaponStat)" :key="row.label"
          class="grid grid-cols-[40px_70px_80px_1fr] gap-1 text-xs py-1 border-b border-gray-100 dark:border-gray-800 items-center">
          <span :class="['font-bold', row.color]">{{ row.label }}</span>

          <span class="text-gray-600 dark:text-gray-300">
            共 {{ row.count }} 个
          </span>

          <span class="text-gray-500">
            占 {{ getPercent(row.count, allWeaponStat.totalPulls) }}%
          </span>

          <span class="text-gray-500">
            平均 {{ getAvg(row.count, allWeaponStat.totalPulls) }} 抽/个
          </span>
        </div>

        <div class="mt-3">
          <p class="font-semibold mb-2 text-gray-500 text-xs">
            6★ 历史记录:
            <span class="font-normal text-gray-400">
              出卡数 {{ allWeaponHistory6Count }} 次 · 歪 {{ allWeaponOffCount }} 次
            </span>
          </p>

          <div v-if="allWeaponStat.history6.length > 0" class="flex flex-wrap gap-2">
            <div v-for="(rec, idx) in [...allWeaponStat.history6].reverse()" :key="idx"
              class="relative text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 flex items-center gap-1">
              <span class="font-medium text-gray-700 dark:text-gray-200">
                {{ rec.name }}
              </span>

              <span class="text-gray-400">[{{ rec.pity }}]</span>

              <span v-if="rec.isNew" class="text-red-500 font-bold ml-0.5 text-[10px]">
                [NEW]
              </span>

              <svg width="20" height="20" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg"
                v-if="rec.up6Id && rec.isUp === false" class="absolute -top-2 -right-2 select-none">
                <circle cx="150" cy="150" r="140" fill="oklch(55.1% 0.027 264.364)" />
                <text x="50%" y="50%" transform="rotate(15, 150, 150)"
                  font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
                  font-weight="bold" font-size="180" text-anchor="middle" dominant-baseline="central" fill="white">
                  歪
                </text>
              </svg>
            </div>
          </div>

          <div v-else class="text-xs text-gray-400 italic">
            暂无6星记录
          </div>
        </div>
      </div>
    </UCard>

    <UCard v-if="selectedLimitedStat" :key="'weapon-limited'" class="relative">
      <template #header>
        <div class="flex justify-between items-start gap-3">
          <div class="min-w-0">
            <h3 class="text-lg font-bold truncate">限定武器池</h3>
          </div>

          <div class="flex flex-col items-end gap-1 shrink-0">
            <USelect v-model="selectedLimitedPoolId" :items="limitedPoolOptions" placeholder="选择限定池" size="sm"
              class="w-44" />
          </div>
        </div>
      </template>

      <div class="absolute top-18 right-3 flex flex-col gap-1">
        <UBadge v-if="!isAllLimitedSelected" variant="outline">当前已垫: {{ selectedLimitedStat.pityCount }} 抽</UBadge>
        <UBadge v-if="!isAllLimitedSelected && selectedLimitedStat.up6Id"
          :variant="selectedLimitedStat.gotUp6 ? 'solid' : 'outline'">
          <span v-if="selectedLimitedStat.gotUp6">已获得当期 UP</span>
          <span v-else>尚未获得当期 UP</span>
        </UBadge>
      </div>

      <PieChart :data="selectedLimitedStat"></PieChart>

      <div class="space-y-2 text-sm">
        <div class="flex justify-between border-b pb-1">
          <span>总抽数:</span> <span>{{ selectedLimitedStat.totalPulls }}</span>
        </div>

        <div v-for="row in getStarRows(selectedLimitedStat)" :key="row.label"
          class="grid grid-cols-[40px_70px_80px_1fr] gap-1 text-xs py-1 border-b border-gray-100 dark:border-gray-800 items-center">
          <span :class="['font-bold', row.color]">{{ row.label }}</span>

          <span class="text-gray-600 dark:text-gray-300">
            共 {{ row.count }} 个
          </span>

          <span class="text-gray-500">
            占 {{ getPercent(row.count, selectedLimitedStat.totalPulls) }}%
          </span>

          <span class="text-gray-500">
            平均 {{ getAvg(row.count, selectedLimitedStat.totalPulls) }} 抽/个
          </span>
        </div>

        <div class="mt-3">
          <p class="font-semibold mb-2 text-gray-500 text-xs">
            6★ 历史记录:
            <span class="font-normal text-gray-400">
              出卡数 {{ selectedLimitedHistory6Count }} 次 · 歪 {{ selectedLimitedOffCount }} 次
            </span>
          </p>

          <div v-if="selectedLimitedStat.history6.length > 0" class="flex flex-wrap gap-2">
            <div v-for="(rec, idx) in [...selectedLimitedStat.history6].reverse()" :key="idx"
              class="relative text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 flex items-center gap-1">
              <span class="font-medium text-gray-700 dark:text-gray-200">
                {{ rec.name }}
              </span>

              <span class="text-gray-400">[{{ rec.pity }}]</span>

              <span v-if="rec.isNew" class="text-red-500 font-bold ml-0.5 text-[10px]">
                [NEW]
              </span>

              <svg width="20" height="20" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg"
                v-if="rec.up6Id && rec.isUp === false" class="absolute -top-2 -right-2 select-none">
                <circle cx="150" cy="150" r="140" fill="oklch(55.1% 0.027 264.364)" />
                <text x="50%" y="50%" transform="rotate(15, 150, 150)"
                  font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
                  font-weight="bold" font-size="180" text-anchor="middle" dominant-baseline="central" fill="white">
                  歪
                </text>
              </svg>
            </div>
          </div>

          <div v-else class="text-xs text-gray-400 italic">
            暂无6星记录
          </div>
        </div>
      </div>
    </UCard>

    <UCard v-if="selectedNormalStat" :key="'weapon-normal'" class="relative">
      <template #header>
        <div class="flex justify-between items-start gap-3">
          <div class="min-w-0">
            <h3 class="text-lg font-bold truncate">非限定武器池</h3>
          </div>

          <div class="flex flex-col items-end gap-1 shrink-0">
            <USelect v-model="selectedNormalPoolId" :items="normalPoolOptions" placeholder="选择非限定池" size="sm"
              class="w-44" />
          </div>
        </div>
      </template>

      <div class="absolute top-18 right-3 flex flex-col gap-1">
        <UBadge v-if="!isAllNormalSelected" variant="outline">当前已垫: {{ selectedNormalStat.pityCount }} 抽</UBadge>
        <UBadge v-if="!isAllNormalSelected && selectedNormalStat.up6Id"
          :variant="selectedNormalStat.gotUp6 ? 'solid' : 'outline'">
          <span v-if="selectedNormalStat.gotUp6">已获得当期 UP</span>
          <span v-else>尚未获得当期 UP</span>
        </UBadge>
      </div>

      <PieChart :data="selectedNormalStat"></PieChart>

      <div class="space-y-2 text-sm">
        <div class="flex justify-between border-b pb-1">
          <span>总抽数:</span> <span>{{ selectedNormalStat.totalPulls }}</span>
        </div>

        <div v-for="row in getStarRows(selectedNormalStat)" :key="row.label"
          class="grid grid-cols-[40px_70px_80px_1fr] gap-1 text-xs py-1 border-b border-gray-100 dark:border-gray-800 items-center">
          <span :class="['font-bold', row.color]">{{ row.label }}</span>

          <span class="text-gray-600 dark:text-gray-300">
            共 {{ row.count }} 个
          </span>

          <span class="text-gray-500">
            占 {{ getPercent(row.count, selectedNormalStat.totalPulls) }}%
          </span>

          <span class="text-gray-500">
            平均 {{ getAvg(row.count, selectedNormalStat.totalPulls) }} 抽/个
          </span>
        </div>

        <div class="mt-3">
          <p class="font-semibold mb-2 text-gray-500 text-xs">
            6★ 历史记录:
            <span class="font-normal text-gray-400">
              出卡数 {{ selectedNormalHistory6Count }} 次 · 歪 {{ selectedNormalOffCount }} 次
            </span>
          </p>

          <div v-if="selectedNormalStat.history6.length > 0" class="flex flex-wrap gap-2">
            <div v-for="(rec, idx) in [...selectedNormalStat.history6].reverse()" :key="idx"
              class="relative text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 flex items-center gap-1">
              <span class="font-medium text-gray-700 dark:text-gray-200">
                {{ rec.name }}
              </span>

              <span class="text-gray-400">[{{ rec.pity }}]</span>

              <span v-if="isAllNormalSelected && rec.poolName" class="text-gray-400">
                · {{ rec.poolName }}
              </span>

              <span v-if="rec.isNew" class="text-red-500 font-bold ml-0.5 text-[10px]">
                [NEW]
              </span>

              <svg width="20" height="20" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg"
                v-if="rec.up6Id && rec.isUp === false" class="absolute -top-2 -right-2 select-none">
                <circle cx="150" cy="150" r="140" fill="oklch(55.1% 0.027 264.364)" />
                <text x="50%" y="50%" transform="rotate(15, 150, 150)"
                  font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
                  font-weight="bold" font-size="180" text-anchor="middle" dominant-baseline="central" fill="white">
                  歪
                </text>
              </svg>
            </div>
          </div>

          <div v-else class="text-xs text-gray-400 italic">
            暂无6星记录
          </div>
        </div>
      </div>
    </UCard>
  </div>
  <div v-else-if="isSystem && statistics.length <= 0" class="text-center text-gray-500 py-16">
    <div class="mb-2 text-4xl">👋</div>
    <p class="text-lg font-medium mt-5">欢迎使用 Endfield Gacha !</p>
    <p class="text-sm mt-3">当前选择的账号为 <b>{{ systemLabel }}</b> ，即从客户端 WebView 日志中获取寻访记录数据。</p>
    <p class="text-sm mt-1">请先在游戏内打开一次抽卡记录页，再点击“同步最新数据”。</p>
  </div>
  <div v-else class="text-center text-gray-500 py-10">
    暂无武器数据，请点击“同步最新数据”获取。
  </div>
</template>

<script setup lang="ts">
import { isSystemUid, systemUidLabel, SYSTEM_UID_CN } from '~/utils/systemAccount'
import type { GachaStatistics } from '~/types/gacha'

const { currentUser: uid } = useUserStore()

const { weaponStatistics: statistics } = useGachaSync();

const isSystem = computed(() => isSystemUid(uid.value))
const systemLabel = computed(() => systemUidLabel(uid.value || SYSTEM_UID_CN))

const ALL_LIMITED_VALUE = '__all__'
const isLimitedPool = (poolId: string) => !poolId.includes('constant')

const limitedStats = computed(() =>
  (statistics.value || []).filter((s) => isLimitedPool(String(s.poolId || ''))),
)
const normalStats = computed(() =>
  (statistics.value || []).filter((s) => !isLimitedPool(String(s.poolId || ''))),
)

const allWeaponStat = computed<GachaStatistics | undefined>(() => {
  const list = statistics.value || []
  if (list.length <= 0) return undefined

  const totalPulls = list.reduce((sum, s) => sum + (s.totalPulls || 0), 0)
  const count6 = list.reduce((sum, s) => sum + (s.count6 || 0), 0)
  const count5 = list.reduce((sum, s) => sum + (s.count5 || 0), 0)
  const count4 = list.reduce((sum, s) => sum + (s.count4 || 0), 0)
  const history6 = list.flatMap((s) => s.history6 || [])

  return {
    poolName: '所有武器池',
    poolId: '__all_weapons__',
    totalPulls,
    pityCount: 0,
    count6,
    count5,
    count4,
    history6,
  }
})
const allWeaponHistory6Count = computed(() => allWeaponStat.value?.history6?.length || 0)
const allWeaponOffCount = computed(
  () =>
    (allWeaponStat.value?.history6 || []).filter(
      (r: any) => !!r.up6Id && r.isUp === false,
    ).length,
)

const limitedPoolOptions = computed(() => [
  ...(limitedStats.value.length > 1 ? [{ label: '全部', value: ALL_LIMITED_VALUE }] : []),
  ...limitedStats.value.map((s) => ({ label: s.poolName, value: s.poolId || s.poolName })),
])

const selectedLimitedPoolId = ref<string>('')
const isAllLimitedSelected = computed(() => selectedLimitedPoolId.value === ALL_LIMITED_VALUE)

const ALL_NORMAL_VALUE = '__all__'
const normalPoolOptions = computed(() => [
  ...(normalStats.value.length > 1 ? [{ label: '全部', value: ALL_NORMAL_VALUE }] : []),
  ...normalStats.value.map((s) => ({ label: s.poolName, value: s.poolId || s.poolName })),
])

const selectedNormalPoolId = ref<string>('')
const isAllNormalSelected = computed(() => selectedNormalPoolId.value === ALL_NORMAL_VALUE)

watch(
  limitedStats,
  (list) => {
    if (!list || list.length <= 0) {
      selectedLimitedPoolId.value = ''
      return
    }

    const selectedKey = selectedLimitedPoolId.value

    if (selectedKey === ALL_LIMITED_VALUE) {
      if (list.length > 1) return
      selectedLimitedPoolId.value = (list[0]!.poolId || list[0]!.poolName) as string
      return
    }

    if (!selectedKey) {
      if (list.length > 1) {
        selectedLimitedPoolId.value = ALL_LIMITED_VALUE
        return
      }
    }

    const isValid = list.some((s) => (s.poolId || s.poolName) === selectedKey)
    if (isValid) return

    if (list.length > 1) {
      selectedLimitedPoolId.value = ALL_LIMITED_VALUE
      return
    }

    selectedLimitedPoolId.value = (list[0]!.poolId || list[0]!.poolName) as string
  },
  { immediate: true },
)

const allLimitedStat = computed<GachaStatistics | undefined>(() => {
  const list = limitedStats.value || []
  if (list.length <= 0) return undefined

  const totalPulls = list.reduce((sum, s) => sum + (s.totalPulls || 0), 0)
  const count6 = list.reduce((sum, s) => sum + (s.count6 || 0), 0)
  const count5 = list.reduce((sum, s) => sum + (s.count5 || 0), 0)
  const count4 = list.reduce((sum, s) => sum + (s.count4 || 0), 0)
  const history6 = list.flatMap((s) => s.history6 || [])

  return {
    poolName: '全部',
    poolId: ALL_LIMITED_VALUE,
    totalPulls,
    pityCount: 0,
    count6,
    count5,
    count4,
    history6,
  }
})

const selectedLimitedStat = computed<GachaStatistics | undefined>(() => {
  const list = limitedStats.value || []
  if (list.length <= 0) return undefined

  if (selectedLimitedPoolId.value === ALL_LIMITED_VALUE) {
    return allLimitedStat.value || list[0]
  }

  const key = selectedLimitedPoolId.value
  return list.find((s) => (s.poolId || s.poolName) === key) || list[0]
})

const selectedLimitedHistory6Count = computed(
  () => selectedLimitedStat.value?.history6?.length || 0,
)
const selectedLimitedOffCount = computed(
  () =>
    (selectedLimitedStat.value?.history6 || []).filter(
      (r: any) => !!r.up6Id && r.isUp === false,
    ).length,
)

watch(
  normalStats,
  (list) => {
    if (!list || list.length <= 0) {
      selectedNormalPoolId.value = ''
      return
    }

    const selectedKey = selectedNormalPoolId.value

    if (selectedKey === ALL_NORMAL_VALUE) {
      if (list.length > 1) return
      selectedNormalPoolId.value = (list[0]!.poolId || list[0]!.poolName) as string
      return
    }

    if (!selectedKey) {
      if (list.length > 1) {
        selectedNormalPoolId.value = ALL_NORMAL_VALUE
        return
      }
    }

    const isValid = list.some((s) => (s.poolId || s.poolName) === selectedKey)
    if (isValid) return

    if (list.length > 1) {
      selectedNormalPoolId.value = ALL_NORMAL_VALUE
      return
    }

    selectedNormalPoolId.value = (list[0]!.poolId || list[0]!.poolName) as string
  },
  { immediate: true },
)

const allNormalStat = computed<GachaStatistics | undefined>(() => {
  const list = normalStats.value || []
  if (list.length <= 0) return undefined

  const totalPulls = list.reduce((sum, s) => sum + (s.totalPulls || 0), 0)
  const count6 = list.reduce((sum, s) => sum + (s.count6 || 0), 0)
  const count5 = list.reduce((sum, s) => sum + (s.count5 || 0), 0)
  const count4 = list.reduce((sum, s) => sum + (s.count4 || 0), 0)
  const history6 = list.flatMap((s) => s.history6 || [])

  return {
    poolName: '全部',
    poolId: ALL_NORMAL_VALUE,
    totalPulls,
    pityCount: 0,
    count6,
    count5,
    count4,
    history6,
  }
})

const selectedNormalStat = computed<GachaStatistics | undefined>(() => {
  const list = normalStats.value || []
  if (list.length <= 0) return undefined

  if (selectedNormalPoolId.value === ALL_NORMAL_VALUE) {
    return allNormalStat.value || list[0]
  }

  const key = selectedNormalPoolId.value
  return list.find((s) => (s.poolId || s.poolName) === key) || list[0]
})

const selectedNormalHistory6Count = computed(
  () => selectedNormalStat.value?.history6?.length || 0,
)
const selectedNormalOffCount = computed(
  () =>
    (selectedNormalStat.value?.history6 || []).filter(
      (r: any) => !!r.up6Id && r.isUp === false,
    ).length,
)

interface StarRow {
  label: string;
  count: number;
  color: string;
}

const getStarRows = (stat: any): StarRow[] => [
  { label: '6★', count: stat.count6, color: 'text-orange-400' },
  { label: '5★', count: stat.count5, color: 'text-yellow-400' },
  { label: '4★', count: stat.count4, color: 'text-purple-500' },
];

const getPercent = (count: number, total: number) => {
  if (total <= 0) return '0.00';
  return ((count / total) * 100).toFixed(2);
};

const getAvg = (count: number, total: number) => {
  if (count <= 0) return '0.00';
  return (total / count).toFixed(2);
};

</script>
