<template>
  <ClientOnly>
    <USelectMenu
      v-model="preference"
      :items="items"
      :icon="preference?.icon"
      v-bind="$attrs"
      :search-input="false"
    >
    </USelectMenu>

    <template #fallback>
      <UButton
        icon="i-heroicons-arrow-path"
        color="neutral"
        variant="ghost"
        disabled
      />
    </template>
  </ClientOnly>
</template>

<script setup lang="ts">
const { currentTheme, setTheme } = useUserStore()

defineOptions({ inheritAttrs: false })

const items = computed(() => [
  { 
    label: '跟随系统', 
    value: 'system', 
    icon: 'i-heroicons-computer-desktop' 
  },
  { 
    label: '亮色模式', 
    value: 'light', 
    icon: 'i-heroicons-sun' 
  },
  { 
    label: '暗色模式', 
    value: 'dark', 
    icon: 'i-heroicons-moon' 
  }
])

const preference = computed({
  get() {
    return items.value.find(option => option.value === currentTheme.value) || items.value[0]
  },
  set(option) {
    if (option) {
      setTheme(option.value as 'system' | 'light' | 'dark')
    }
  }
})
</script>