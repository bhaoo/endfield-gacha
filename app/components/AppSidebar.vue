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
</script>
