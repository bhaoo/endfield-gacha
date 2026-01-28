<template>
  <div v-if="uid === 'none' || !uid" class="text-center text-gray-500 py-16">
    <div class="mb-2 text-4xl">👋</div>
    <p class="text-lg font-medium">欢迎使用</p>
    <p class="text-sm mt-1">请先点击左上角添加账号，或选择一个已有账号。</p>
  </div>

  <div v-else-if="statistics.length > 0" class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <UCard v-for="stat in statistics" :key="stat.poolName">
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

  <div v-else class="text-center text-gray-500 py-10">
    暂无角色数据，请点击“同步最新数据”获取。
  </div>
</template>

<script setup lang="ts">
const uid = useState<string>('current-uid')
const { charStatistics: statistics } = useGachaSync();

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