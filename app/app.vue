<template>
  <UApp>
    <UContainer class="mt-3 space-y-4">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <UButton @click="onSyncClick" color="primary" :loading="isSyncing" :disabled="isSyncing">
            {{ isSyncing ? '同步中...' : '同步最新数据' }}
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
          <ColorMode />
          <NuxtLink v-if="route.path === '/setting'" :to="settingBackTo">
            <UButton icon="i-lucide-arrow-left" label="返回" color="neutral" variant="outline" />
          </NuxtLink>
          <NuxtLink v-else :to="{ path: '/setting', query: { from: route.fullPath } }">
            <UChip :show="updateHint" color="primary" size="sm">
              <UButton icon="i-lucide-settings" label="设置" color="neutral" variant="outline" />
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

const { loadConfig } = useUserStore();
const { isWindows, detect: detectPlatform } = usePlatform();
const { updateHint, checkForUpdate } = useUpdate();
const route = useRoute()
const uid = useState<string>('current-uid', () => 'none')
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

const loadAllData = (uid: string) => {
  console.log(`正在加载 UID ${uid} 的所有数据...`);
  loadCharData(uid);
  loadWeaponData(uid);
}

watch(uid, (newUid) => {
  if (newUid && newUid !== 'none') {
    loadAllData(newUid);
  } else {
    charRecords.value = {};
    weaponRecords.value = {};
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
    loadAllData(uid.value);
  }

  checkForUpdate().catch(console.error);
});

const onSyncClick = () => {
  handleSync(uid.value, gachaType.value);
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
