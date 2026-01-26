<template>
  <USelect v-model="uid" :items="uidList" placeholder="选择账号" :disabled="uidList.length === 0" />
</template>

<script setup lang="ts">
const uid = defineModel<string>({ required: true });

const { uidList, loadConfig } = useUserStore();

onMounted(() => {
  if (uidList.value.length === 0) {
    loadConfig().then(() => {
      if ((!uid.value || uid.value === 'none') && uidList.value.length > 0) {
        uid.value = uidList.value[0];
      }
    });
  }
});
</script>