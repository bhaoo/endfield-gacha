<template>
  <USelect v-model="uid" :options="uidList" :loading="loading" placeholder="选择账号"/>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import type { AppConfig } from '~/types/gacha';

const uidList = ref<string[]>([]);
const loading = ref(false);

const uid = defineModel<string>({ required: true });

const refresh = async () => {
  loading.value = true;
  try {
    const config: AppConfig = await invoke('read_config');
    
    if (!Array.isArray(config.users)) {
      config.users = [];
    }

    uidList.value = config.users.map(user => user.uid);

    if ((!uid.value || uid.value === 'none') && uidList.value.length > 0) {
      uid.value = uidList.value[0];
    } else if (uidList.value.length === 0) {
      uid.value = "none";
    }

  } catch (error) {
    console.error('刷新账号列表失败', error);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  refresh();
});

defineExpose({ refresh });
</script>