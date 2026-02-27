<template>
  <PieChart :data="stat" />

  <div class="space-y-2 text-sm">
    <div class="flex justify-between border-b pb-1">
      <span>总抽数:</span> <span>{{ stat.totalPulls }}</span>
    </div>

    <div
      v-for="row in starRows"
      :key="row.label"
      class="grid grid-cols-[40px_70px_80px_1fr] gap-1 text-xs py-1 border-b border-gray-100 dark:border-gray-800 items-center"
    >
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
      <p class="font-semibold mb-2 text-gray-500 text-xs">
        6★ 历史记录:
        <span class="font-normal text-gray-400">
          出卡数 {{ history6Count }} 次 · 歪 {{ offCount }} 次
        </span>
      </p>

      <div v-if="(stat.history6 || []).length > 0" class="flex flex-wrap gap-2">
        <div
          v-for="(rec, idx) in [...(stat.history6 || [])].reverse()"
          :key="idx"
          class="relative text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 flex items-center gap-1"
        >
          <span class="font-medium text-gray-700 dark:text-gray-200">
            {{ rec.name }}
          </span>

          <span class="text-gray-400">[{{ rec.pity }}]</span>

          <span v-if="rec.isNew" class="text-red-500 font-bold ml-0.5 text-[10px]">
            [NEW]
          </span>

          <svg
            v-if="rec.up6Id && rec.isUp === false"
            width="20"
            height="20"
            viewBox="0 0 300 300"
            xmlns="http://www.w3.org/2000/svg"
            class="absolute -top-2 -right-2 select-none"
          >
            <circle cx="150" cy="150" r="140" fill="oklch(55.1% 0.027 264.364)" />
            <text
              x="50%"
              y="50%"
              transform="rotate(15, 150, 150)"
              font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
              font-weight="bold"
              font-size="180"
              text-anchor="middle"
              dominant-baseline="central"
              fill="white"
            >
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
</template>

<script setup lang="ts">
import type { GachaStatistics } from '~/types/gacha'

const props = withDefaults(
  defineProps<{
    stat: GachaStatistics
    showPoolNameInHistory?: boolean
  }>(),
  {
    showPoolNameInHistory: false,
  },
)

const stat = computed(() => props.stat)
const showPoolNameInHistory = computed(() => !!props.showPoolNameInHistory)

interface StarRow {
  label: string
  count: number
  color: string
}

const starRows = computed<StarRow[]>(() => [
  { label: '6★', count: stat.value.count6, color: 'text-orange-400' },
  { label: '5★', count: stat.value.count5, color: 'text-yellow-400' },
  { label: '4★', count: stat.value.count4, color: 'text-purple-500' },
])

const history6Count = computed(() => (stat.value.history6 || []).length)
const offCount = computed(
  () =>
    (stat.value.history6 || []).filter((r) => !!r.up6Id && r.isUp === false)
      .length,
)

const getPercent = (count: number, total: number) => {
  if (total <= 0) return '0.00'
  return ((count / total) * 100).toFixed(2)
}

const getAvg = (count: number, total: number) => {
  if (count <= 0) return '0.00'
  return (total / count).toFixed(2)
}
</script>

