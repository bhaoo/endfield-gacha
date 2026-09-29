<template>
  <aside
    class="flex h-full w-18 shrink-0 flex-col items-center border-r border-default bg-elevated/40 py-3"
  >
    <nav class="flex flex-col items-center gap-1">
      <UTooltip text="角色" placement="right" :content="tooltipContent">
        <NuxtLink
          to="/"
          class="flex w-14 flex-col items-center gap-1.5 rounded-lg py-2.5 transition-colors"
          :class="isActive('/') ? 'text-primary' : 'text-muted hover:text-highlighted'"
        >
          <UIcon name="i-lucide-users-round" class="size-7" />
          <span class="text-xs">角色</span>
        </NuxtLink>
      </UTooltip>

      <UTooltip text="武器" placement="right" :content="tooltipContent">
        <NuxtLink
          to="/weapon"
          class="flex w-14 flex-col items-center gap-1.5 rounded-lg py-2.5 transition-colors"
          :class="isActive('/weapon') ? 'text-primary' : 'text-muted hover:text-highlighted'"
        >
          <UIcon name="i-lucide-swords" class="size-7" />
          <span class="text-xs">武器</span>
        </NuxtLink>
      </UTooltip>
    </nav>

    <div class="flex-1" />

    <div class="flex flex-col items-center gap-1">
      <UContextMenu :items="[[{
        label: '全量同步',
        onSelect() {
          onFullBackupClick()
        },
      }]]">
        <UTooltip text="默认增量同步，右键菜单可进入全量同步" placement="right" :content="tooltipContent">
          <button
            type="button"
            class="flex w-14 flex-col items-center gap-1.5 rounded-lg py-2.5 text-muted transition-colors hover:text-highlighted disabled:cursor-not-allowed disabled:hover:text-muted"
            :disabled="isSyncing"
            @click="onSyncClick"
          >
            <UIcon
              name="i-lucide-refresh-ccw"
              class="size-7 transition-transform"
              :class="{ 'animate-spin': isSyncing }"
            />
            <span class="text-xs">同步</span>
          </button>
        </UTooltip>
      </UContextMenu>

      <UTooltip :text="isDark ? '切换为亮色模式' : '切换为暗色模式'" placement="right" :content="tooltipContent">
        <button
          type="button"
          class="flex w-14 flex-col items-center gap-1.5 rounded-lg py-2.5 text-muted transition-colors hover:text-highlighted"
          @click="toggleTheme"
        >
          <UIcon :name="isDark ? 'i-lucide-moon' : 'i-lucide-sun'" class="size-7" />
          <span class="text-xs">{{ isDark ? '暗色' : '亮色' }}</span>
        </button>
      </UTooltip>

      <UTooltip text="设置" placement="right" :content="tooltipContent">
        <NuxtLink
          :to="{ path: '/setting', query: { from: route.fullPath } }"
          class="relative flex w-14 flex-col items-center gap-1.5 rounded-lg py-2.5 transition-colors"
          :class="route.path === '/setting' ? 'text-primary' : 'text-muted hover:text-highlighted'"
        >
          <UIcon name="i-lucide-settings" class="size-7" />
          <span class="text-xs">设置</span>
          <span
            v-if="updateHint"
            class="absolute right-2.5 top-1.5 size-2 rounded-full bg-primary"
          />
        </NuxtLink>
      </UTooltip>
    </div>

    <UModal
      v-model:open="isFullSyncConfirmOpen"
      title="全量同步"
    >
      <template #body>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          全量同步会重新拉取当前卡池的全部记录，耗时更长，是否继续？
          <br/>建议仅在<b>数据异常或需要完整重建</b>时使用该功能。
        </p>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="isSyncing"
            @click="() => { isFullSyncConfirmOpen = false }"
          >
            取消
          </UButton>
          <UButton
            color="error"
            :loading="syncMode === 'full' && isSyncing"
            :disabled="isSyncing"
            @click="onConfirmFullBackup"
          >
            确认全量同步
          </UButton>
        </div>
      </template>
    </UModal>
  </aside>
</template>

<script setup lang="ts">
const route = useRoute()
const { currentTheme, setTheme } = useUserStore()
const { updateHint } = useUpdate()

const tooltipContent = { side: 'right', sideOffset: 1 } as const

const isDark = computed(() => currentTheme.value === 'dark')

const toggleTheme = () => {
  setTheme(isDark.value ? 'light' : 'dark')
}

const isActive = (path: string) => {
  if (path === '/') {
    return route.path === '/'
  }
  return route.path === path || route.path.startsWith(`${path}/`)
}

const { isSyncing, handleSync } = useGachaSync()
const { currentUser: uid } = useUserStore()

const syncMode = ref<'latest' | 'full' | null>(null)
const isFullSyncConfirmOpen = ref(false)

watch(isSyncing, (v) => {
  if (!v) syncMode.value = null
})

const gachaType = computed(() => (route.path.startsWith('/weapon') ? 'weapon' : 'char'))

const onSyncClick = () => {
  syncMode.value = 'latest'
  handleSync(uid.value, gachaType.value)
}

const onFullBackupClick = () => {
  if (isSyncing.value) return
  isFullSyncConfirmOpen.value = true
}

const onConfirmFullBackup = () => {
  if (isSyncing.value) return
  isFullSyncConfirmOpen.value = false
  syncMode.value = 'full'
  handleSync(uid.value, gachaType.value, { full: true })
}
</script>
