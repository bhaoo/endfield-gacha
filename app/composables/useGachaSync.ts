import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  EndFieldCharInfo,
  EndFieldWeaponInfo,
  GachaItem,
} from "~/types/gacha";
import { analyzePoolData, delay, POOL_TYPES } from "~/utils/gachaCalc";

export const useGachaSync = () => {
  const toast = useToast();
  const isSyncing = ref(false);
  const user_agent = ref(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.112 Safari/537.36",
  );

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
          server_id: "1",
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

  const getAuthToken = async (uid: string) => {
    try {
      const config = await invoke<AppConfig>("read_config");
      const targetUser = config.users?.find((u) => u.uid === uid);
      if (!targetUser?.token) return null;

      const authRes = await fetch(
        "https://as.hypergryph.com/user/oauth2/v2/grant",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": user_agent.value,
          },
          body: JSON.stringify({
            type: 1,
            appCode: "be36d44aa36bfb5b",
            token: targetUser.token,
          }),
        },
      );
      if (!authRes.ok) return null;
      const authData = await authRes.json();

      const u8Res = await fetch(
        "https://binding-api-account-prod.hypergryph.com/account/binding/v1/u8_token_by_uid",
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
      return u8Data.data.token;
    } catch (e) {
      console.error("Auth error", e);
      return null;
    }
  };

  const syncCharacters = async (uid: string, u8_token: string) => {
    const fetched: Record<string, EndFieldCharInfo[]> = {};
    for (const poolType of POOL_TYPES) {
      fetched[poolType] = await fetchPaginatedData<EndFieldCharInfo>(
        u8_token,
        "https://ef-webview.hypergryph.com/api/record/char",
        { pool_type: poolType },
      );
    }
    return await saveUserData(uid, fetched, "char");
  };

  const syncWeapons = async (uid: string, u8_token: string) => {
    const query = new URLSearchParams({
      lang: "zh-cn",
      token: u8_token,
      server_id: "1",
    });
    const poolRes = await fetch(
      `https://ef-webview.hypergryph.com/api/record/weapon/pool?${query.toString()}`,
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
        "https://ef-webview.hypergryph.com/api/record/weapon",
        { pool_id: pool.poolId },
      );
    }
    return await saveUserData(uid, fetched, "weapon");
  };

  const handleSync = async (uid: string, type: "char" | "weapon" = "char") => {
    if (isSyncing.value) return;
    isSyncing.value = true;
    showToast(
      "同步开始",
      `正在获取${type === "char" ? "干员" : "武器"}数据...`,
    );

    try {
      const token = await getAuthToken(uid);
      if (!token) throw new Error("Token 获取失败，请重新登录");

      let count = 0;
      if (type === "char") {
        count = await syncCharacters(uid, token);
      } else {
        count = await syncWeapons(uid, token);
      }

      await loadUserData(uid, type);

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
