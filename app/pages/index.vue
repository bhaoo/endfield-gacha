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

  <div v-else class="flex flex-col gap-4 md:h-full md:min-h-0 md:flex-row md:overflow-hidden">
    <div
      class="w-full shrink-0 md:w-56 md:pr-1"
    >
      <p class="mb-2 text-xs font-semibold tracking-wider text-muted">卡池类型</p>
      <div class="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
        <button
          v-for="pool in pools"
          :key="pool.poolId || pool.poolName"
          type="button"
          class="group relative flex shrink-0 flex-col gap-1 overflow-hidden rounded-xl border p-3 text-left transition-colors md:w-full"
          :class="
            selectedTypeKey === pool.poolType
              ? 'border-primary bg-primary/10'
              : 'border-default bg-elevated/40 hover:border-primary/40 hover:bg-elevated'
          "
          @click="selectType(pool.poolType)"
        >
          <img
            v-if="poolImage(pool)"
            :src="poolImage(pool)"
            alt=""
            aria-hidden="true"
            class="pointer-events-none absolute -right-5 -top-3 size-24 select-none object-contain transition-all duration-300 mask-[linear-gradient(to_right,transparent,black_55%)]"
            :class="
              selectedTypeKey === pool.poolType
                ? 'opacity-45 blur-none'
                : 'opacity-20 blur-[2px] group-hover:opacity-35'
            "
          />

          <span class="relative text-sm font-semibold leading-tight">{{ pool.poolName }}</span>
          <span class="relative flex items-center gap-2 text-xs text-muted">
            <span>{{ pool.totalPulls }} 抽</span>
            <UBadge variant="subtle" size="sm" >垫 {{ pool.pityCount }} 抽</UBadge>
          </span>
        </button>
      </div>
    </div>

    <div class="min-w-0 flex-1 space-y-4 md:overflow-y-auto md:pl-1 md:pr-2 pb-0.5" :class="mouseInside ? 'scrollbar-hover' : 'scrollbar-hidden'" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
      <template v-if="selectedPool">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <!-- 特许寻访：子卡池下拉选择 -->
            <USelect
              v-if="isSpecialType && poolOptions.length > 0"
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
            <UBadge variant="outline" color="neutral">
              当前已垫：{{ selectedPool.pityCount }} 抽
            </UBadge>
            <UBadge
              v-if="
                !isAllSpecialSelected &&
                selectedPool.bigPityRemaining !== undefined &&
                selectedPool.bigPityMax !== undefined
              "
              :variant="selectedPool.gotUp6 ? 'solid' : 'outline'"
            >
              <span v-if="selectedPool.gotUp6">已获得当期 UP</span>
              <span v-else>
                大保底: {{ selectedPool.bigPityMax - selectedPool.bigPityRemaining }} / {{ selectedPool.bigPityMax }}
              </span>
            </UBadge>
          </div>
        </div>

        <p class="text-sm text-muted">
          {{ selectedPool.totalPulls }} 抽 · {{ selectedPool.count6 }} 个 6★ ·
          {{ selectedPool.count5 }} 个 5★ · {{ selectedPool.count4 }} 个 4★
        </p>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <UCard class="text-center">
            <p class="text-xs text-muted">总抽数</p>
            <p class="mt-1 text-2xl font-bold tabular-nums">{{ selectedPool.totalPulls }}</p>
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
                  :ui="{indicator: row.progressColor}"
                  class="mt-2"
                />
              </div>
            </div>
          </UCard>
        </div>

        <UCard :ui="{ body: 'p-0 sm:p-0 px-2 sm:px-4' }">
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
              <!-- 头像（按 charId 匹配，缺失回退 user 图标） -->
              <div class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-elevated/50">
                <img
                  v-if="charAvatar(rec)"
                  :src="charAvatar(rec)"
                  :alt="rec.name"
                  class="size-full object-cover object-top"
                />
                <UIcon v-else name="i-lucide-user" class="size-5 text-muted" />
              </div>

              <div class="w-24 md:w-36 min-w-0 shrink-0">
                <p class="truncate text-sm font-medium">{{ rec.name }}</p>
                <p v-if="isAllSpecialSelected && rec.poolName" class="truncate text-xs text-muted">
                  {{ rec.poolName }}
                </p>
              </div>

              <div class="flex w-24 shrink-0 items-center justify-end gap-1.5">
                <UBadge v-if="rec.isUp" color="primary" variant="subtle" size="sm">UP</UBadge>
                <UBadge v-if="isOff(rec)" color="error" variant="subtle" size="sm">歪</UBadge>
                <UBadge v-else-if="rec.isNew" color="success" variant="subtle" size="sm">新</UBadge>
                <UBadge v-if="rec.isFree" color="warning" variant="subtle" size="sm">加急</UBadge>
              </div>

              <!-- 抽数 + 进度条（满 80） -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <UProgress
                    :model-value="Math.min(rec.pity, 80)"
                    :max="80"
                    class="h-2"
                    :ui="{ indicator: barColor(rec) }"
                  />
                  <span class="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {{ rec.pity }}<span class="text-xs font-normal text-muted">/80</span>
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
          当前选择的账号为 <b>{{ systemLabel }}</b>，即从客户端 WebView 日志中获取寻访记录数据。
        </p>
        <p class="mt-1 text-sm">请先在游戏内打开一次抽卡记录页，再点击「同步最新数据」。</p>
      </div>

      <div v-else class="py-16 text-center text-muted">
        <p class="mb-2 text-4xl">🎴</p>
        <p class="text-lg font-medium">暂无角色抽卡数据</p>
        <p class="mt-1 text-sm">请先点击「同步最新数据」获取寻访记录。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GachaStatistics, HistoryRecord } from '~/types/gacha'
import { sortHistory6Desc } from '~/utils/historySort'
import { isSystemUid, systemUidLabel, SYSTEM_UID_CN } from '~/utils/systemAccount'
import specialPoolImg from '~/assets/images/pool/character_special.png'
import standardPoolImg from '~/assets/images/pool/character_standard.png'
import beginnerPoolImg from '~/assets/images/pool/character_beginner.png'
import jointPoolImg from '~/assets/images/pool/character_joint.png'

definePageMeta({
  layout: 'default',
})

const mouseInside = ref(false);
const onMouseEnter = () => mouseInside.value = true;
const onMouseLeave = () =>  mouseInside.value = false;

const SPECIAL_KEY = 'E_CharacterGachaPoolType_Special'
const STANDARD_KEY = 'E_CharacterGachaPoolType_Standard'
const BEGINNER_KEY = 'E_CharacterGachaPoolType_Beginner'
const JOINT_KEY = 'E_CharacterGachaPoolType_Joint'


const POOL_IMAGE_MAP: Record<string, string> = {
  [SPECIAL_KEY]: specialPoolImg,
  [STANDARD_KEY]: standardPoolImg,
  [BEGINNER_KEY]: beginnerPoolImg,
  [JOINT_KEY]: jointPoolImg
}

// 角色头像预加载
const avatarModules = import.meta.glob<string>('~/assets/images/character/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
})

const AVATAR_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(avatarModules).map(([path, url]) => [
    path.split('/').pop()!.replace(/\.png$/, ''),
    url,
  ]),
)

const charAvatar = (rec: HistoryRecord) => (rec.charId ? AVATAR_MAP[rec.charId] || '' : '')

const { charStatistics } = useGachaSync()
const { currentUser: uid } = useUserStore()
const isUserDataLoading = useState<boolean>('gacha-user-data-loading', () => false)
const isSystem = computed(() => isSystemUid(uid.value))
const systemLabel = computed(() => systemUidLabel(uid.value || SYSTEM_UID_CN))

// 特许寻访
const specialSubPools = computed<GachaStatistics[]>(() =>
  (charStatistics.value || []).filter((s) => s.poolType === SPECIAL_KEY),
)

// 非特许寻访（基础/启程）
const singlePools = computed<GachaStatistics[]>(() =>
  (charStatistics.value || []).filter((s) => s.poolType !== SPECIAL_KEY),
)

// 跨子池聚合
const aggregatePools = (
  list: GachaStatistics[],
  poolType: string,
  poolName: string,
): GachaStatistics => {
  const current = list.find((s) => s.isCurrentPool) || list[0]!
  const sum = (pick: (s: GachaStatistics) => number) =>
    list.reduce((acc, s) => acc + (pick(s) || 0), 0)

  return {
    poolType,
    poolId: `${poolType}_all`,
    poolName,
    totalPulls: sum((s) => s.totalPulls),
    // 垫抽跨池继承，取当前池的实时进度
    pityCount: current.pityCount,
    bigPityMax: current.bigPityMax,
    bigPityRemaining: current.bigPityRemaining,
    paidPulls: sum((s) => s.paidPulls || 0),
    count6: sum((s) => s.count6),
    count5: sum((s) => s.count5),
    count4: sum((s) => s.count4),
    history6: sortHistory6Desc(list.flatMap((s) => s.history6 || [])),
  }
}

// 卡池类型列表
const pools = computed<GachaStatistics[]>(() => {
  const list: GachaStatistics[] = []
  if (specialSubPools.value.length > 0) {
    list.push(aggregatePools(specialSubPools.value, SPECIAL_KEY, '特许寻访'))
  }
  list.push(...singlePools.value)
  return list
})

// 特许寻访：子卡池选项（第一项为「全部卡池」聚合视图）
const ALL_SPECIAL_VALUE = '__all__'

const poolOptions = computed(() => {
  if (specialSubPools.value.length <= 0) return []
  return [
    { label: '全部卡池', value: ALL_SPECIAL_VALUE },
    ...specialSubPools.value.map((s) => ({
      label: s.poolName,
      value: s.poolId as string,
    })),
  ]
})

// 「全部卡池」聚合视图（无子池时返回 undefined 走空态）
const allSpecialStat = computed<GachaStatistics | undefined>(() => {
  if (specialSubPools.value.length <= 0) return undefined
  return aggregatePools(specialSubPools.value, SPECIAL_KEY, '全部卡池')
})

const selectedPoolKey = ref<string>(ALL_SPECIAL_VALUE)
const selectedTypeKey = ref<string>(SPECIAL_KEY)

const isSpecialType = computed(() => selectedTypeKey.value === SPECIAL_KEY)

const isAllSpecialSelected = computed(
  () => isSpecialType.value && selectedPoolKey.value === ALL_SPECIAL_VALUE,
)

const selectedPool = computed<GachaStatistics | undefined>(() => {
  if (isSpecialType.value) {
    if (selectedPoolKey.value === ALL_SPECIAL_VALUE) return allSpecialStat.value
    return (
      specialSubPools.value.find((s) => s.poolId === selectedPoolKey.value) ||
      allSpecialStat.value
    )
  }
  return pools.value.find((p) => p.poolType === selectedTypeKey.value)
})

const poolImage = (pool: GachaStatistics) => POOL_IMAGE_MAP[pool.poolType || ''] || ''

// 切换卡池类型：仅特许寻访有子池，其余类型直接展示
const selectType = (poolType?: string) => {
  if (!poolType) return
  selectedTypeKey.value = poolType
  if (poolType === SPECIAL_KEY) {
    selectedPoolKey.value = ALL_SPECIAL_VALUE
  }
}

const history6 = computed(() => selectedPool.value?.history6 || [])

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

// 进度条颜色：UP+加急 → 金红渐变；UP 非加急 或 非 UP+加急 → 橙；非 UP 非加急（歪）→ 黄
const barColor = (rec: HistoryRecord) => {
  const isUp = !!rec.isUp
  const isFree = !!rec.isFree
  if (isUp && isFree) {
    return 'bg-[linear-gradient(90deg,#fde047,#fbbf24,#f59e0b,#dc2626,#7f1d1d)]'
  }
  if ((isUp && !isFree) || (!isUp && isFree)) return 'bg-orange-400'
  return 'bg-yellow-400'
}

const starRows = computed(() => {
  const s = selectedPool.value
  if (!s) return []
  return [
    { label: '6★', count: s.count6, color: 'text-orange-400', dot: 'bg-orange-400', progressColor: 'bg-orange-400' },
    { label: '5★', count: s.count5, color: 'text-yellow-400', dot: 'bg-yellow-400', progressColor: 'bg-yellow-400' },
    { label: '4★', count: s.count4, color: 'text-purple-500', dot: 'bg-purple-500', progressColor: 'bg-purple-500' },
  ]
})

const pityProgressMax = computed(() => selectedPool.value?.bigPityMax || 80)
const pityProgressValue = computed(() =>
  Math.min(selectedPool.value?.pityCount || 0, pityProgressMax.value),
)
</script>