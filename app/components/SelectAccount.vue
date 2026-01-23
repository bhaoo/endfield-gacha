<template>
  <USelect v-model="uid" :items="uidList" />
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import type { AppConfig } from '~/types/gacha';

let config: AppConfig = await invoke('read_config');
if (!Array.isArray(config.users)) {
  config.users = [];
}

const uidList = config.users.map(user => user.uid);

const uid = defineModel<string>({ required: true });

if (config.users.length !== 0 && config.users[0]) {
  uid.value = config.users[0]?.uid
} else {
  uid.value = "none"
}
</script>