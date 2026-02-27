<template>
  <div v-if="uid === 'none' || !uid" class="text-center text-gray-500 py-16">
    <div class="mb-2 text-4xl">👋</div>
    <p class="text-lg font-medium">欢迎使用</p>
    <p class="text-sm mt-1">请先点击左上角添加账号，或选择一个已有账号。</p>
  </div>

  <div v-else-if="isUserDataLoading" class="text-center text-gray-500 py-16">
    <div class="mb-2 text-4xl">⏳</div>
    <p class="text-lg font-medium">正在加载数据...</p>
    <p class="text-sm mt-1">切换账号时会读取本地记录，请稍等片刻。</p>
  </div>

  <div v-else-if="statistics.length > 0" class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <UCard v-if="selectedSpecialStat" :key="'special-pools'" class="relative">
      <template #header>
        <div class="flex justify-between items-start gap-3">
          <div class="min-w-0">
            <h3 class="text-lg font-bold truncate">特许寻访</h3>
          </div>

          <div class="flex flex-col items-end gap-1 shrink-0">
            <USelect v-model="selectedSpecialPoolId" :items="specialPoolOptions" placeholder="选择限定池" size="sm"
              class="w-44" />
          </div>
        </div>
      </template>

      <div class="absolute top-18 right-3 flex flex-col gap-1">
        <UBadge variant="outline">当前已垫: {{ selectedSpecialStat.pityCount }} 抽</UBadge>
        <UBadge
          v-if="
            !isAllSpecialSelected &&
            selectedSpecialStat.bigPityRemaining !== undefined &&
            selectedSpecialStat.bigPityMax !== undefined
          "
          :variant="(selectedSpecialStat.gotUp6) ? 'solid' : 'outline'">
          <span v-if="selectedSpecialStat.gotUp6">已获得当期 UP</span>
          <span v-else>大保底: {{ selectedSpecialStat.bigPityMax - selectedSpecialStat.bigPityRemaining }} / {{
            selectedSpecialStat.bigPityMax }}</span>
        </UBadge>
      </div>

      <PieChart :data="selectedSpecialStat"></PieChart>

      <div class="space-y-2 text-sm">
        <div class="flex justify-between border-b pb-1">
          <span>总抽数:</span> <span>{{ selectedSpecialStat.totalPulls }}</span>
        </div>

        <div v-for="row in getStarRows(selectedSpecialStat)" :key="row.label"
          class="grid grid-cols-[40px_70px_80px_1fr] gap-1 text-xs py-1 border-b border-gray-100 dark:border-gray-800 items-center">
          <span :class="['font-bold', row.color]">{{ row.label }}</span>

          <span class="text-gray-600 dark:text-gray-300">
            共 {{ row.count }} 个
          </span>

          <span class="text-gray-500">
            占 {{ getPercent(row.count, selectedSpecialStat.totalPulls) }}%
          </span>

          <span class="text-gray-500">
            平均 {{ getAvg(row.count, selectedSpecialStat.totalPulls) }} 抽/个
          </span>
        </div>

        <div class="mt-3">
          <p class="font-semibold mb-2 text-gray-500 text-xs">
            6★ 历史记录:
            <span class="font-normal text-gray-400">
              出卡数 {{ selectedSpecialHistory6Count }} 次 · 歪 {{ selectedSpecialOffCount }} 次
            </span>
          </p>

          <div v-if="selectedSpecialStat.history6.length > 0" class="flex flex-wrap gap-2">
            <div v-for="(rec, idx) in [...selectedSpecialStat.history6].reverse()" :key="idx"
              class="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 flex items-center gap-1 relative">
              <span class="font-medium text-gray-700 dark:text-gray-200">
                {{ rec.name }}
              </span>

              <span class="text-gray-400">[{{ rec.isFree ? '加急招募' : rec.pity }}]</span>
              <span v-if="rec.isNew" class="text-red-500 font-bold ml-0.5 text-[10px]">
                [NEW]
              </span>

              <svg width="20" height="20" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" v-if="rec.up6Id && rec.isUp === false"
                class="absolute -top-2 -right-2 select-none">
                <circle cx="150" cy="150" r="140" fill="oklch(55.1% 0.027 264.364)" />
                <text x="50%" y="50%"
                  transform="rotate(15, 150, 150)"
                  font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
                  font-weight="bold" font-size="180" text-anchor="middle" dominant-baseline="central"
                  fill="white">歪</text>
              </svg>
            </div>
          </div>

          <div v-else class="text-xs text-gray-400 italic">
            暂无6星记录
          </div>
        </div>
      </div>
    </UCard>

    <UCard v-for="stat in otherStats" :key="stat.poolId || stat.poolName">
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="text-lg font-bold">{{ stat.poolName }}</h3>
          <UBadge>
            当前已垫: {{ stat.pityCount }} 抽
          </UBadge>
        </div>
      </template>

      <PieChart :data="stat"></PieChart>

      <div class="space-y-2 text-sm">
        <div class="flex justify-between border-b pb-1">
          <span>总抽数:</span> <span>{{ stat.totalPulls }}</span>
        </div>

        <div v-for="row in getStarRows(stat)" :key="row.label"
          class="grid grid-cols-[40px_70px_80px_1fr] gap-1 text-xs py-1 border-b border-gray-100 dark:border-gray-800 items-center">
          <span :class="['font-bold', row.color]">{{ row.label }}</span>

          <span class="text-gray-600 dark:text-gray-300">
            共 {{ row.count }} 个
          </span>

          <span class="text-gray-500">
            占 {{ getPercent(row.count, stat.totalPulls) }}%
          </span>

          <span class="text-gray-500">
            平均 {{ getAvg(row.count, stat.totalPulls) }} 抽/个
          </span>
        </div>

        <div class="mt-3">
          <p class="font-semibold mb-2 text-gray-500 text-xs">6★ 历史记录:</p>

          <div v-if="stat.history6.length > 0" class="flex flex-wrap gap-2">
            <div v-for="(rec, idx) in [...stat.history6].reverse()" :key="idx"
              class="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 flex items-center gap-1">
              <span class="font-medium text-gray-700 dark:text-gray-200">
                {{ rec.name }}
              </span>

              <span class="text-gray-400">[{{ rec.pity }}]</span>

              <span v-if="rec.isNew" class="text-red-500 font-bold ml-0.5 text-[10px]">
                [NEW]
              </span>
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
    暂无角色数据，请点击“同步最新数据”获取。
  </div>
</template>

<script setup lang="ts">
import { isSystemUid, systemUidLabel, SYSTEM_UID_CN } from '~/utils/systemAccount'
import type { GachaStatistics } from '~/types/gacha'
import { sortHistory6Desc } from '~/utils/historySort'

const { currentUser: uid } = useUserStore()
const { charStatistics: statistics } = useGachaSync();
const isUserDataLoading = useState<boolean>('gacha-user-data-loading', () => false)

const isSystem = computed(() => isSystemUid(uid.value))
const systemLabel = computed(() => systemUidLabel(uid.value || SYSTEM_UID_CN))

const SPECIAL_POOL_TYPE = 'E_CharacterGachaPoolType_Special'
const ALL_SPECIAL_VALUE = '__all__'

const specialStats = computed(() =>
  (statistics.value || []).filter((s) => s.poolType === SPECIAL_POOL_TYPE),
)

const otherStats = computed(() =>
  (statistics.value || []).filter((s) => s.poolType !== SPECIAL_POOL_TYPE),
)

const specialPoolOptions = computed(() =>
  [
    ...(specialStats.value.length > 1 ? [{ label: '全部', value: ALL_SPECIAL_VALUE }] : []),
    ...specialStats.value.map((s) => ({
      label: s.poolName,
      value: s.poolId || s.poolName,
    })),
  ],
)

const selectedSpecialPoolId = ref<string>('')
const isAllSpecialSelected = computed(() => selectedSpecialPoolId.value === ALL_SPECIAL_VALUE)

watch(
  specialStats,
  (list) => {
    if (!list || list.length <= 0) {
      selectedSpecialPoolId.value = ''
      return
    }

    const selectedKey = selectedSpecialPoolId.value
    if (selectedKey === ALL_SPECIAL_VALUE) {
      if (list.length > 1) return
      selectedSpecialPoolId.value = (list[0]!.poolId || list[0]!.poolName) as string
      return
    }

    // 当存在多个特许池时默认选“全部”
    if (!selectedKey) {
      if (list.length > 1) {
        selectedSpecialPoolId.value = ALL_SPECIAL_VALUE
        return
      }
    }
    const isValid = list.some((s) => (s.poolId || s.poolName) === selectedKey)
    if (isValid) return

    const current = list.find((s) => s.isCurrentPool)
    if (list.length > 1) {
      selectedSpecialPoolId.value = ALL_SPECIAL_VALUE
      return
    }

    selectedSpecialPoolId.value =
      (current?.poolId ||
        current?.poolName ||
        list[0]!.poolId ||
        list[0]!.poolName) as string
  },
  { immediate: true },
)

const allSpecialStat = computed<GachaStatistics | undefined>(() => {
  const list = specialStats.value || []
  if (list.length <= 0) return undefined

  const current = list.find((s) => s.isCurrentPool) || list[0]!
  const totalPulls = list.reduce((sum, s) => sum + (s.totalPulls || 0), 0)
  const count6 = list.reduce((sum, s) => sum + (s.count6 || 0), 0)
  const count5 = list.reduce((sum, s) => sum + (s.count5 || 0), 0)
  const count4 = list.reduce((sum, s) => sum + (s.count4 || 0), 0)

  const history6 = sortHistory6Desc(list.flatMap((s) => s.history6 || []))

  return {
    poolType: SPECIAL_POOL_TYPE,
    poolName: '全部',
    totalPulls,
    pityCount: current.pityCount || 0,
    count6,
    count5,
    count4,
    history6,
  }
})

const selectedSpecialStat = computed<GachaStatistics | undefined>(() => {
  if (specialStats.value.length <= 0) return undefined
  if (selectedSpecialPoolId.value === ALL_SPECIAL_VALUE) {
    return allSpecialStat.value || specialStats.value[0]
  }
  const key = selectedSpecialPoolId.value
  return (
    specialStats.value.find((s) => (s.poolId || s.poolName) === key) ||
    specialStats.value[0]
  )
})

const selectedSpecialHistory6Count = computed(
  () => selectedSpecialStat.value?.history6?.length || 0,
)
const selectedSpecialOffCount = computed(
  () =>
    (selectedSpecialStat.value?.history6 || []).filter(
      (r) => !!r.up6Id && r.isUp === false,
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
