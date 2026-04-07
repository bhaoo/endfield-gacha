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
          <UIcon name="i-lucide-sliders-horizontal" class="text-gray-500" />
          <span class="font-semibold">相关配置</span>
        </div>
      </template>

      <div class="flex items-center justify-between gap-4">
        <span class="text-sm">主题模式</span>
        <ColorMode />
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-cloud" class="text-gray-500" />
          <span class="font-semibold">WebDAV 同步</span>
        </div>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-300">
          WebDAV 同步适用于跨设备同步，同步内容不包含账号凭证（Token）信息。
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="space-y-1">
            <p class="text-xs text-gray-500">URL</p>
            <UInput v-model="webdavConfig.baseUrl" placeholder="https://example.com" class="w-full" />
          </div>

          <div class="space-y-1">
            <p class="text-xs text-gray-500">目录</p>
            <UInput v-model="webdavConfig.basePath" placeholder="/endfield-gacha" class="w-full" />
          </div>

          <div class="space-y-1">
            <p class="text-xs text-gray-500">用户名</p>
            <UInput v-model="webdavConfig.username" placeholder="user" class="w-full" />
          </div>

          <div class="space-y-1">
            <p class="text-xs text-gray-500">密码</p>
            <UInput v-model="webdavConfig.password" type="password" placeholder="password" class="w-full" />
          </div>
        </div>

        <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <div class="flex items-center justify-between gap-4 p-3">
            <div class="min-w-0">
              <p class="text-sm font-medium">自动同步</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                开启后，新增账号信息或同步新的抽卡记录后，会自动同步有变化的账号到 WebDAV。
              </p>
            </div>

            <label class="inline-flex items-center gap-2 text-sm select-none">
              <USwitch v-model="webdavConfig.autoSync" />
            </label>
          </div>

          <div
            class="flex items-center justify-between gap-4 p-3 transition-opacity"
            :class="{ 'opacity-60': !webdavConfig.autoSync }"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium">静默模式</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                仅影响自动同步。开启后在后台完成，不弹出结果提示；关闭后会显示自动同步结果。
              </p>
            </div>

            <label class="inline-flex items-center gap-2 text-sm select-none">
              <USwitch v-model="webdavConfig.silentAutoSync" :disabled="!webdavConfig.autoSync" />
            </label>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-save"
            color="neutral"
            variant="outline"
            :loading="isSavingWebDav"
            @click="onSaveWebDavConfig"
          >
            保存配置
          </UButton>

          <UButton
            icon="i-lucide-plug-zap"
            color="neutral"
            variant="outline"
            :loading="isTestingWebDav"
            @click="onTestWebDav"
          >
            连接测试
          </UButton>

          <UButton
            icon="i-lucide-refresh-cw"
            color="primary"
            :loading="isSyncingAllWebDav"
            :disabled="!hasSyncableAccounts || isSyncingAllWebDav"
            @click="onSyncAllWebDav"
          >
            立即同步全部账号
          </UButton>

          <UButton
            icon="i-lucide-cloud-download"
            color="neutral"
            variant="outline"
            :loading="isOpeningRestore"
            @click="onOpenRestoreModal"
          >
            从 WebDAV 恢复
          </UButton>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-file-spreadsheet" class="text-gray-500" />
          <span class="font-semibold">数据导出</span>
        </div>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-300">
          <template v-if="canExport">
            将导出当前账号
            <span class="font-semibold text-gray-900 dark:text-white">{{ exportUserLabel }}</span>
            的角色记录与武器记录到系统下载目录，时间统一使用 24 小时制。
          </template>
          <template v-else>
            请先返回首页选择一个账号，再执行导出。
          </template>
        </p>

        <div class="flex items-center justify-between gap-4 flex-wrap">
          <span class="text-xs text-gray-500 dark:text-gray-400">
            导出字段：时间、名称、星级、卡池名、卡池 ID、是否 NEW、是否为加急招募、seqId
          </span>

          <UButton icon="i-lucide-download" color="primary" :loading="isExporting" :disabled="!canExport || isExporting"
            @click="onExportExcel">
            导出 Excel
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
            本项目不会采集任何个人隐私。默认情况下，数据仅保存在本地 <code class="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">userData/</code>；只有在你主动配置 WebDAV 后，数据才会同步到你指定的 WebDav 服务端。
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

    <UModal v-model:open="isRestoreModalOpen" title="从 WebDAV 恢复">
      <template #body>
        <div class="space-y-3">
          <p class="text-sm text-gray-600 dark:text-gray-300">
            选择一个或多个远端账号恢复到本地。
          </p>

          <div
            v-if="remoteAccounts.length > 0"
            class="max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800 divide-y divide-gray-200 dark:divide-gray-800"
          >
            <div
              v-for="account in remoteAccounts"
              :key="account.key"
              class="p-3 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <UCheckbox
                :model-value="selectedRestoreKeys.includes(account.key)"
                :ui="{
                  root: 'w-full',
                  wrapper: 'min-w-0',
                  label: 'text-sm font-medium break-all',
                  description: 'text-xs text-gray-500 dark:text-gray-400 break-all',
                }"
                @update:model-value="(checked) => toggleRestoreKey(account.key, Boolean(checked))"
              >
                <template #label>
                  {{ formatRestoreAccountLabel(account) }}
                </template>

                <template #description>
                  {{ account.provider === "gryphline" ? "国际服" : "官服" }} · UID {{ account.uid }} · {{
                    formatDateTime(account.updatedAt)
                  }}
                </template>
              </UCheckbox>
            </div>
          </div>

          <UAlert
            v-else
            color="neutral"
            variant="subtle"
            icon="i-lucide-folder-search"
            title="未发现可恢复账号"
            description="请确认远端目录中已有同步数据，或先执行一次“立即同步全部账号”。"
          />
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="isRestoringWebDav"
            @click="isRestoreModalOpen = false"
          >
            取消
          </UButton>

          <UButton
            color="primary"
            :loading="isRestoringWebDav"
            :disabled="selectedRestoreKeys.length === 0 || isRestoringWebDav"
            @click="onRestoreSelectedAccounts"
          >
            恢复选中账号
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
import { getName, getVersion } from "@tauri-apps/api/app";
import type { WebDavRestoreAccount } from "~/types/gacha";
import pkg from "../../package.json";

const appName = ref("Endfield Gacha");
const appVersion = ref<string>((pkg as any)?.version || "0.0.0");
const toast = useToast();
const { updateState, latestVersion, latestReleaseUrl, updateError, checkForUpdate, updateAvailable } = useUpdate();
const { setUpdateSeenVersion, webdavConfig } = useUserStore();
const { canExport, currentUserLabel: exportUserLabel, isExporting, exportCurrentUserExcel } = useExcelExport();
const { normalizeConfig, persistConfig, testConnection, syncAllAccounts, listRestoreAccounts, restoreAccounts, getSyncableAccountKeys, isBatchSyncing } = useWebDav();

const isSavingWebDav = ref(false);
const isTestingWebDav = ref(false);
const isOpeningRestore = ref(false);
const isRestoreModalOpen = ref(false);
const isRestoringWebDav = ref(false);
const remoteAccounts = ref<WebDavRestoreAccount[]>([]);
const selectedRestoreKeys = ref<string[]>([]);

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

const onExportExcel = async () => {
  try {
    const result = await exportCurrentUserExcel();
    toast.add({
      title: "导出成功",
      description: `${result.fileName} 已保存到下载目录。角色 ${result.charCount} 条，武器 ${result.weaponCount} 条。`,
      color: "success",
    });
  } catch (error: any) {
    toast.add({
      title: "导出失败",
      description: error?.message || "导出 Excel 失败",
      color: "error",
    });
  }
};

const syncableAccountCount = computed(() => getSyncableAccountKeys().length);
const hasSyncableAccounts = computed(() => syncableAccountCount.value > 0);
const isSyncingAllWebDav = computed(() => isBatchSyncing.value);

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string") {
    const message = error.trim();
    return message || fallback;
  }

  if (error instanceof Error) {
    const message = String(error.message || "").trim();
    return message || fallback;
  }

  if (error && typeof error === "object") {
    const message = Reflect.get(error, "message");
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }

    const cause = Reflect.get(error, "cause");
    if (typeof cause === "string" && cause.trim()) {
      return cause.trim();
    }

    const detail = Reflect.get(error, "error");
    if (typeof detail === "string" && detail.trim()) {
      return detail.trim();
    }
  }

  return fallback;
};

const formatDateTime = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "暂无记录";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("zh-CN", { hour12: false });
};

const onSaveWebDavConfig = async () => {
  isSavingWebDav.value = true;
  try {
    normalizeConfig();
    await persistConfig();
    toast.add({
      title: "WebDAV 配置已保存",
      description: "后续连接测试、同步和恢复都会使用当前配置~",
      color: "success",
    });
  } catch (error: any) {
    toast.add({
      title: "保存失败",
      description: getErrorMessage(error, "保存 WebDAV 配置失败"),
      color: "error",
    });
  } finally {
    isSavingWebDav.value = false;
  }
};

const onTestWebDav = async () => {
  isTestingWebDav.value = true;
  try {
    await testConnection();
  } catch (error: any) {
    toast.add({
      title: "连接测试失败",
      description: getErrorMessage(error, "WebDAV 连接测试失败"),
      color: "error",
    });
  } finally {
    isTestingWebDav.value = false;
  }
};

const onSyncAllWebDav = async () => {
  if (!hasSyncableAccounts.value) {
    toast.add({
      title: "无法同步",
      description: "当前没有可同步的账号",
      color: "warning",
    });
    return;
  }

  try {
    await syncAllAccounts();
  } catch {
  }
};

const formatRestoreAccountLabel = (account: WebDavRestoreAccount) => {
  const roleName = String(account.roleId?.nickName || "").trim();
  const roleId = String(account.roleId?.roleId || "").trim();
  if (roleName && roleId) return `${roleName}(${roleId})`;
  return account.key;
};

const toggleRestoreKey = (key: string, checked?: boolean) => {
  const nextChecked = typeof checked === "boolean"
    ? checked
    : !selectedRestoreKeys.value.includes(key);

  if (!nextChecked) {
    selectedRestoreKeys.value = selectedRestoreKeys.value.filter((item) => item !== key);
    return;
  }
  selectedRestoreKeys.value = [...selectedRestoreKeys.value, key];
};

const onOpenRestoreModal = async () => {
  isOpeningRestore.value = true;
  try {
    const accounts = await listRestoreAccounts();
    remoteAccounts.value = [...accounts].sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    );
    selectedRestoreKeys.value = [];
    isRestoreModalOpen.value = true;
  } catch (error: any) {
    toast.add({
      title: "读取远端账号失败",
      description: getErrorMessage(error, "无法读取 WebDAV 远端账号列表"),
      color: "error",
    });
  } finally {
    isOpeningRestore.value = false;
  }
};

const onRestoreSelectedAccounts = async () => {
  isRestoringWebDav.value = true;
  try {
    await restoreAccounts(selectedRestoreKeys.value);
    isRestoreModalOpen.value = false;
    selectedRestoreKeys.value = [];
  } catch (error: any) {
    toast.add({
      title: "恢复失败",
      description: getErrorMessage(error, "从 WebDAV 恢复账号失败"),
      color: "error",
    });
  } finally {
    isRestoringWebDav.value = false;
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
