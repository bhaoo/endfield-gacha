import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import type { Ref } from "vue";
import type { PoolInfoEntry } from "~/types/gacha";
import { toUp6IdList } from "~/utils/gachaCalc";

export const useGachaPoolInfo = (params: { userAgent: Ref<string> }) => {
  const poolInfoLoaded = ref(false);
  const poolInfo = useState<PoolInfoEntry[]>("gacha-pool-info", () => []);
  const poolInfoById = computed(() => {
    const map: Record<string, PoolInfoEntry> = {};
    for (const it of poolInfo.value || []) {
      if (it && typeof it.pool_id === "string" && it.pool_id)
        map[it.pool_id] = it;
    }
    return map;
  });

  const normalizePoolInfoEntry = (value: any): PoolInfoEntry | null => {
    if (!value || typeof value.pool_id !== "string" || !value.pool_id) {
      return null;
    }
    const up6Ids = toUp6IdList(value.up6_ids);

    return {
      pool_id: value.pool_id,
      pool_gacha_type: String(value.pool_gacha_type || ""),
      pool_name: String(value.pool_name || ""),
      pool_type: String(value.pool_type || ""),
      up6_id: String(value.up6_id || "").trim(),
      up6_ids: up6Ids.length > 0 ? up6Ids : undefined,
    };
  };

  const extractTokenOwnerName = (rewardName: unknown) => {
    const name = String(rewardName || "").trim();
    const suffix = "的信物";
    return name.endsWith(suffix) ? name.slice(0, -suffix.length).trim() : name;
  };

  const findUp6IdsByNames = (all: any[], names: string[]) => {
    const ids: string[] = [];
    for (const name of names) {
      if (!name) continue;
      const found =
        all.find(
          (x: any) =>
            x && String(x.name || "") === name && Number(x.rarity) === 6,
        ) || all.find((x: any) => x && String(x.name || "") === name);
      if (found?.id) ids.push(String(found.id));
    }
    return Array.from(new Set(ids));
  };

  // 特殊寻访读取 rotate_reward_item_list，特许寻访回退到 up6_name
  const getCharPoolUp6Ids = (pool: any) => {
    const all = Array.isArray(pool?.all) ? pool.all : [];
    const shouldReadRotateRewards = String(pool?.pool_type || "") === "extra";
    const rotateRewardNames =
      shouldReadRotateRewards && Array.isArray(pool?.rotate_reward_item_list)
        ? pool.rotate_reward_item_list.map(extractTokenOwnerName)
        : [];

    const rotateRewardIds = findUp6IdsByNames(all, rotateRewardNames);
    if (rotateRewardIds.length > 0) return rotateRewardIds;

    const up6Name = String(pool?.up6_name || "").trim();
    return findUp6IdsByNames(all, up6Name ? [up6Name] : []);
  };

  const loadPoolInfo = async () => {
    if (poolInfoLoaded.value) return;
    try {
      const data = await invoke<any>("read_pool_info");
      poolInfo.value = Array.isArray(data)
        ? data
            .map(normalizePoolInfoEntry)
            .filter((it): it is PoolInfoEntry => !!it)
        : [];
    } catch (e) {
      console.error("[poolInfo] read_pool_info failed", e);
      poolInfo.value = [];
    } finally {
      poolInfoLoaded.value = true;
    }
  };

  const savePoolInfo = async () => {
    try {
      await invoke("save_pool_info", { data: poolInfo.value });
    } catch (e) {
      console.error("[poolInfo] save_pool_info failed", e);
    }
  };

  const fetchCharPoolInfoFromApi = async (
    provider: "hypergryph" | "gryphline",
    serverId: string,
    poolId: string,
    lang: string,
  ): Promise<PoolInfoEntry | null> => {
    try {
      const query = new URLSearchParams({
        lang,
        pool_id: poolId,
        server_id: serverId,
      });
      const url = `https://ef-webview.${provider}.com/api/content?${query.toString()}`;
      const res = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": params.userAgent.value },
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      const pool = json?.code === 0 ? json?.data?.pool : null;
      if (!pool) return null;

      const up6Ids = getCharPoolUp6Ids(pool);
      const isMultiUp = up6Ids.length > 1;

      const entry: PoolInfoEntry = {
        pool_id: poolId,
        pool_gacha_type: String(pool.pool_gacha_type || ""),
        pool_name: String(pool.pool_name || ""),
        pool_type: String(pool.pool_type || ""),
        up6_id: isMultiUp ? "" : up6Ids[0] || "",
        up6_ids: isMultiUp ? up6Ids : undefined,
      };
      return entry;
    } catch (e) {
      console.error("[poolInfo] fetch content failed", { poolId, serverId }, e);
      return null;
    }
  };

  const fetchWeaponPoolInfoFromApi = async (p: {
    provider: "hypergryph" | "gryphline";
    serverId: string;
    poolId: string;
    lang: string;
  }): Promise<PoolInfoEntry | null> => {
    try {
      const effectiveServerId = p.provider === "hypergryph" ? "1" : p.serverId;
      const query = new URLSearchParams({
        lang: p.lang,
        pool_id: p.poolId,
        server_id: effectiveServerId,
      });
      const url = `https://ef-webview.${p.provider}.com/api/content?${query.toString()}`;
      const res = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": params.userAgent.value },
      });
      if (!res.ok) return null;

      const json: any = await res.json();
      const pool = json?.code === 0 ? json?.data?.pool : null;
      if (!pool) return null;

      const up6Name = String(pool.up6_name || "").trim();
      const all = Array.isArray(pool.all) ? pool.all : [];
      const up6Ids = findUp6IdsByNames(all, up6Name ? [up6Name] : []);

      const isConstant = String(p.poolId).toLowerCase().includes("constant");

      const entry: PoolInfoEntry = {
        pool_gacha_type: String(pool.pool_gacha_type || "weapon"),
        pool_id: p.poolId,
        pool_name: String(pool.pool_name || ""),
        pool_type: isConstant ? "constant" : "special",
        up6_id: up6Ids[0] || "",
      };
      return entry;
    } catch (e) {
      console.error(
        "[poolInfo] fetch weapon pool content failed",
        { poolId: p.poolId, serverId: p.serverId },
        e,
      );
      return null;
    }
  };

  const ensureCharPoolInfoForPoolIds = async (p: {
    provider: "hypergryph" | "gryphline";
    serverId: string;
    poolIds: string[];
    lang: string;
  }) => {
    await loadPoolInfo();
    if (!p.poolIds || p.poolIds.length <= 0) return;

    const uniq = Array.from(new Set(p.poolIds.filter(Boolean)));
    if (uniq.length <= 0) return;

    let changed = false;
    for (const poolId of uniq) {
      const existing = poolInfoById.value[poolId];
      if (existing?.up6_id || (existing?.up6_ids || []).length > 0) continue;

      const entry = await fetchCharPoolInfoFromApi(
        p.provider,
        p.serverId,
        poolId,
        p.lang,
      );
      if (!entry) continue;

      const idx = (poolInfo.value || []).findIndex((x) => x.pool_id === poolId);
      if (idx >= 0) poolInfo.value.splice(idx, 1, entry);
      else poolInfo.value.push(entry);
      changed = true;
    }

    if (changed) await savePoolInfo();
  };

  const ensureWeaponPoolInfoForPoolId = async (p: {
    provider: "hypergryph" | "gryphline";
    serverId: string;
    poolId: string;
    lang: string;
  }) => {
    await loadPoolInfo();
    const poolId = String(p.poolId || "").trim();
    if (!poolId) return;

    const existing = (poolInfo.value || []).find(
      (x) => x?.pool_id === poolId && x?.pool_gacha_type === "weapon",
    );
    if (existing) return;

    const entry = await fetchWeaponPoolInfoFromApi({
      provider: p.provider,
      serverId: p.serverId,
      poolId,
      lang: p.lang,
    });
    if (!entry) return;

    const idx = (poolInfo.value || []).findIndex(
      (x) => x?.pool_id === poolId && x?.pool_gacha_type === "weapon",
    );
    if (idx >= 0) poolInfo.value.splice(idx, 1, entry);
    else poolInfo.value.push(entry);

    await savePoolInfo();
  };

  return {
    poolInfo,
    poolInfoById,
    loadPoolInfo,
    ensureCharPoolInfoForPoolIds,
    ensureWeaponPoolInfoForPoolId,
  };
};
