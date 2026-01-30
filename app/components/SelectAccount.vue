<template>
  <USelect v-model="uid" :items="uidList" placeholder="选择账号" :disabled="uidList.length === 0" />
</template>

<script setup lang="ts">
const uid = defineModel<string>({ required: true });

const { uidList, loadConfig } = useUserStore();

onMounted(() => {
  // uidList 至少包含 system
  if (uidList.value.length <= 1) {
    loadConfig().then(() => {
      if ((!uid.value || uid.value === 'none') && uidList.value.length > 0) {
        uid.value = uidList.value[0]!.value;
      }
    });
  }
});
</script>
