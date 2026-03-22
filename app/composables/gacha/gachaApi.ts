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
  onPageRetryExhausted?: (p: {
    type: "char" | "weapon";
    poolName: string;
    page: number;
    reason: string;
  }) => void;
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
  type SyncStatus = "success" | "partial_failed" | "all_failed";

  type PaginatedFetchResult<T extends GachaItem> = {
    data: T[];
    failed: boolean;
    successfulPages: number;
    failedPage: number | null;
    failureReason?: string;
  };

  type SyncResult = {
    count: number;
    status: SyncStatus;
    failedPools: string[];
    totalPools: number;
    failureReason?: string;
  };

  const MAX_PAGE_RETRY = 3;

  const isDigitsOnly = (value: string) => /^\d+$/.test(value);

  const compareSeqId = (a: string, b: string) => {
    if (a === b) return 0;

    const aDigits = isDigitsOnly(a);
    const bDigits = isDigitsOnly(b);

    if (aDigits && bDigits) {
      if (a.length !== b.length) return a.length > b.length ? 1 : -1;
      return a.localeCompare(b);
    }

    if (aDigits !== bDigits) return aDigits ? 1 : -1;
    return a.localeCompare(b);
  };

  const fetchPaginatedData = async <T extends GachaItem>(
    u8_token: string,
    baseUrl: string,
    serverId: string,
    extraParams: Record<string, string>,
    progress?: { type: "char" | "weapon"; poolName: string },
    lang: string = "zh-cn",
    stopSeqId: string = "",
  ): Promise<PaginatedFetchResult<T>> => {
    const allData: T[] = [];
    let nextSeqId = "";
    let hasMore = true;
    let page = 0;
    let failed = false;
    let failedPage: number | null = null;
    let successfulPages = 0;
    let failureReason = "";

    const provider: "hypergryph" | "gryphline" = baseUrl.includes(".gryphline.com")
      ? "gryphline"
      : "hypergryph";

    const weaponPoolId = String(extraParams?.pool_id || "").trim();
    if (progress?.type === "weapon" && weaponPoolId) {
      try {
        await deps.ensureWeaponPoolInfoForPoolId({
          provider,
          serverId,
          poolId: weaponPoolId,
          lang,
        });
      } catch (error: any) {
        const msg = String(error?.message || "获取武器池信息失败");
        console.error(`Fetch weapon pool info failed for ${weaponPoolId}:`, error);
        return {
          data: allData,
          failed: true,
          successfulPages,
          failedPage,
          failureReason: msg,
        };
      }
    }

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

      let res: any = null;
      for (let attempt = 1; attempt <= MAX_PAGE_RETRY; attempt++) {
        try {
          const response = await fetch(`${baseUrl}?${query.toString()}`, {
            method: "GET",
            headers: { "User-Agent": deps.userAgent.value },
          });
          if (!response.ok) {
            throw new Error(`Network response was not ok (${response.status})`);
          }

          const json = await response.json();
          if (json.code !== 0 || !json.data?.list) {
            throw new Error(
              `API response invalid: code=${String(json.code)} msg=${String(json.msg || "")}`,
            );
          }

          res = json;
          break;
        } catch (error: any) {
          const isLastAttempt = attempt >= MAX_PAGE_RETRY;
          const msg = String(error?.message || "分页获取失败");
          console.error(
            `Fetch page ${page} failed (${attempt}/${MAX_PAGE_RETRY}) for ${JSON.stringify(extraParams)}:`,
            error,
          );
          if (isLastAttempt) {
            failed = true;
            failedPage = page;
            failureReason = msg;
            if (progress) {
              deps.onPageRetryExhausted?.({
                type: progress.type,
                poolName: progress.poolName,
                page,
                reason: msg,
              });
            }
            hasMore = false;
          } else {
            await delay(500, 900);
          }
        }
      }

      if (!res) break;
      successfulPages++;

      const list = res.data.list as T[];
      if (list.length === 0) break;

      if (stopSeqId) {
        const newOnly = list.filter(
          (item) => compareSeqId(String(item?.seqId || ""), stopSeqId) > 0,
        );
        allData.push(...newOnly);

        // 遇到已同步过的记录时，后续页面只会更旧，可以提前停止。
        if (newOnly.length < list.length) {
          hasMore = false;
          break;
        }
      } else {
        allData.push(...list);
      }

      hasMore = !!res.data.hasMore;
      nextSeqId = list[list.length - 1]!.seqId;

      if (hasMore) await delay(500, 1000);
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
      try {
        await deps.ensureCharPoolInfoForPoolIds({
          provider,
          serverId,
          poolIds,
          lang,
        });
      } catch (error: any) {
        const msg = String(error?.message || "获取角色池信息失败");
        console.error(
          `Fetch special char pool info failed for ${JSON.stringify(extraParams)}:`,
          error,
        );
        failed = true;
        failureReason = failureReason || msg;
      }
    }

    return {
      data: allData,
      failed,
      successfulPages,
      failedPage,
      failureReason: failureReason || undefined,
    };
  };

  const getSyncStatus = (
    poolResults: { failed: boolean; successfulPages: number }[],
  ): SyncStatus => {
    const failedCount = poolResults.filter((x) => x.failed).length;
    if (failedCount === 0) return "success";

    const hasAnySucceededPool = poolResults.some((x) => x.successfulPages > 0);
    return hasAnySucceededPool ? "partial_failed" : "all_failed";
  };

  const syncCharacters = async (
    uid: string,
    u8_token: string,
    provider: "hypergryph" | "gryphline",
    serverId: string,
    options?: { stopSeqId?: string },
  ): Promise<SyncResult> => {
    // const lang = provider === "gryphline" ? "en-us" : "zh-cn";
    const lang = "zh-cn";
    const fetched: Record<string, EndFieldCharInfo[]> = {};
    const poolResults: {
      poolName: string;
      failed: boolean;
      successfulPages: number;
      failureReason?: string;
    }[] = [];

    for (const poolType of POOL_TYPES) {
      const poolName = POOL_NAME_MAP[poolType] || poolType;
      const result = await fetchPaginatedData<EndFieldCharInfo>(
        u8_token,
        `https://ef-webview.${provider}.com/api/record/char`,
        serverId,
        { pool_type: poolType },
        { type: "char", poolName },
        lang,
        options?.stopSeqId || "",
      );

      fetched[poolType] = result.data;
      poolResults.push({
        poolName,
        failed: result.failed,
        successfulPages: result.successfulPages,
        failureReason: result.failureReason,
      });
    }

    const count = await deps.saveUserData(uid, fetched, "char");
    const failedPools = poolResults.filter((x) => x.failed).map((x) => x.poolName);
    const failureReason = poolResults.find((x) => x.failed && x.failureReason)?.failureReason;

    return {
      count,
      status: getSyncStatus(poolResults),
      failedPools,
      totalPools: poolResults.length,
      failureReason,
    };
  };

  const syncWeapons = async (
    uid: string,
    u8_token: string,
    provider: "hypergryph" | "gryphline",
    serverId: string,
    options?: { stopSeqId?: string },
  ): Promise<SyncResult> => {
    // const lang = provider === "gryphline" ? "en-us" : "zh-cn";
    const lang = "zh-cn";
    deps.syncProgress.value = {
      type: "weapon",
      poolName: "获取武器池列表",
      page: 1,
    };

    let pools: { poolId: string; poolName: string }[] = [];
    try {
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
      if (!poolRes.ok) {
        throw new Error(`Network response was not ok (${poolRes.status})`);
      }
      const poolJson = await poolRes.json();
      if (poolJson.code !== 0 || !poolJson.data) {
        throw new Error(`获取武器池列表失败: ${String(poolJson.msg || "")}`);
      }
      pools = poolJson.data as { poolId: string; poolName: string }[];
    } catch (error: any) {
      const msg = String(error?.message || "获取武器池列表失败");
      console.error("Fetch weapon pools failed:", error);
      return {
        count: 0,
        status: "all_failed",
        failedPools: ["武器池列表"],
        totalPools: 1,
        failureReason: msg,
      };
    }

    const fetched: Record<string, EndFieldWeaponInfo[]> = {};
    const poolResults: {
      poolName: string;
      failed: boolean;
      successfulPages: number;
      failureReason?: string;
    }[] = [];

    for (const pool of pools) {
      console.log(`正在同步武器池: ${pool.poolName}`);
      const result = await fetchPaginatedData<EndFieldWeaponInfo>(
        u8_token,
        `https://ef-webview.${provider}.com/api/record/weapon`,
        serverId,
        { pool_id: pool.poolId },
        { type: "weapon", poolName: pool.poolName || pool.poolId },
        lang,
        options?.stopSeqId || "",
      );

      fetched[pool.poolId] = result.data;
      poolResults.push({
        poolName: pool.poolName || pool.poolId,
        failed: result.failed,
        successfulPages: result.successfulPages,
        failureReason: result.failureReason,
      });
    }

    const count = await deps.saveUserData(uid, fetched, "weapon");
    const failedPools = poolResults.filter((x) => x.failed).map((x) => x.poolName);
    const failureReason = poolResults.find((x) => x.failed && x.failureReason)?.failureReason;

    return {
      count,
      status: getSyncStatus(poolResults),
      failedPools,
      totalPools: poolResults.length,
      failureReason,
    };
  };

  return {
    fetchPaginatedData,
    syncCharacters,
    syncWeapons,
  };
};
