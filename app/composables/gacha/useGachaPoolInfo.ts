import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import type { Ref } from "vue";
import type { PoolInfoEntry } from "~/types/gacha";

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

  const loadPoolInfo = async () => {
    if (poolInfoLoaded.value) return;
    try {
      const data = await invoke<any>("read_pool_info");
      poolInfo.value = Array.isArray(data) ? (data as PoolInfoEntry[]) : [];
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

  const fetchPoolInfoFromApi = async (
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

      const up6Name = String(pool.up6_name || "").trim();
      const all = Array.isArray(pool.all) ? pool.all : [];
      let up6Id = "";
      if (up6Name) {
        const found =
          all.find(
            (x: any) =>
              x && String(x.name || "") === up6Name && Number(x.rarity) === 6,
          ) || all.find((x: any) => x && String(x.name || "") === up6Name);
        if (found?.id) up6Id = String(found.id);
      }

      const entry: PoolInfoEntry = {
        pool_id: poolId,
        pool_gacha_type: String(pool.pool_gacha_type || ""),
        pool_name: String(pool.pool_name || ""),
        pool_type: String(pool.pool_type || ""),
        up6_id: up6Id,
      };
      return entry;
    } catch (e) {
      console.error("[poolInfo] fetch content failed", { poolId, serverId }, e);
      return null;
    }
  };

  const ensurePoolInfoForPoolIds = async (p: {
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
      if (existing?.up6_id) continue;

      const entry = await fetchPoolInfoFromApi(
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

  return {
    poolInfo,
    poolInfoById,
    loadPoolInfo,
    ensurePoolInfoForPoolIds,
  };
};

