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
          <NuxtLink :href="route.path === '/' ? '/weapon' : '/'">
            <UButton color="neutral" variant="outline">
              {{ route.path === '/' ? '切换至武器池' : '切换至角色池' }}
            </UButton>
          </NuxtLink>
          <USeparator v-if="isSyncing && syncProgress.poolName" orientation="vertical" class="h-6 mx-2" />
          <UBadge v-if="isSyncing && syncProgress.poolName" color="neutral" variant="outline">
            正在获取：{{ syncProgress.poolName }} · 第 {{ syncProgress.page }} 页
          </UBadge>
        </div>
        <div class="flex items-center gap-2">
          <ColorMode />
          <UPopover>
            <UButton label="更多" color="neutral" variant="outline" />
            <template #content>
              <UCard>
                <p>Version 0.4.3</p>
                <p>本工具为开源软件，源代码使用 MIT 协议授权</p>
                <p>祝各位大佬欧气满满！如果可以的话，可以给我一个 Star ⭐ 嘛！</p>
                <p>Github: <ULink @click="open('https://github.com/bhaoo/endfield-gacha')" class="text-primary">
                    https://github.com/bhaoo/endfield-gacha</ULink>
                </p>
              </UCard>
            </template>
          </UPopover>
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
const route = useRoute()
const uid = useState<string>('current-uid', () => 'none')
const gachaType = computed(() => {
  return route.path === '/' ? 'char' : 'weapon'
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
