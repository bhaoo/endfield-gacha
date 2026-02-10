<template>
  <USelect v-model="uid" :items="uidList" placeholder="选择账号" :disabled="uidList.length === 0" />
</template>

<script setup lang="ts">
import { isSystemUid } from '~/utils/systemAccount'

const uid = defineModel<string>({ required: true })

const { uidList, loadConfig, currentUser } = useUserStore()
const { isWindows, detect: detectPlatform } = usePlatform()

const ensureSelected = () => {
  if ((!uid.value || uid.value === 'none') && uidList.value.length > 0) {
    uid.value = uidList.value[0]!.value
  }
}

onMounted(async () => {
  await detectPlatform()
  await loadConfig()

  if (!isWindows.value && isSystemUid(uid.value)) {
    const exists = uidList.value.some((x) => x.value === currentUser.value)
    if (currentUser.value && exists) {
      uid.value = currentUser.value
    } else {
      uid.value = 'none'
    }
  }

  ensureSelected()
})

watch(uidList, () => {
  ensureSelected()
})
</script>
