<template>
  <div v-if="uid === 'none' || !uid" class="text-center text-gray-500 py-16">
    <div class="mb-2 text-4xl">👋</div>
    <p class="text-lg font-medium">欢迎使用</p>
    <p class="text-sm mt-1">请先点击左上角添加账号，或选择一个已有账号。</p>
  </div>

  <div v-else-if="statistics.length > 0" class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <UCard v-if="selectedSpecialStat" :key="'special-pools'" class="relative">
      <template #header>
        <div class="flex justify-between items-start gap-3">
          <div class="min-w-0">
            <h3 class="text-lg font-bold truncate">特许寻访</h3>
          </div>

          <div class="flex flex-col items-end gap-1 shrink-0">
            <USelect
              v-model="selectedSpecialPoolId"
              :items="specialPoolOptions"
              placeholder="选择限定池"
              size="sm"
              class="w-44"
            />
          </div>
        </div>
      </template>

      <div class="absolute top-18 right-3 flex flex-col gap-1">
        <UBadge variant="outline">当前已垫: {{ selectedSpecialStat.pityCount }} 抽</UBadge>
        <UBadge v-if="selectedSpecialStat.bigPityRemaining !== undefined" :variant="(selectedSpecialStat.gotUp6)? 'solid' : 'outline'">
          <span v-if="selectedSpecialStat.gotUp6">已获得当期 UP</span>
          <span v-else>大保底: {{ selectedSpecialStat.bigPityMax - selectedSpecialStat.bigPityRemaining }} / {{ selectedSpecialStat.bigPityMax }}</span>
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
          <p class="font-semibold mb-2 text-gray-500 text-xs">6★ 历史记录:</p>

          <div v-if="selectedSpecialStat.history6.length > 0" class="flex flex-wrap gap-2">
            <div v-for="(rec, idx) in [...selectedSpecialStat.history6].reverse()" :key="idx"
              class="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 flex items-center gap-1">
              <span class="font-medium text-gray-700 dark:text-gray-200">
                {{ rec.name }}
              </span>

              <span class="text-gray-400">[{{ rec.isFree ? '加急招募' : rec.pity }}]</span>

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

const { currentUser: uid } = useUserStore()
const { charStatistics: statistics } = useGachaSync();

const isSystem = computed(() => isSystemUid(uid.value))
const systemLabel = computed(() => systemUidLabel(uid.value || SYSTEM_UID_CN))

const SPECIAL_POOL_TYPE = 'E_CharacterGachaPoolType_Special'

const specialStats = computed(() =>
  (statistics.value || []).filter((s) => s.poolType === SPECIAL_POOL_TYPE),
)

const otherStats = computed(() =>
  (statistics.value || []).filter((s) => s.poolType !== SPECIAL_POOL_TYPE),
)

const specialPoolOptions = computed(() =>
  specialStats.value.map((s) => ({
    label: s.poolName,
    value: s.poolId || s.poolName,
  })),
)

const selectedSpecialPoolId = ref<string>('')

watch(
  specialStats,
  (list) => {
    if (!list || list.length <= 0) {
      selectedSpecialPoolId.value = ''
      return
    }

    const selectedKey = selectedSpecialPoolId.value
    const isValid = list.some((s) => (s.poolId || s.poolName) === selectedKey)
    if (isValid) return

    const current = list.find((s) => s.isCurrentPool)
    selectedSpecialPoolId.value =
      (current?.poolId ||
        current?.poolName ||
        list[0]!.poolId ||
        list[0]!.poolName) as string
  },
  { immediate: true },
)

const selectedSpecialStat = computed<GachaStatistics | undefined>(() => {
  if (specialStats.value.length <= 0) return undefined
  const key = selectedSpecialPoolId.value
  return (
    specialStats.value.find((s) => (s.poolId || s.poolName) === key) ||
    specialStats.value[0]
  )
})

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
