<template>
  <UApp>
    <UContainer class="my-3 space-y-4">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <UButton @click="onSyncClick" color="primary" :loading="syncMode === 'latest' && isSyncing" :disabled="isSyncing">
            {{ isSyncing && syncMode === 'latest' ? '同步中...' : '同步最新数据' }}
          </UButton>
          <UButton @click="onFullBackupClick" color="neutral" variant="outline" :loading="syncMode === 'full' && isSyncing"
            :disabled="isSyncing">
            {{ isSyncing && syncMode === 'full' ? '同步中...' : '全量同步' }}
          </UButton>
          <AddAccount @success="handleAccountAdded"></AddAccount>
          <SelectAccount v-model="uid"></SelectAccount>
          <NuxtLink :to="togglePoolTo">
            <UButton color="neutral" variant="outline">
              {{ togglePoolLabel }}
            </UButton>
          </NuxtLink>
          <USeparator v-if="isSyncing && syncProgress.poolName" orientation="vertical" class="h-6 mx-2" />
          <UBadge v-if="isSyncing && syncProgress.poolName" color="neutral" variant="outline">
            正在获取：{{ syncProgress.poolName }} · 第 {{ syncProgress.page }} 页
          </UBadge>
        </div>
        <div class="flex items-center gap-2">
          <div
            v-if="hasCharGachaData"
            class="rounded-md font-medium inline-flex items-center text-sm ring ring-red-300 ring-inset text-default bg-default p-1.5"
          >
            <img class="block w-5 h-5 relative top-0.4 mr-1" src="assets/images/oroberyl.png" />
            <span class="tabular-nums">{{ oroberylCostDisplay }}</span>
          </div>
          <div
            v-if="hasWeaponGachaData"
            class="rounded-md font-medium inline-flex items-center text-sm ring ring-blue-300 ring-inset text-default bg-default p-1.5"
          >
            <img class="block w-5 h-5 relative top-0.4 mr-1" src="assets/images/arsenal_ticket.png" />
            <span class="tabular-nums">{{ arsenalTicketCostDisplay }}</span>
          </div>
          <NuxtLink v-if="route.path === '/setting'" :to="settingBackTo">
            <UButton icon="i-lucide-arrow-left" label="返回" color="neutral" variant="outline" />
          </NuxtLink>
          <NuxtLink v-else :to="{ path: '/setting', query: { from: route.fullPath } }">
            <UChip :show="updateHint" color="primary" size="sm">
              <UButton icon="i-lucide-settings" color="neutral" variant="outline" />
            </UChip>
          </NuxtLink>
        </div>
      </div>

      <NuxtPage />

    </UContainer>
  </UApp>
</template>

<script lang="ts" setup>
import { openUrl } from '@tauri-apps/plugin-opener';
import { isSystemUid } from '~/utils/systemAccount'

const { charRecords, weaponRecords, isSyncing, syncProgress, handleSync, loadCharData, loadWeaponData } = useGachaSync();

const { loadConfig, currentUser: uid } = useUserStore();
const { isWindows, detect: detectPlatform } = usePlatform();
const { updateHint, checkForUpdate } = useUpdate();
const route = useRoute()
const syncMode = ref<'latest' | 'full' | null>(null)
const isUserDataLoading = useState<boolean>('gacha-user-data-loading', () => false)
let userDataLoadSeq = 0

const CHARACTER_OROBERYL_PER_PULL = 500
const WEAPON_ARSENAL_TICKET_PER_TEN_PULL = 1980
const WEAPON_ARSENAL_TICKET_PER_PULL = WEAPON_ARSENAL_TICKET_PER_TEN_PULL / 10

const summarizeTotalPulls = (records: Record<string, any[]> | undefined | null) => {
  let total = 0
  for (const list of Object.values(records || {})) {
    if (!Array.isArray(list) || list.length <= 0) continue
    total += list.length
  }
  return total
}

const summarizeCharPaidPulls = (records: Record<string, any[]> | undefined | null) => {
  let paid = 0
  for (const list of Object.values(records || {})) {
    if (!Array.isArray(list) || list.length <= 0) continue
    for (const it of list) {
      // 角色池：不计算免费抽（isFree === true）
      if (it && it.isFree === true) continue
      paid++
    }
  }
  return paid
}

const charTotalPulls = computed(() => summarizeTotalPulls(charRecords.value as any))
const charPaidPulls = computed(() => summarizeCharPaidPulls(charRecords.value as any))
const weaponTotalPulls = computed(() => summarizeTotalPulls(weaponRecords.value as any))

const hasCharGachaData = computed(() => charTotalPulls.value > 0)
const hasWeaponGachaData = computed(() => weaponTotalPulls.value > 0)

const oroberylCost = computed(() => charPaidPulls.value * CHARACTER_OROBERYL_PER_PULL)
const arsenalTicketCost = computed(() =>
  Math.round(weaponTotalPulls.value * WEAPON_ARSENAL_TICKET_PER_PULL),
)

const formatK = (value: number) => {
  if (!Number.isFinite(value)) return '0'
  if (value > 99000) {
    // 截断到 0.1k，避免四舍五入显示比实际更高
    const k = Math.floor(value / 100) / 10
    const s = Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)
    return `${s.replace(/\.0$/, '')}k`
  }
  return String(value)
}

const oroberylCostDisplay = computed(() => formatK(oroberylCost.value))
const arsenalTicketCostDisplay = computed(() => formatK(arsenalTicketCost.value))

watch(isSyncing, (v) => {
  if (!v) syncMode.value = null
})
const settingBackTo = computed(() => {
  const raw = route.query.from
  const from = Array.isArray(raw) ? raw[0] : raw
  if (typeof from !== 'string') return '/'
  if (!from.startsWith('/')) return '/'
  return from
})
const currentMainPage = computed(() => {
  if (route.path === '/setting') {
    const from = settingBackTo.value
    return from.startsWith('/weapon') ? '/weapon' : '/'
  }
  return route.path === '/weapon' ? '/weapon' : '/'
})
const togglePoolTo = computed(() => (currentMainPage.value === '/' ? '/weapon' : '/'))
const togglePoolLabel = computed(() =>
  currentMainPage.value === '/' ? '切换至武器池' : '切换至角色池',
)
const gachaType = computed(() => {
  return currentMainPage.value === '/' ? 'char' : 'weapon'
})

const loadAllData = async (uidToLoad: string) => {
  console.log(`正在加载 UID ${uidToLoad} 的所有数据...`);
  const seq = ++userDataLoadSeq
  isUserDataLoading.value = true
  try {
    await Promise.all([loadCharData(uidToLoad), loadWeaponData(uidToLoad)])
  } finally {
    if (seq === userDataLoadSeq && uid.value === uidToLoad) {
      isUserDataLoading.value = false
    }
  }
}

watch(uid, async (newUid) => {
  if (newUid && newUid !== 'none') {
    charRecords.value = {};
    weaponRecords.value = {};
    await loadAllData(newUid);
  } else {
    charRecords.value = {};
    weaponRecords.value = {};
    isUserDataLoading.value = false
  }
});

onMounted(async () => {
  await detectPlatform();
  await loadConfig();

  if (!isWindows.value && isSystemUid(uid.value)) {
    uid.value = 'none';
    return;
  }

  if (uid.value && uid.value !== 'none') {
    charRecords.value = {};
    weaponRecords.value = {};
    await loadAllData(uid.value);
  }

  checkForUpdate().catch(console.error);
});

const onSyncClick = () => {
  syncMode.value = 'latest'
  handleSync(uid.value, gachaType.value);
}

const onFullBackupClick = () => {
  syncMode.value = 'full'
  handleSync(uid.value, gachaType.value, { full: true })
}

const open = async (url: string) => {
  try {
    await openUrl(url);
  } catch (error) {
    console.error(error);
  }
};

const handleAccountAdded = () => {
  console.log('账号添加成功，全局列表已自动更新');
};
</script>
