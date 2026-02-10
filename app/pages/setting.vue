<template>
  <div class="space-y-4">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-package" class="text-gray-500" />
            <span class="font-semibold">软件相关</span>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-sm text-gray-500">当前版本</p>
            <p class="font-semibold truncate">{{ appVersion }}</p>
          </div>
          <div class="text-right">
            <div class="flex gap-2 flex-wrap">
              <UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline"
                :loading="updateState === 'checking'" @click="onCheckUpdate">
                检查更新
              </UButton>

              <UButton v-if="latestReleaseUrl" icon="i-lucide-external-link" color="neutral" variant="outline"
                @click="open(latestReleaseUrl)">
                打开发行页
              </UButton>
            </div>
          </div>
        </div>

        <UAlert v-if="updateState !== 'idle'" :color="updateAlertColor" variant="subtle" :icon="updateAlertIcon"
          :title="updateAlertTitle" :description="updateAlertDesc" />

        <div class="flex flex-wrap gap-2">
          <UButton icon="i-lucide-github" color="neutral" variant="outline"
            @click="open('https://github.com/bhaoo/endfield-gacha')">
            GitHub
          </UButton>
          <UButton icon="i-lucide-tag" color="neutral" variant="outline"
            @click="open('https://github.com/bhaoo/endfield-gacha/releases')">
            Releases
          </UButton>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-info" class="text-gray-500" />
          <span class="font-semibold">更多信息</span>
        </div>
      </template>

      <div class="space-y-4">
        <UAlert color="neutral" variant="subtle" icon="i-lucide-star" title="喜欢的话，给个 Star？"
          description="本工具为开源软件，源代码使用 MIT 协议授权。" />

        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <p>
            项目地址：
            <ULink class="text-primary" @click="open('https://github.com/bhaoo/endfield-gacha')">
              https://github.com/bhaoo/endfield-gacha
            </ULink>
          </p>
          <p>
            本项目不会采集或上传任何个人隐私，数据仅保存在本地 <code class="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">userData/</code>（不同系统路径不同，详见 README），不会上传到任何第三方服务，涉及的游戏数据均由用户自行选择导入/导出。
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton icon="i-lucide-scale" color="neutral" variant="outline"
            @click="open('https://github.com/bhaoo/endfield-gacha/blob/master/LICENSE')">
            查看开源协议
          </UButton>
          <UButton icon="i-lucide-bug" color="neutral" variant="outline"
            @click="open('https://github.com/bhaoo/endfield-gacha/issues')">
            反馈问题 / 建议
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
import { getName, getVersion } from "@tauri-apps/api/app";
import pkg from "../../package.json";

const appName = ref("Endfield Gacha");
const appVersion = ref<string>((pkg as any)?.version || "0.0.0");
const toast = useToast();
const { updateState, latestVersion, latestReleaseUrl, updateError, checkForUpdate, updateAvailable } = useUpdate();
const { setUpdateSeenVersion } = useUserStore();

onMounted(async () => {
  try {
    const [name, version] = await Promise.all([getName(), getVersion()]);
    if (name) appName.value = name;
    if (version) appVersion.value = version;
  } catch {
  }

  // 进入设置页视为已读
  checkForUpdate().catch(console.error);
});

watch(
  [updateAvailable, latestVersion],
  ([available, v]) => {
    if (available && v) setUpdateSeenVersion(v);
  },
  { immediate: true },
);

const open = async (url: string) => {
  try {
    await openUrl(url);
  } catch (error) {
    console.error(error);
  }
};

const onCheckUpdate = async () => {
  await checkForUpdate({ force: true });
  if (updateState.value === "available") {
    toast.add({ title: "发现新版本", description: `最新版本 ${latestVersion.value}` });
  } else if (updateState.value === "uptodate") {
    toast.add({ title: "已经是最新版本", description: `当前版本 ${appVersion.value}` });
  }
};

const updateAlertColor = computed(() => {
  if (updateState.value === "available") return "primary";
  if (updateState.value === "uptodate") return "success";
  if (updateState.value === "error") return "error";
  return "neutral";
});
const updateAlertIcon = computed(() => {
  if (updateState.value === "available") return "i-lucide-external-link";
  if (updateState.value === "uptodate") return "i-lucide-badge-check";
  if (updateState.value === "error") return "i-lucide-triangle-alert";
  return "i-lucide-info";
});
const updateAlertTitle = computed(() => {
  if (updateState.value === "available") return "发现新版本";
  if (updateState.value === "uptodate") return "已经是最新版本";
  if (updateState.value === "error") return "检查更新失败";
  return "";
});
const updateAlertDesc = computed(() => {
  if (updateState.value === "available") {
    return `当前版本 ${appVersion.value}，最新版本 ${latestVersion.value}。请点击“打开发行页”前往发行页下载并安装。`;
  }
  if (updateState.value === "uptodate") {
    return `当前版本 ${appVersion.value} 已是最新。`;
  }
  if (updateState.value === "error") {
    return updateError.value;
  }
  return "";
});
</script>
