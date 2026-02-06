import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { readTextFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import type {
  AppConfig,
  EndFieldCharInfo,
  EndFieldWeaponInfo,
  GachaItem,
  User,
  UserRole,
} from "~/types/gacha";
import {
  analyzePoolData,
  analyzeWeaponPoolData,
  delay,
  POOL_TYPES,
  POOL_NAME_MAP,
  parseGachaParams,
} from "~/utils/gachaCalc";
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

  const getGachaUri = async (provider: "hypergryph" | "gryphline") => {
    await detectPlatform();
    if (!isWindows.value) return "";

    const logPath =
      provider === "gryphline"
        ? "AppData/LocalLow/Gryphline/Endfield/sdklogs/HGWebview.log"
        : "AppData/LocalLow/Hypergryph/Endfield/sdklogs/HGWebview.log";
    const targetPrefix = `https://ef-webview.${provider}.com/page/gacha_`;
    try {
      const content = await readTextFile(logPath, {
        baseDir: BaseDirectory.Home,
      });
      const lines = content.split(/\r?\n/).reverse();
      const matchLine = lines.find((line) => line.includes(targetPrefix));

      if (matchLine) {
        const urlRegex = new RegExp(
          `(https:\\/\\/ef-webview\\.${provider}\\.com\\/page\\/gacha_[^\\s]*)`,
        );
        const result = matchLine.match(urlRegex);
        console.log(result?.[1])
        return result?.[1] || "";
      }
      return "";
    } catch (err) {
      console.error(`[日志读取失败] provider=${provider}`, err);
      return "";
    }
  };

  type GachaAuth = {
    u8Token: string;
    provider: "hypergryph" | "gryphline";
    serverId: string;
  };

  type SystemGachaAuth = GachaAuth & {
    detectedUid: string;
    detectedRoleId: string;
    detectedUserKey: string;
    channelLabel: string;
    roleName: string;
    serverName: string;
  };

  const inferChannelLabel = (params: {
    channel?: string;
    subChannel?: string;
  }): "官服" | "B服" | "未知渠道" => {
    const channel = String(params.channel ?? "");
    const subChannel = String(params.subChannel ?? "");
    if (channel === "1" && subChannel === "1") return "官服";
    if (channel === "2" && subChannel === "2") return "B服";
    return "未知渠道";
  };

  const queryUidRoleFromU8Token = async (
    provider: "hypergryph" | "gryphline",
    u8Token: string,
    serverId: string,
  ): Promise<{
    uid: string;
    roleId: string;
    roleName: string;
    serverName: string;
  }> => {
    const res = await fetch(
      `https://u8.${provider}.com/game/role/v1/query_role_list`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          "User-Agent": user_agent.value,
        },
        body: JSON.stringify({ token: u8Token, serverId }),
      },
    );

    if (!res.ok) {
      throw new Error(`query_role_list 请求失败: ${res.status}`);
    }

    const json = await res.json();
    if (json?.status !== 0) {
      throw new Error(`query_role_list 返回异常: ${json?.msg || "unknown"}`);
    }

    const uid = String(json?.data?.uid ?? "").trim();
    const roles = Array.isArray(json?.data?.roles) ? json.data.roles : [];
    const role =
      roles.find((r: any) => String(r?.serverId ?? "") === String(serverId)) ??
      roles[0];
    const roleId = String(role?.roleId ?? "").trim();
    const roleName = String(role?.nickname ?? role?.nickName ?? "").trim();
    const serverName = String(role?.serverName ?? "").trim();

    if (!uid) throw new Error("query_role_list 解析失败: 未找到 uid");
    if (!roleId) throw new Error("query_role_list 解析失败: 未找到 roleId");

    return { uid, roleId, roleName, serverName };
  };

  const getSystemAuthFromLog = async (
    systemUid: string,
  ): Promise<SystemGachaAuth> => {
    // system(自动识别) 仅用于兼容旧版本：优先尝试国服日志，找不到再尝试国际服日志。
    let provider: "hypergryph" | "gryphline" =
      systemUid === SYSTEM_UID_GLOBAL ? "gryphline" : "hypergryph";

    let uri = "";
    if (systemUid === SYSTEM_UID_AUTO) {
      uri =
        (await getGachaUri("hypergryph")) || (await getGachaUri("gryphline"));
      provider = uri.includes("ef-webview.gryphline.com")
        ? "gryphline"
        : "hypergryph";
    } else {
      uri = await getGachaUri(provider);
    }
    if (!uri) {
      throw new Error(
        "未在日志中找到抽卡链接哦~请先在游戏内打开一次抽卡记录页面，再进行同步~",
      );
    }

    const params = parseGachaParams(uri);
    if (!params?.u8_token) {
      throw new Error("抽卡链接参数解析失败：未找到 u8_token");
    }

    const pickServerId = () => {
      const candidates = [
        (params as any)?.server_id,
        (params as any)?.serverId,
        (params as any)?.serverid,
        (params as any)?.server,
      ];
      return String(
        candidates.find((x) => x != null && String(x).trim() !== "") ?? "",
      ).trim();
    };

    const serverId = provider === "gryphline" ? pickServerId() : "1";
    if (provider === "gryphline" && !serverId) {
      throw new Error("抽卡链接参数解析失败：未找到 serverId（国际服需要）");
    }

    const { uid, roleId, roleName, serverName } = await queryUidRoleFromU8Token(
      provider,
      params.u8_token,
      serverId,
    );

    const channelLabel =
      provider === "hypergryph"
        ? inferChannelLabel({
            channel: params.channel,
            subChannel: params.subChannel,
          })
        : "国际服";

    return {
      u8Token: params.u8_token,
      provider,
      serverId,
      detectedUid: uid,
      detectedRoleId: roleId,
      detectedUserKey: `${uid}_${roleId}`,
      channelLabel,
      roleName,
      serverName: serverName || (provider === "gryphline" ? "Global" : "China"),
    };
  };

  const getUserKey = (u: any) =>
    u?.key || (u?.roleId?.roleId ? `${u.uid}_${u.roleId.roleId}` : u?.uid);

  const showToast = (title: string, desc: string) => {
    toast.add({
      title: title,
      description: desc,
    });
  };

  const findConfigUserByKey = (config: any, userKey: string): User | null => {
    const users = Array.isArray(config?.users) ? (config.users as User[]) : [];
    const u = users.find((x: any) => getUserKey(x) === userKey) as
      | User
      | undefined;
    return u || null;
  };

  const upsertLogUser = async (auth: SystemGachaAuth): Promise<void> => {
    const key = auth.detectedUserKey;

    await invoke("init_user_record", { uid: key });

    const role: UserRole = {
      serverId: auth.serverId,
      serverName:
        auth.serverName || (auth.provider === "gryphline" ? "Global" : "China"),
      nickName: auth.roleName || auth.detectedRoleId,
      roleId: auth.detectedRoleId,
    };

    const u: User = {
      key,
      uid: auth.detectedUid,
      token: "",
      provider: auth.provider,
      roleId: role,
      source: "log",
    };

    await addUser(u);
  };

  const charRecords = useState<Record<string, EndFieldCharInfo[]>>(
    "gacha-records-char",
    () => ({}),
  );
  const weaponRecords = useState<Record<string, EndFieldWeaponInfo[]>>(
    "gacha-records-weapon",
    () => ({}),
  );

  const loadUserData = async (uid: string, type: "char" | "weapon") => {
    const command =
      type === "char" ? "read_char_records" : "read_weapon_records";
    try {
      const data = await invoke<any>(command, { uid });
      if (type === "char") charRecords.value = data || {};
      else weaponRecords.value = data || {};
    } catch (e) {
      console.error(e);
    }
  };

  const mergeRecords = <T extends GachaItem>(
    oldRecords: T[],
    newRecords: T[],
  ): T[] => {
    const existingIds = new Set(oldRecords.map((r) => r.seqId));
    const uniqueNewRecords = newRecords.filter(
      (r) => !existingIds.has(r.seqId),
    );
    if (uniqueNewRecords.length === 0) {
      return oldRecords;
    }
    const merged = [...oldRecords, ...uniqueNewRecords];

    return merged.sort((a, b) => {
      if (a.seqId.length === b.seqId.length) {
        return b.seqId.localeCompare(a.seqId);
      }
      return Number(b.seqId) - Number(a.seqId);
    });
  };

  const saveUserData = async (
    uid: string,
    newData: any,
    type: "char" | "weapon",
  ) => {
    const commandRead =
      type === "char" ? "read_char_records" : "read_weapon_records";
    const commandSave =
      type === "char" ? "save_char_records" : "save_weapon_records";

    const oldAllData = (await invoke<any>(commandRead, { uid })) || {};
    let totalNew = 0;

    for (const [poolKey, list] of Object.entries(newData)) {
      const oldList = oldAllData[poolKey] || [];
      const merged = mergeRecords(oldList as GachaItem[], list as GachaItem[]);
      totalNew += merged.length - oldList.length;
      oldAllData[poolKey] = merged;
    }

    if (totalNew > 0) {
      await invoke(commandSave, { uid, data: oldAllData });
    }
    return totalNew;
  };

  const fetchPaginatedData = async <T extends GachaItem>(
    u8_token: string,
    baseUrl: string,
    serverId: string,
    extraParams: Record<string, string>,
    progress?: { type: "char" | "weapon"; poolName: string },
    lang: string = "zh-cn",
  ): Promise<T[]> => {
    const allData: T[] = [];
    let nextSeqId = "";
    let hasMore = true;
    let page = 0;

    try {
      while (hasMore) {
        page++;
        if (progress) {
          syncProgress.value = {
            type: progress.type,
            poolName: progress.poolName,
            page,
          };
        }

        const query = new URLSearchParams({
          lang,
          token: u8_token,
          server_id: serverId,
          ...extraParams,
        });
        if (nextSeqId) query.set("seq_id", nextSeqId);

        const response = await fetch(`${baseUrl}?${query.toString()}`, {
          method: "GET",
          headers: { "User-Agent": user_agent.value },
        });

        if (!response.ok) throw new Error("Network response was not ok");
        const res = await response.json();

        if (res.code !== 0 || !res.data?.list) break;

        const list = res.data.list as T[];
        if (list.length === 0) break;

        allData.push(...list);
        hasMore = res.data.hasMore;
        nextSeqId = list[list.length - 1]!.seqId;

        if (hasMore) await delay(500, 1000);
      }
    } catch (error) {
      console.error(`Fetch error for ${JSON.stringify(extraParams)}:`, error);
    }
    return allData;
  };

  const getEfServerId = (
    provider: "hypergryph" | "gryphline",
    role?: { serverId: string; serverName: string } | null,
  ) => {
    if (provider === "hypergryph") return "1";

    const rawId = String(role?.serverId ?? "").trim();
    // const rawName = String(role?.serverName ?? "").toLowerCase();

    if (provider === "gryphline") return rawId;

    return "1";
  };

  const getAuthToken = async (userKey: string): Promise<GachaAuth | null> => {
    try {
      const config = await invoke<AppConfig>("read_config");
      const targetUser = config.users?.find((u) => getUserKey(u) === userKey);
      if (!targetUser?.token) return null;

      const provider = targetUser.provider || "hypergryph";
      const serverId = getEfServerId(provider, targetUser.roleId || null);
      const uid = targetUser.uid;

      const authRes = await fetch(
        `https://as.${provider}.com/user/oauth2/v2/grant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": user_agent.value,
          },
          body: JSON.stringify({
            type: 1,
            appCode:
              provider === "gryphline"
                ? "3dacefa138426cfe"
                : "be36d44aa36bfb5b",
            token: targetUser.token,
          }),
        },
      );
      if (!authRes.ok) return null;
      const authData = await authRes.json();

      const u8Res = await fetch(
        `https://binding-api-account-prod.${provider}.com/account/binding/v1/u8_token_by_uid`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": user_agent.value,
          },
          body: JSON.stringify({ uid, token: authData.data.token }),
        },
      );
      if (!u8Res.ok) return null;
      const u8Data = await u8Res.json();
      if (!u8Data?.data?.token) return null;
      return { u8Token: u8Data.data.token as string, provider, serverId };
    } catch (e) {
      console.error("Auth error", e);
      return null;
    }
  };

  const syncCharacters = async (
    uid: string,
    u8_token: string,
    provider: "hypergryph" | "gryphline",
    serverId: string,
  ) => {
    // const lang = provider === "gryphline" ? "en-us" : "zh-cn";
    const lang = "zh-cn";
    const fetched: Record<string, EndFieldCharInfo[]> = {};
    for (const poolType of POOL_TYPES) {
      const poolName = POOL_NAME_MAP[poolType] || poolType;
      fetched[poolType] = await fetchPaginatedData<EndFieldCharInfo>(
        u8_token,
        `https://ef-webview.${provider}.com/api/record/char`,
        serverId,
        { pool_type: poolType },
        { type: "char", poolName },
        lang,
      );
    }
    return await saveUserData(uid, fetched, "char");
  };

  const syncWeapons = async (
    uid: string,
    u8_token: string,
    provider: "hypergryph" | "gryphline",
    serverId: string,
  ) => {
    // const lang = provider === "gryphline" ? "en-us" : "zh-cn";
    const lang = "zh-cn";
    syncProgress.value = {
      type: "weapon",
      poolName: "获取武器池列表",
      page: 1,
    };
    const query = new URLSearchParams({
      lang,
      token: u8_token,
      server_id: serverId,
    });
    const poolRes = await fetch(
      `https://ef-webview.${provider}.com/api/record/weapon/pool?${query.toString()}`,
      {
        headers: { "User-Agent": user_agent.value },
      },
    );
    const poolJson = await poolRes.json();
    if (poolJson.code !== 0 || !poolJson.data) {
      throw new Error(`获取武器池列表失败: ${poolJson.msg}`);
    }

    const pools = poolJson.data as { poolId: string; poolName: string }[];
    const fetched: Record<string, EndFieldWeaponInfo[]> = {};

    for (const pool of pools) {
      console.log(`正在同步武器池: ${pool.poolName}`);
      fetched[pool.poolId] = await fetchPaginatedData<EndFieldWeaponInfo>(
        u8_token,
        `https://ef-webview.${provider}.com/api/record/weapon`,
        serverId,
        { pool_id: pool.poolId },
        { type: "weapon", poolName: pool.poolName || pool.poolId },
        lang,
      );
    }
    return await saveUserData(uid, fetched, "weapon");
  };

  const handleSync = async (uid: string, type: "char" | "weapon" = "char") => {
    if (isSyncing.value) return;
    if (!uid || uid === "none") {
      showToast("同步失败", "请先选择一个账号");
      return;
    }

    await detectPlatform();
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
          await invoke("init_user_record", { uid: systemAuth.detectedUserKey });
        }

        effectiveUid = systemAuth.detectedUserKey;
        currentUid.value = effectiveUid;

        const isMainSystemUid =
          uid === SYSTEM_UID_CN || uid === SYSTEM_UID_GLOBAL;
        const isLegacySystemUid =
          uid === SYSTEM_UID_AUTO ||
          uid === SYSTEM_UID_OFFICIAL ||
          uid === SYSTEM_UID_BILIBILI;

        const regionLabel =
          systemAuth.provider === "gryphline"
            ? systemUidLabel(SYSTEM_UID_GLOBAL)
            : systemUidLabel(SYSTEM_UID_CN);

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

  const charStatistics = computed(() => {
    if (!charRecords.value) return [];
    return Object.keys(charRecords.value).map((k) =>
      analyzePoolData(k, charRecords.value[k]!),
    );
  });

  const weaponStatistics = computed(() => {
    if (!weaponRecords.value) return [];
    return Object.keys(weaponRecords.value).map((k) =>
      analyzeWeaponPoolData(k, weaponRecords.value[k]!),
    );
  });

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
