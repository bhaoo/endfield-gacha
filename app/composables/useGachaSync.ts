import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import type {
  AppConfig,
  EndFieldCharInfo,
  EndFieldWeaponInfo,
  GachaItem,
} from "~/types/gacha";
import {
  analyzePoolData,
  analyzeWeaponPoolData,
  delay,
  POOL_TYPES,
  parseGachaParams,
} from "~/utils/gachaCalc";
import {
  inferSystemChannel,
  isSystemUid,
  systemUidFromChannel,
  systemUidLabel,
  SYSTEM_UID_AUTO,
} from "~/utils/systemAccount";

export const useGachaSync = () => {
  const toast = useToast();
  const isSyncing = ref(false);
  const user_agent = ref(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.112 Safari/537.36",
  );
  const currentUid = useState<string>("current-uid", () => SYSTEM_UID_AUTO);

  const getGachaUri = async () => {
    const logPath =
      "AppData/LocalLow/Hypergryph/Endfield/sdklogs/HGWebview.log";
    const targetPrefix = "https://ef-webview.hypergryph.com/page/gacha_char";
    try {
      const content = await readTextFile(logPath, {
        baseDir: BaseDirectory.Home,
      });
      const lines = content.split(/\r?\n/).reverse();
      const matchLine = lines.find((line) => line.includes(targetPrefix));

      if (matchLine) {
        const urlRegex =
          /(https:\/\/ef-webview\.hypergryph\.com\/page\/gacha_char[^\s]*)/;
        const result = matchLine.match(urlRegex);
        return result?.[1] || "";
      }
      return "";
    } catch (err) {
      console.error("日志读取失败:", err);
      return "";
    }
  };

  type GachaAuth = {
    u8Token: string;
    provider: "hypergryph" | "gryphline";
    serverId: string;
  };

  type SystemGachaAuth = GachaAuth & {
    channel?: string;
    subChannel?: string;
    inferredUid: string;
  };

  const getSystemAuthFromLog = async (): Promise<SystemGachaAuth> => {
    const uri = await getGachaUri();
    if (!uri) {
      throw new Error(
        "未在日志中找到抽卡链接哦~请先在游戏内打开一次抽卡记录页面（角色池即可），再进行同步~",
      );
    }

    const params = parseGachaParams(uri);
    if (!params?.u8_token) {
      throw new Error("抽卡链接参数解析失败：未找到 u8_token");
    }

    const channelType = inferSystemChannel({
      channel: params.channel,
      subChannel: params.subChannel,
    });

    return {
      u8Token: params.u8_token,
      provider: "hypergryph",
      serverId: "1",
      channel: params.channel,
      subChannel: params.subChannel,
      inferredUid: systemUidFromChannel(channelType),
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
  ): Promise<T[]> => {
    const allData: T[] = [];
    let nextSeqId = "";
    let hasMore = true;

    try {
      while (hasMore) {
        const query = new URLSearchParams({
          lang: "zh-cn",
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
            appCode: provider === "gryphline" ? "3dacefa138426cfe" : "be36d44aa36bfb5b",
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
    const fetched: Record<string, EndFieldCharInfo[]> = {};
    for (const poolType of POOL_TYPES) {
      fetched[poolType] = await fetchPaginatedData<EndFieldCharInfo>(
        u8_token,
        `https://ef-webview.${provider}.com/api/record/char`,
        serverId,
        { pool_type: poolType },
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
    const query = new URLSearchParams({
      lang: "zh-cn",
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

    isSyncing.value = true;
    showToast(
      "同步开始",
      `正在获取${type === "char" ? "干员" : "武器"}数据...`,
    );

    try {
      let effectiveUid = uid;
      let auth: GachaAuth | null = null;

      if (isSystemUid(uid)) {
        const systemAuth = await getSystemAuthFromLog();

        if (uid === SYSTEM_UID_AUTO) {
          effectiveUid = systemAuth.inferredUid || SYSTEM_UID_AUTO;
          if (effectiveUid !== uid) {
            currentUid.value = effectiveUid;
            showToast(
              "已自动识别服务器渠道",
              `已切换为 ${systemUidLabel(effectiveUid)}`,
            );
          }
        } else if (systemAuth.inferredUid && systemAuth.inferredUid !== uid) {
          throw new Error(
            `当前日志识别为 ${systemUidLabel(systemAuth.inferredUid)}，但你选择的是 ${systemUidLabel(uid)}。请切换账号选择，或在对应客户端内打开一次抽卡记录页后再同步哦。`,
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
    handleSync,
    loadCharData: (uid: string) => loadUserData(uid, "char"),
    loadWeaponData: (uid: string) => loadUserData(uid, "weapon"),
  };
};
