import { invoke } from "@tauri-apps/api/core";
import type { AppConfig } from "~/types/gacha";
import type { GachaAuth } from "~/composables/gacha";
import {
  isSystemUid,
  systemUidLabel,
  SYSTEM_UID_AUTO,
  SYSTEM_UID_BILIBILI,
  SYSTEM_UID_CN,
  SYSTEM_UID_GLOBAL,
  SYSTEM_UID_OFFICIAL,
} from "~/utils/systemAccount";

export const useGachaSync = () => {
  const toast = useToast();
  const isSyncing = ref(false);
  const { isWindows, detect: detectPlatform } = usePlatform();
  const { addUser } = useUserStore();

  type SyncProgress = {
    type: "char" | "weapon" | null;
    poolName: string;
    page: number;
  };

  const syncProgress = useState<SyncProgress>("gacha-sync-progress", () => ({
    type: null,
    poolName: "",
    page: 0,
  }));

  const user_agent = ref(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.112 Safari/537.36",
  );

  const currentUid = useState<string>("current-uid", () => "none");

  const showToast = (title: string, desc: string) => {
    toast.add({
      title: title,
      description: desc,
    });
  };

  const { poolInfoById, loadPoolInfo, ensurePoolInfoForPoolIds } =
    useGachaPoolInfo({ userAgent: user_agent });

  const { charRecords, weaponRecords, loadUserData, saveUserData } =
    useGachaRecords({ loadPoolInfo });

  const {
    getAuthToken,
    getSystemAuthFromLog,
    findConfigUserByKey,
    initUserRecord,
    upsertLogUser,
    systemRegionLabel,
  } = useGachaAuth({
    userAgent: user_agent,
    isWindows,
    detectPlatform,
    loadPoolInfo,
    addUser,
  });

  const { syncCharacters, syncWeapons } = createGachaApi({
    userAgent: user_agent,
    syncProgress,
    ensurePoolInfoForPoolIds,
    saveUserData,
  });

  const { charStatistics, weaponStatistics } = useGachaStatistics({
    charRecords,
    weaponRecords,
    poolInfoById,
  });

  const handleSync = async (uid: string, type: "char" | "weapon" = "char") => {
    if (isSyncing.value) return;
    if (!uid || uid === "none") {
      showToast("同步失败", "请先选择一个账号");
      return;
    }

    await detectPlatform();
    await loadPoolInfo();
    if (isSystemUid(uid) && !isWindows.value) {
      showToast(
        "同步失败",
        "system 账号仅支持 Windows。请通过“添加账号”方式登录后同步。",
      );
      return;
    }

    // 日志识别账号不支持直接同步（无 token）
    if (!isSystemUid(uid)) {
      const config = await invoke<AppConfig>("read_config");
      const existing = findConfigUserByKey(config, uid);
      if (existing && (!existing.token || existing.source === "log")) {
        showToast(
          "无法同步",
          "该账号来自日志识别，请选择 system(国服) 或 system(国际服) 进行日志同步，或使用“添加账号”登录后再同步。",
        );
        return;
      }
    }

    isSyncing.value = true;
    syncProgress.value = { type, poolName: "", page: 0 };
    showToast(
      "同步开始",
      `正在获取${type === "char" ? "干员" : "武器"}数据...`,
    );

    try {
      let effectiveUid = uid;
      let auth: GachaAuth | null = null;

      if (isSystemUid(uid)) {
        const systemAuth = await getSystemAuthFromLog(uid);
        const config = await invoke<AppConfig>("read_config");
        const existing = findConfigUserByKey(
          config,
          systemAuth.detectedUserKey,
        );
        if (!existing) {
          await upsertLogUser(systemAuth);
        } else {
          await initUserRecord(systemAuth.detectedUserKey);
        }

        effectiveUid = systemAuth.detectedUserKey;
        currentUid.value = effectiveUid;

        const isMainSystemUid =
          uid === SYSTEM_UID_CN || uid === SYSTEM_UID_GLOBAL;
        const isLegacySystemUid =
          uid === SYSTEM_UID_AUTO ||
          uid === SYSTEM_UID_OFFICIAL ||
          uid === SYSTEM_UID_BILIBILI;

        const regionLabel = systemRegionLabel(systemAuth);

        if (isMainSystemUid) {
          const extra =
            systemAuth.provider === "hypergryph"
              ? systemAuth.channelLabel
              : systemAuth.serverName || "Global";
          showToast(
            "已识别日志",
            `已切换为 [${extra}] ${systemAuth.roleName || systemAuth.detectedRoleId}(${systemAuth.detectedRoleId})`,
          );
        } else if (isLegacySystemUid) {
          showToast(
            "system 入口已调整",
            `当前选择的是 ${systemUidLabel(uid)}，本次将按 ${regionLabel} 方式同步`,
          );
        }

        auth = systemAuth;
      } else {
        auth = await getAuthToken(uid);
      }
      if (!auth) throw new Error("Token 获取失败，请重新登录");

      let count = 0;
      if (type === "char") {
        count = await syncCharacters(
          effectiveUid,
          auth.u8Token,
          auth.provider,
          auth.serverId,
        );
      } else {
        count = await syncWeapons(
          effectiveUid,
          auth.u8Token,
          auth.provider,
          auth.serverId,
        );
      }

      await loadUserData(effectiveUid, type);

      if (count > 0) showToast("同步成功", `新增 ${count} 条寻访记录！`);
      else showToast("同步成功", "已经是最新的啦！如果是刚抽的话可能有延迟哦~");
    } catch (err: any) {
      showToast("同步失败", err.message || "未知错误");
      console.error(err);
    } finally {
      isSyncing.value = false;
      syncProgress.value = { type: null, poolName: "", page: 0 };
    }
  };

  return {
    charRecords,
    weaponRecords,
    charStatistics,
    weaponStatistics,
    isSyncing,
    syncProgress,
    handleSync,
    loadCharData: (uid: string) => loadUserData(uid, "char"),
    loadWeaponData: (uid: string) => loadUserData(uid, "weapon"),
  };
};
