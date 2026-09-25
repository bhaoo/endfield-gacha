import { fetch } from "@tauri-apps/plugin-http";
import type { Ref } from "vue";
import type { EndFieldCharInfo, EndFieldWeaponInfo, GachaItem, RerunCountMap } from "~/types/gacha";
import {
  delay,
  toRerunCountMap,
  POOL_TYPES,
  POOL_NAME_MAP,
  POOL_INFO_CHAR_POOL_KEYS,
  resolveWeaponPoolType,
  WEAPON_RERUN_POOL_TYPE,
} from "~/utils/gachaCalc";
import { compareSeqId } from "~/utils/seqId";

/** `/api/record/weapon/pool` 响应体分组字段 */
type WeaponPoolListItem = {
  poolId: string;
  poolName?: string;
  poolType?: string;
  online?: boolean;
};

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
  saveRerunCounts: (
    uid: string,
    type: "char" | "weapon",
    counts: RerunCountMap,
  ) => Promise<void>;
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
    warnings: string[]; // 累计次数接口不可用时使用
  };

  const MAX_PAGE_RETRY = 3;

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
    // pool_ids 为多池合并请求时，逐池补全武器池元数据。
    // 元数据拉取失败会被 ensureWeaponPoolInfoForPoolId 内部吞掉（返回 null 即跳过），
    // 不影响记录同步；up6_id 为空的池会在下次同步时重试。
    const weaponPoolIds =
      progress?.type === "weapon"
        ? (weaponPoolId ? [weaponPoolId] : String(extraParams?.pool_ids || "").split(","))
            .map((id) => id.trim())
            .filter(Boolean)
        : [];
    for (const poolId of weaponPoolIds) {
      await deps.ensureWeaponPoolInfoForPoolId({ provider, serverId, poolId, lang });
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

    const shouldFetchCharPoolInfo =
      progress?.type === "char" &&
      (POOL_INFO_CHAR_POOL_KEYS as readonly string[]).includes(
        String(extraParams?.pool_type || ""),
      );
    if (shouldFetchCharPoolInfo && allData.length > 0) {
      const poolIds = Array.from(
        new Set(
          (allData as any[])
            .map((x) => String(x?.poolId || ""))
            .filter(Boolean),
        ),
      );
      // 元数据拉取失败会被 ensureCharPoolInfoForPoolIds 内部吞掉，不影响记录同步
      await deps.ensureCharPoolInfoForPoolIds({
        provider,
        serverId,
        poolIds,
        lang,
      });
    }

    return {
      data: allData,
      failed,
      successfulPages,
      failedPage,
      failureReason: failureReason || undefined,
    };
  };

  const readTabPoolType = (tab: unknown): string => {
    if (!tab || typeof tab !== "object" || !("poolType" in tab)) return "";
    const value = tab.poolType;
    return typeof value === "string" ? value.trim() : "";
  };

  const fetchRerunCounts = async (p: {
    type: "char" | "weapon";
    u8_token: string;
    provider: "hypergryph" | "gryphline";
    serverId: string;
    lang: string;
  }): Promise<RerunCountMap> => {
    const query = new URLSearchParams({
      lang: p.lang,
      token: p.u8_token,
      server_id: p.serverId,
    });
    const url = `https://ef-webview.${p.provider}.com/api/record/${p.type}/rerun-counts?${query.toString()}`;

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_PAGE_RETRY; attempt++) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: { "User-Agent": deps.userAgent.value },
        });
        if (!response.ok) {
          throw new Error(`接口请求错误 (${response.status})`);
        }

        const json = await response.json();
        if (json.code !== 0 || !Array.isArray(json.data)) {
          throw new Error(
            `接口响应返回无效: code=${String(json.code)} msg=${String(json.msg || "")}`,
          );
        }

        return toRerunCountMap(json.data);
      } catch (error: unknown) {
        lastError = error;
        console.error(
          `获取 ${p.type} 累计寻访次数失败 重试 (${attempt}/${MAX_PAGE_RETRY}):`,
          error,
        );
        if (attempt < MAX_PAGE_RETRY) await delay(500, 900);
      }
    }

    throw new Error(
      String((lastError as { message?: string } | null)?.message || "获取累计寻访次数失败"),
    );
  };

  const fetchCharPoolTypes = async (
    u8_token: string,
    provider: "hypergryph" | "gryphline",
    serverId: string,
    lang: string,
  ): Promise<string[]> => {
    const query = new URLSearchParams({
      lang,
      token: u8_token,
      server_id: serverId,
    });
    const response = await fetch(
      `https://ef-webview.${provider}.com/api/record/char/meta?${query.toString()}`,
      {
        method: "GET",
        headers: { "User-Agent": deps.userAgent.value },
      },
    );
    if (!response.ok) {
      throw new Error(`[fetchCharPoolTypes] Network response was not ok (${response.status})`);
    }

    const json = await response.json();
    if (json.code !== 0 || !json.data) {
      throw new Error(
        `[fetchCharPoolTypes] API response invalid: code=${String(json.code)} msg=${String(json.msg || "")}`,
      );
    }

    const tabs = json.data.tabs;
    if (!Array.isArray(tabs)) return [];

    const poolTypes: string[] = [];
    for (const tab of tabs) {
      const poolType = readTabPoolType(tab);
      if (poolType && !poolTypes.includes(poolType)) poolTypes.push(poolType);
    }
    return poolTypes;
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
    const warnings: string[] = [];
    const poolResults: {
      poolName: string;
      failed: boolean;
      successfulPages: number;
      failureReason?: string;
    }[] = [];

    let poolTypes: string[];
    try {
      poolTypes = await fetchCharPoolTypes(u8_token, provider, serverId, lang);
    } catch (error) {
      // meta 不可用时 fallback 到内置卡池类型
      console.error("[fetchCharPoolTypes] 获取卡池列表失败，回退到内置卡池类型:", error);
      poolTypes = [...POOL_TYPES];
    }

    for (const poolType of poolTypes) {
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

    // 重构寻访的 120 抽大保底与「累计寻访次数」同源，记录同步成功后刷新权威计数
    deps.syncProgress.value = {
      type: "char",
      poolName: "获取累计寻访次数",
      page: 1,
    };
    try {
      const counts = await fetchRerunCounts({
        type: "char",
        u8_token,
        provider,
        serverId,
        lang,
      });
      await deps.saveRerunCounts(uid, "char", counts);
    } catch (error: unknown) {
      const msg = String((error as { message?: string } | null)?.message || error);
      console.error("[fetchRerunCounts] 角色累计寻访次数获取失败:", error);
      warnings.push(`累计寻访次数获取失败：${msg}`);
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
      warnings,
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

    let allPools: WeaponPoolListItem[] = [];
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
      if (poolJson.code !== 0 || !Array.isArray(poolJson.data)) {
        throw new Error(`获取武器池列表失败: ${String(poolJson.msg || "")}`);
      }
      allPools = poolJson.data as WeaponPoolListItem[];
    } catch (error: any) {
      const msg = String(error?.message || "获取武器池列表失败");
      console.error("Fetch weapon pools failed:", error);
      return {
        count: 0,
        status: "all_failed",
        failedPools: ["武器池列表"],
        totalPools: 1,
        failureReason: msg,
        warnings: [],
      };
    }

    const fetched: Record<string, EndFieldWeaponInfo[]> = {};
    const warnings: string[] = [];
    const poolResults: {
      poolName: string;
      failed: boolean;
      successfulPages: number;
      failureReason?: string;
    }[] = [];

    const rerunPoolIdSet = new Set(
      allPools
        .map((pool) => ({
          poolId: String(pool?.poolId || "").trim(),
          isRerun:
            String(pool?.poolType || "").trim() === WEAPON_RERUN_POOL_TYPE ||
            resolveWeaponPoolType(pool?.poolId || "") === WEAPON_RERUN_POOL_TYPE,
        }))
        .filter((pool) => pool.poolId && pool.isRerun)
        .map((pool) => pool.poolId),
    );

    // 重构申领的累计申领次数与 8 次大保底同源；接口不可用时仅提示，分组不受影响
    deps.syncProgress.value = {
      type: "weapon",
      poolName: "获取累计申领次数",
      page: 1,
    };
    try {
      const counts = await fetchRerunCounts({
        type: "weapon",
        u8_token,
        provider,
        serverId,
        lang,
      });
      await deps.saveRerunCounts(uid, "weapon", counts);
    } catch (error: unknown) {
      const msg = String((error as { message?: string } | null)?.message || error);
      console.error("[fetchRerunCounts] 武器累计申领次数获取失败:", error);
      warnings.push(`累计申领次数获取失败：${msg}`);
    }

    const rerunPoolIds = Array.from(rerunPoolIdSet);
    const independentPools = allPools.filter(
      (pool) => !rerunPoolIdSet.has(String(pool?.poolId || "").trim()),
    );

    const fetchWeaponPool = async (
      extraParams: Record<string, string>,
      progressPoolName: string,
    ) => {
      console.log(`正在同步武器池: ${progressPoolName}`);
      const result = await fetchPaginatedData<EndFieldWeaponInfo>(
        u8_token,
        `https://ef-webview.${provider}.com/api/record/weapon`,
        serverId,
        extraParams,
        { type: "weapon", poolName: progressPoolName },
        lang,
        options?.stopSeqId || "",
      );

      poolResults.push({
        poolName: progressPoolName,
        failed: result.failed,
        successfulPages: result.successfulPages,
        failureReason: result.failureReason,
      });
      return result;
    };

    for (const pool of independentPools) {
      const poolId = String(pool?.poolId || "").trim();
      if (!poolId) continue;
      const result = await fetchWeaponPool(
        { pool_id: poolId },
        String(pool.poolName || "").trim() || poolId,
      );
      fetched[poolId] = result.data;
    }

    if (rerunPoolIds.length > 0) {
      const result = await fetchWeaponPool(
        { pool_ids: rerunPoolIds.join(",") },
        "重构申领",
      );

      // 多池合并响应按 poolId 区分
      for (const poolId of rerunPoolIds) fetched[poolId] = [];
      for (const item of result.data) {
        const poolId = String(item.poolId || "").trim();
        if (!fetched[poolId]) fetched[poolId] = [];
        fetched[poolId].push(item);
      }
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
      warnings,
    };
  };

  return {
    fetchPaginatedData,
    fetchRerunCounts,
    syncCharacters,
    syncWeapons,
  };
};
