<template>
  <UModal title="添加账号">
    <UButton icon="i-lucide-user-round-plus" size="md" color="neutral" variant="outline" />
    <template #body>
      <div class="flex flex-col items-center">
        <div class="flex flex-col md:flex-row items-center gap-2 mb-5">
          <UInput v-model="token" />
          <UButton @click="testToken" :loading="isTesting" :disabled="isTesting">确认</UButton>
        </div>
        <p class="text-center text-gray-500 text-sm">* 请先在鹰角网络<ULink @click="open('https://user.hypergryph.com/')"
            class="text-primary">官网</ULink>登录账号后，通过<ULink
            @click="open('https://web-api.hypergryph.com/account/info/hg')" class="text-primary">接口</ULink>获取token。</p>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener';
import { fetch } from '@tauri-apps/plugin-http';
import { invoke } from '@tauri-apps/api/core';
import type { AppConfig, User, UserBindingsResponse } from '~/types/gacha';

const isTesting = ref(false)
const toast = useToast()
const token = ref('')
const user_agent = ref('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.112 Safari/537.36')

const showToast = (title: string, desc: string) => {
  toast.add({
    title: title,
    description: desc
  })
}

const open = async (url: string) => {
  try {
    await openUrl(url);
  } catch (error) {
    console.error(error);
  }
};

const testToken = async () => {
  if (isTesting.value) return;

  const apiBaseUrl = "https://as.hypergryph.com/user/oauth2/v2/grant";
  const payload = {
    type: 1,
    appCode: "be36d44aa36bfb5b",
    token: token.value
  };

  isTesting.value = true
  const response = await fetch(apiBaseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': user_agent.value
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    isTesting.value = false
    showToast("添加失败", "请确认 token 是否准确。");
    return;
  }

  const data = await response.json()
  getUID(data.data.token)
}

const getUID = async (app_token: string) => {
  const apiBaseUrl = "https://binding-api-account-prod.hypergryph.com/account/binding/v1/binding_list";
  const query = new URLSearchParams({
    token: app_token,
    appCode: "endfield",
  });

  const response = await fetch(`${apiBaseUrl}?${query.toString()}`, {
    method: 'GET',
    headers: {
      'User-Agent': user_agent.value,
    },
  })

  if (!response.ok) {
    isTesting.value = false
    showToast("添加失败", "无法获取到绑定列表。");
    return;
  }

  const data = await response.json() as UserBindingsResponse
  const uid = data.data.list[0]?.bindingList[0]?.uid
  if (uid) saveAccount(uid)
}

const saveAccount = async (uid: string) => {
  const newUser: User = {
    uid: uid,
    token: token.value
  };

  let config: AppConfig = await invoke('read_config');
  if (!Array.isArray(config.users)) {
    config.users = [];
  }

  const existingIndex = config.users.findIndex(u => u.uid === newUser.uid);
  if (existingIndex !== -1) {
    config.users[existingIndex] = newUser;
  } else {
    config.users.push(newUser);
  }

  try {
    await invoke('save_config', { data: config });
    showToast("添加成功", "可以开始进行寻访记录分析力！");
    isTesting.value = false
    return;
  } catch (e) {
    showToast("添加失败", "无法保存至用户配置。");
    isTesting.value = false
    return;
  }
}
</script>