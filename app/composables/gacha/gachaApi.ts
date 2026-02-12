import { fetch } from "@tauri-apps/plugin-http";
import type { Ref } from "vue";
import type { EndFieldCharInfo, EndFieldWeaponInfo, GachaItem } from "~/types/gacha";
import {
  delay,
  POOL_TYPES,
  POOL_NAME_MAP,
  SPECIAL_POOL_KEY,
} from "~/utils/gachaCalc";

export const createGachaApi = (deps: {
  userAgent: Ref<string>;
  syncProgress: Ref<{
    type: "char" | "weapon" | null;
    poolName: string;
    page: number;
  }>;
  ensureCharPoolInfoForPoolIds: (p: {
    provider: "hypergryph" | "gryphline";
    serverId: string;
    poolIds: string[];
    lang: string;
  }) => Promise<void>;
  ensureWeaponPoolInfoForPoolId: (p: {
    provider: "hypergryph" | "gryphline";
    serverId: string;
    poolId: string;
    lang: string;
  }) => Promise<void>;
  saveUserData: (
    uid: string,
    newData: any,
    type: "char" | "weapon",
  ) => Promise<number>;
}) => {
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

    const provider: "hypergryph" | "gryphline" = baseUrl.includes(".gryphline.com")
      ? "gryphline"
      : "hypergryph";

    const weaponPoolId = String(extraParams?.pool_id || "").trim();
    if (progress?.type === "weapon" && weaponPoolId) {
      await deps.ensureWeaponPoolInfoForPoolId({
        provider,
        serverId,
        poolId: weaponPoolId,
        lang,
      });
    }

    try {
      while (hasMore) {
        page++;
        if (progress) {
          deps.syncProgress.value = {
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
          headers: { "User-Agent": deps.userAgent.value },
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

    const isSpecialCharPool =
      progress?.type === "char" && extraParams?.pool_type === SPECIAL_POOL_KEY;
    if (isSpecialCharPool && allData.length > 0) {
      const poolIds = Array.from(
        new Set(
          (allData as any[])
            .map((x) => String(x?.poolId || ""))
            .filter(Boolean),
        ),
      );
      await deps.ensureCharPoolInfoForPoolIds({
        provider,
        serverId,
        poolIds,
        lang,
      });
    }

    return allData;
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
    return await deps.saveUserData(uid, fetched, "char");
  };

  const syncWeapons = async (
    uid: string,
    u8_token: string,
    provider: "hypergryph" | "gryphline",
    serverId: string,
  ) => {
    // const lang = provider === "gryphline" ? "en-us" : "zh-cn";
    const lang = "zh-cn";
    deps.syncProgress.value = {
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
        headers: { "User-Agent": deps.userAgent.value },
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
    return await deps.saveUserData(uid, fetched, "weapon");
  };

  return {
    fetchPaginatedData,
    syncCharacters,
    syncWeapons,
  };
};
