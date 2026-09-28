<template>
  <!-- 未选择账号 -->
  <div v-if="uid === 'none' || !uid" class="py-16 text-center text-muted">
    <p class="mb-2 text-4xl">👋</p>
    <p class="text-lg font-medium">欢迎使用</p>
    <p class="mt-1 text-sm">请先点击上方「添加账号」，或选择一个已有账号。</p>
  </div>

  <!-- 数据加载中 -->
  <div v-else-if="isUserDataLoading" class="py-16 text-center text-muted">
    <p class="mb-2 text-4xl">⏳</p>
    <p class="text-lg font-medium">正在加载数据...</p>
    <p class="mt-1 text-sm">切换账号时会读取本地记录，请稍等片刻。</p>
  </div>


  <div v-else-if="typeGroups.length === 0" class="py-16 text-center text-muted">
    <p class="mb-2 text-4xl">🎴</p>
    <p class="text-lg font-medium">暂无武器申领数据</p>
    <p class="mt-1 text-sm">请先点击「同步最新数据」获取申领记录。</p>
  </div>

  <div v-else class="flex flex-col gap-4 md:h-full md:min-h-0 md:flex-row md:overflow-hidden">
    <div
      class="w-full shrink-0 md:w-56 md:pr-1"
    >
      <p class="mb-2 text-xs font-semibold tracking-wider text-muted">卡池类型</p>
      <div class="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
        <button
          v-for="group in typeGroups"
          :key="group.poolType"
          type="button"
          class="flex shrink-0 flex-col gap-1 rounded-xl border p-3 text-left transition-colors md:w-full"
          :class="
            selectedTypeKey === group.poolType
              ? 'border-primary bg-primary/10'
              : 'border-default bg-elevated/40 hover:border-primary/40 hover:bg-elevated'
          "
          @click="selectType(group.poolType)"
        >
          <span class="text-sm font-semibold leading-tight">{{ group.label }}</span>
          <span class="text-xs text-muted">{{ group.totalPulls }} 抽</span>
        </button>
      </div>
    </div>

    <div class="min-w-0 flex-1 space-y-4 md:overflow-y-auto md:px-1 pb-0.5" :class="mouseInside ? 'scrollbar-hover' : 'scrollbar-hidden'" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
      <template v-if="selectedPool">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <USelect
              v-if="subPools.length > 0"
              v-model="selectedPoolKey"
              :items="poolOptions"
              size="md"
              class="w-52"
            />
            <h2 v-else class="text-lg font-bold">{{ selectedPool.poolName }}</h2>

            <UBadge v-if="selectedPool.isCurrentPool" color="primary" variant="subtle" size="sm">
              当前卡池
            </UBadge>
          </div>

          <div class="flex items-center gap-2">
            <UBadge v-if="!isAllSelected" variant="outline">
              当前已垫：{{ selectedPool.pityCount }} 抽
            </UBadge>
            <UBadge
              v-if="!isAllSelected && selectedPool.up6Id"
              :variant="selectedPool.gotUp6 ? 'solid' : 'outline'"
            >
              <span v-if="selectedPool.gotUp6">已获得当期 UP</span>
              <span v-else-if="bigPity">大保底: {{ bigPity.count }} / {{ selectedPool.bigPityMax }}</span>
            </UBadge>
          </div>
        </div>

        <div v-if="rerunLocalGap" class="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-muted">
          服务器累计 {{ rerunLocalGap.official }} 抽，本地累计记录仅 {{ rerunLocalGap.local }} 次。差值原因来自官方已不再保留 90 天之前的历史申领记录，故无法同步到本地进行补齐；大保底进度将按服务器累计次数计算以确保结果准确。
        </div>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <UCard class="text-center">
            <p class="text-xs text-muted">总抽数</p>
            <p class="mt-1 text-2xl font-bold tabular-nums">
              {{ selectedPool.totalPulls }}
            </p>
          </UCard>
          <UCard class="text-center">
            <p class="text-xs text-muted">6★ 出货</p>
            <p class="mt-1 text-2xl font-bold tabular-nums text-orange-400">{{ selectedPool.count6 }}</p>
          </UCard>
          <UCard class="text-center">
            <p class="text-xs text-muted">6★ 概率</p>
            <p class="mt-1 text-2xl font-bold tabular-nums text-orange-400">
              {{ percent(selectedPool.count6, selectedPool.totalPulls) }}%
            </p>
          </UCard>
          <UCard class="text-center">
            <p class="text-xs text-muted">平均出货</p>
            <p class="mt-1 text-2xl font-bold tabular-nums">
              {{ avg(selectedPool.count6, selectedPool.totalPulls) }} 抽
            </p>
          </UCard>
        </div>

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">稀有度分布</h3>
                <span class="text-xs text-muted">共 {{ selectedPool.totalPulls }} 抽</span>
              </div>
            </template>
            <PieChart :data="selectedPool" />
          </UCard>

          <UCard>
            <template #header>
              <h3 class="font-semibold">占比明细</h3>
            </template>

            <div class="space-y-3">
              <div
                v-for="row in starRows"
                :key="row.label"
                class="rounded-lg border border-default p-3"
              >
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-2">
                    <span class="size-2.5 rounded-full" :class="row.dot" />
                    <span class="font-semibold" :class="row.color">{{ row.label }}</span>
                  </span>
                  <span class="text-sm font-bold tabular-nums">{{ row.count }} 个</span>
                </div>
                <div class="mt-2 flex items-center gap-3 text-xs text-muted">
                  <span>占 {{ percent(row.count, selectedPool.totalPulls) }}%</span>
                  <span>平均 {{ avg(row.count, selectedPool.totalPulls) }} 抽/个</span>
                </div>
                <UProgress
                  :model-value="row.count"
                  :max="selectedPool.totalPulls || 1"
                  size="sm"
                  :ui="{ indicator: row.progressColor }"
                  class="mt-2"
                />
              </div>
            </div>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">6★ 历史记录</h3>
              <span class="text-xs text-muted">
                出卡 {{ history6.length }} 次 · 歪 {{ offCount }} 次 · 新 {{ newCount }} 个
              </span>
            </div>
          </template>

          <div v-if="history6.length > 0" class="divide-y divide-default">
            <div
              v-for="(rec, idx) in history6"
              :key="rec.name + idx"
              class="flex items-center gap-3 py-2.5"
            >
              <div class="w-28 md:w-40 min-w-0 shrink-0">
                <p class="truncate text-sm font-medium">{{ rec.name }}</p>
                <p v-if="isAllSelected && rec.poolName" class="truncate text-xs text-muted">
                  {{ rec.poolName }}
                </p>
              </div>

              <div class="flex w-24 shrink-0 items-center justify-end gap-1.5">
                <UBadge v-if="rec.isUp" color="primary" variant="subtle" size="sm">UP</UBadge>
                <UBadge v-if="isOff(rec)" color="error" variant="subtle" size="sm">歪</UBadge>
                <UBadge v-else-if="rec.isNew" color="success" variant="subtle" size="sm">新</UBadge>
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <UProgress
                    :model-value="Math.min(rec.pity, WEAPON_SMALL_PITY_MAX)"
                    :max="WEAPON_SMALL_PITY_MAX"
                    class="h-2"
                    :ui="{ indicator: barColor(rec) }"
                  />
                  <span class="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {{ rec.pity }}<span class="text-xs font-normal text-muted">/{{ WEAPON_SMALL_PITY_MAX }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="py-8 text-center text-sm text-muted">
            暂无 6★ 记录
          </div>
        </UCard>
      </template>

      <div v-else-if="isSystem" class="py-16 text-center text-muted">
        <p class="mb-2 text-4xl">👋</p>
        <p class="text-lg font-medium">欢迎使用 Endfield Gacha !</p>
        <p class="mt-3 text-sm">
          当前选择的账号为 <b>{{ systemLabel }}</b>，即从客户端 WebView 日志中获取申领记录数据。
        </p>
        <p class="mt-1 text-sm">请先在游戏内打开一次申领记录页，再点击「同步最新数据」。</p>
      </div>

      <div v-else class="py-16 text-center text-muted">
        <p class="mb-2 text-4xl">⚔️</p>
        <p class="text-lg font-medium">暂无武器抽卡数据</p>
        <p class="mt-1 text-sm">请先点击「同步最新数据」获取申领记录。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GachaStatistics, HistoryRecord } from '~/types/gacha'
import { sortHistory6Desc } from '~/utils/historySort'
import {
  WEAPON_CONSTANT_POOL_TYPE,
  WEAPON_LIMITED_POOL_TYPE,
  WEAPON_POOL_TYPE_LABELS,
  WEAPON_RERUN_POOL_TYPE,
  WEAPON_SMALL_PITY_MAX,
  resolveBigPity,
} from '~/utils/gachaCalc'
import { isSystemUid, systemUidLabel, SYSTEM_UID_CN } from '~/utils/systemAccount'

definePageMeta({
  layout: 'default',
})

const mouseInside = ref(false);
const onMouseEnter = () => mouseInside.value = true;
const onMouseLeave = () =>  mouseInside.value = false;

const ALL_POOLS_VALUE = '__all__'

const { weaponStatistics } = useGachaSync()
const { currentUser: uid } = useUserStore()
const isUserDataLoading = useState<boolean>('gacha-user-data-loading', () => false)
const isSystem = computed(() => isSystemUid(uid.value))
const systemLabel = computed(() => systemUidLabel(uid.value || SYSTEM_UID_CN))

// 类型卡固定顺序：限定在前，非限定在后，重构申领独立成组
const WEAPON_POOL_TYPE_ORDER = [
  WEAPON_LIMITED_POOL_TYPE,
  WEAPON_RERUN_POOL_TYPE,
  WEAPON_CONSTANT_POOL_TYPE,
] as const

const statsByType = (poolType: string) =>
  (weaponStatistics.value || []).filter((s) => s.poolType === poolType)

const aggregatePools = (
  list: GachaStatistics[],
  poolType: string,
  poolName: string,
): GachaStatistics => {
  const sum = (pick: (s: GachaStatistics) => number) =>
    list.reduce((acc, s) => acc + (pick(s) || 0), 0)

  return {
    poolType,
    poolId: `${poolType}_all`,
    poolName,
    totalPulls: sum((s) => s.totalPulls),
    pityCount: 0,
    count6: sum((s) => s.count6),
    count5: sum((s) => s.count5),
    count4: sum((s) => s.count4),
    history6: sortHistory6Desc(list.flatMap((s) => s.history6 || [])),
  }
}

const typeGroups = computed(() =>
  WEAPON_POOL_TYPE_ORDER.map((poolType) => {
    const list = statsByType(poolType)
    return {
      poolType,
      label: WEAPON_POOL_TYPE_LABELS[poolType] || poolType,
      totalPulls: list.reduce((acc, s) => acc + (s.totalPulls || 0), 0),
      available: list.length > 0,
    }
  }).filter((g) => g.available),
)

const selectedTypeKey = ref<string>('')

const subPools = computed(() => statsByType(selectedTypeKey.value))

const selectedPoolKey = ref<string>(ALL_POOLS_VALUE)

const poolOptions = computed(() => [
  { label: '全部卡池', value: ALL_POOLS_VALUE },
  ...subPools.value.map((s) => ({
    label: s.poolName,
    value: String(s.poolId || s.poolName),
  })),
])

const isAllSelected = computed(() => selectedPoolKey.value === ALL_POOLS_VALUE)

const allPoolsStat = computed<GachaStatistics | undefined>(() => {
  const list = subPools.value
  if (list.length <= 0) return undefined
  const label = WEAPON_POOL_TYPE_LABELS[selectedTypeKey.value] || selectedTypeKey.value
  return aggregatePools(list, selectedTypeKey.value, `全部${label}`)
})

const selectedPool = computed<GachaStatistics | undefined>(() => {
  if (subPools.value.length <= 0) return undefined
  if (isAllSelected.value) return allPoolsStat.value
  const key = selectedPoolKey.value
  return (
    subPools.value.find((s) => String(s.poolId || s.poolName) === key) ||
    allPoolsStat.value
  )
})

// 切换类型：子池回到「全部卡池」
const selectType = (poolType: string) => {
  selectedTypeKey.value = poolType
  selectedPoolKey.value = ALL_POOLS_VALUE
}

watch(
  typeGroups,
  (list) => {
    if (list.length <= 0) {
      selectedTypeKey.value = ''
      return
    }
    if (list.some((g) => g.poolType === selectedTypeKey.value)) return
    // 默认选中当前池所属类型
    const currentType = (weaponStatistics.value || []).find((s) => s.isCurrentPool)?.poolType
    selectedTypeKey.value =
      list.find((g) => g.poolType === currentType)?.poolType || list[0]!.poolType
    selectedPoolKey.value = ALL_POOLS_VALUE
  },
  { immediate: true },
)

const history6 = computed(() => selectedPool.value?.history6 || [])

// 所有武器池均有 80 抽 UP 大保底；重构申领的计数与「累计申领」同源，优先用服务器权威值
const isRerunSelected = computed(() => selectedTypeKey.value === WEAPON_RERUN_POOL_TYPE)

const bigPity = computed(() => {
  const pool = selectedPool.value
  if (!pool || isAllSelected.value) return null
  return resolveBigPity(pool)
})

/**
 * 本地重构申领记录少于服务器累计抽数
 *
 * 两侧统一按抽比对（接口 totalPullCount 为抽数，本地一件=一抽）。
 * 差值来自官方已不再保留的历史记录，本地无法补齐；
 * 大保底进度取自服务器累计值，因此仍然准确。
 */
const rerunLocalGap = computed(() => {
  if (!isRerunSelected.value || isAllSelected.value) return null

  const pool = selectedPool.value
  if (!pool) return null

  const official = pool.officialTotalCount
  const local = pool.totalPulls || 0
  if (official === undefined || official <= local) return null

  return { official, local }
})

const offCount = computed(() => history6.value.filter((r) => isOff(r)).length)
const newCount = computed(() => history6.value.filter((r) => !!r.isNew).length)

const isOff = (rec: HistoryRecord) => !!rec.up6Id && rec.isUp === false

const percent = (count: number, total: number) => {
  if (total <= 0) return '0.00'
  return ((count / total) * 100).toFixed(2)
}

const avg = (count: number, total: number) => {
  if (count <= 0) return '0.00'
  return (total / count).toFixed(1)
}

// 进度条颜色：UP → 橙；歪 → 黄
const barColor = (rec: HistoryRecord) => (rec.isUp ? 'bg-orange-400' : 'bg-yellow-400')

const starRows = computed(() => {
  const s = selectedPool.value
  if (!s) return []
  return [
    { label: '6★', count: s.count6, color: 'text-orange-400', dot: 'bg-orange-400', progressColor: 'bg-orange-400' },
    { label: '5★', count: s.count5, color: 'text-yellow-400', dot: 'bg-yellow-400', progressColor: 'bg-yellow-400' },
    { label: '4★', count: s.count4, color: 'text-purple-500', dot: 'bg-purple-500', progressColor: 'bg-purple-500' },
  ]
})
</script>
