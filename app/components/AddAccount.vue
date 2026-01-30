<template>
  <UModal v-model="isOpen" title="添加账号">
    <UButton icon="i-lucide-user-round-plus" size="md" color="neutral" variant="outline" />
    <template #body>
      <div class="flex flex-col gap-4 p-2">

        <UTabs v-model="serverValue" :content="false" :items="serverItems" class="border-b border-gray-100 dark:border-gray-800 pb-5"></UTabs>

        <div class="flex flex-col items-center justify-center border-b border-gray-100 dark:border-gray-800 pb-5">
          <UButton @click="handleWebLogin" :loading="isLoggingIn" :disabled="isProcessing" size="xl" color="neutral"
            variant="outline" class="w-full justify-center" icon="i-heroicons-globe-alt">
            {{ isLoggingIn ? '正在监听登录...' : '打开官网登录并自动获取' }}
          </UButton>
          <p class="text-xs text-gray-400 mt-2">
            推荐使用。将在应用内打开鹰角官网，登录后自动抓取 Token。
          </p>
        </div>

        <div class="space-y-3">
          <p class="text-sm font-bold text-gray-700 dark:text-gray-200">手动输入 Token</p>
          <div class="flex gap-2">
            <UInput v-model="token" placeholder="请粘贴 Token" class="flex-1" :disabled="isProcessing" />
            <UButton @click="handleManualAdd" :loading="isProcessing" :disabled="!token || isProcessing">
              确定
            </UButton>
          </div>
          <p class="text-xs text-gray-400">
            * 选择手动输入 Token 时，请先在鹰角网络<ULink @click="open(serverInfo.loginUrl)" class="text-primary">官网</ULink>登录账号后，通过<ULink @click="open(serverInfo.tokenUrl)" class="text-primary">接口</ULink>获取token。
          </p>
        </div>

      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener';
import { fetch } from '@tauri-apps/plugin-http';
import type { TabsItem } from '@nuxt/ui';
import type { LoginProvider } from '~/composables/useLogin';

const { addUser } = useUserStore();

const currentUid = useState<string>('current-uid');


const serverItems: TabsItem[] = [
  {
    label: '官服',
    icon: 'i-lucide-house',
    slot: 'account'
  },
  {
    label: '国际服（亚服）',
    icon: 'i-lucide-globe',
    slot: 'password'
  }
]
const serverValue = ref('0');
const serverInfo = computed(() => {
  if (serverValue.value === '1') {
    return {
      loginUrl: "https://user.gryphline.com/",
      tokenUrl: "https://web-api.gryphline.com/cookie_store/account_token"
    }
  } else {
    return {
      loginUrl: "https://user.hypergryph.com/",
      tokenUrl: "https://web-api.hypergryph.com/account/info/hg"
    }
  }
})

const emit = defineEmits(['success']);
const isOpen = ref(false);
const isLoggingIn = ref(false);
const isProcessing = ref(false);
const toast = useToast()
const token = ref('')
const user_agent = ref('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.112 Safari/537.36')
const loginProvider = computed<LoginProvider>(() => (serverValue.value === '1' ? 'gryphline' : 'hypergryph'));

const open = async (url: string) => {
  try {
    await openUrl(url);
  } catch (error) {
    console.error(error);
  }
};

const handleWebLogin = async () => {
  if (isLoggingIn.value) return;

  isLoggingIn.value = true;
  token.value = '';

  try {
    const gotToken = await openLoginWindow(loginProvider.value);

    if (gotToken) {
      console.log("获取到 Token，开始换取 UID...");
      token.value = gotToken;
      await processSave(gotToken);
    } else {
      console.log("用户取消了登录");
    }
  } catch (error) {
    console.warn("发生错误", error);
    toast.add({ title: "错误", description: "无法打开登录窗口" });
  } finally {
    isLoggingIn.value = false;
  }
};

const handleManualAdd = async () => {
  if (!token.value) return;
  await processSave(token.value);
};

const processSave = async (loginToken: string) => {
  isProcessing.value = true;
  try {
    const oauthToken = await getOAuthToken(loginToken);

    if (!oauthToken) {
      toast.add({ title: "授权失败", description: "无法换取 OAuth Token，请重试" });
      return;
    }

    const uid = await fetchUidByToken(oauthToken);

    if (!uid) {
      toast.add({ title: "识别失败", description: "无法获取 UID，Token 可能已失效" });
      return;
    }

    const success = await addUser({ uid, token: loginToken });

    if (success) {
      toast.add({ title: "添加成功", description: `账号 ${uid} 已添加` });
      currentUid.value = uid;
      isOpen.value = false;
      token.value = '';
      emit('success');
    } else {
      toast.add({ title: "保存失败", description: "写入配置文件出错" });
    }

  } catch (e) {
    console.error(e);
    toast.add({ title: "错误", description: "网络请求异常" });
  } finally {
    isProcessing.value = false;
  }
};

const getOAuthToken = async (loginToken: string): Promise<string | null> => {
  const url = `https://as.${loginProvider.value}.com/user/oauth2/v2/grant`;

  const appCode = loginProvider.value === 'gryphline' ? '3dacefa138426cfe' : 'be36d44aa36bfb5b'

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': user_agent.value
      },
      body: JSON.stringify({
        token: loginToken,
        appCode: appCode,
        type: 1
      })
    });

    if (!response.ok) {
      console.error("Grant API error:", response.status);
      return null;
    }

    const res = await response.json();
    if (res.status === 0 && res.data && res.data.token) {
      console.log("换取 OAuth Token 成功");
      return res.data.token;
    } else {
      console.error("Grant API 返回错误:", res);
      return null;
    }
  } catch (e) {
    console.error("Grant API Exception:", e);
    return null;
  }
};

const fetchUidByToken = async (oauthToken: string): Promise<string | null> => {
  const apiBaseUrl = `https://binding-api-account-prod.${loginProvider.value}.com/account/binding/v1/binding_list`;
  const query = new URLSearchParams({
    token: oauthToken,
    appCode: "endfield",
  });

  try {
    const response = await fetch(`${apiBaseUrl}?${query.toString()}`, {
      method: 'GET',
      headers: {
        'User-Agent': user_agent.value
      },
    });

    if (!response.ok) return null;

    const data = await response.json();

    if (data.status !== 0) {
      console.error("获取 UID 失败:", data);
      return null;
    }

    return data?.data?.list?.[0]?.bindingList?.[0]?.uid || null;
  } catch (e) {
    console.error("Fetch UID Error", e);
    return null;
  }
};
</script>
