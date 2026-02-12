import type { ComputedRef, Ref } from "vue";
import type {
  EndFieldCharInfo,
  EndFieldWeaponInfo,
  GachaStatistics,
  PoolInfoEntry,
} from "~/types/gacha";
import {
  analyzePoolData,
  analyzeSpecialPoolData,
  analyzeWeaponPoolData,
  POOL_TYPES,
  SPECIAL_POOL_KEY,
} from "~/utils/gachaCalc";

export const useGachaStatistics = (params: {
  charRecords: Ref<Record<string, EndFieldCharInfo[]>>;
  weaponRecords: Ref<Record<string, EndFieldWeaponInfo[]>>;
  poolInfoById: ComputedRef<Record<string, PoolInfoEntry>>;
  poolInfo: Ref<PoolInfoEntry[]>;
}) => {
  const charStatistics = computed(() => {
    if (!params.charRecords.value) return [];

    const out: GachaStatistics[] = [];

    for (const poolType of POOL_TYPES) {
      const list = params.charRecords.value[poolType];
      if (!list) continue;

      if (poolType === SPECIAL_POOL_KEY) {
        out.push(...analyzeSpecialPoolData(list, params.poolInfoById.value));
      } else out.push(analyzePoolData(poolType, list));
    }

    // Fallback
    for (const [k, list] of Object.entries(params.charRecords.value)) {
      if ((POOL_TYPES as readonly string[]).includes(k)) continue;
      out.push(analyzePoolData(k, list as any));
    }

    return out;
  });

  const weaponStatistics = computed(() => {
    if (!params.weaponRecords.value) return [];

    const weaponUp6ByPoolId: Record<string, string> = {};
    for (const it of params.poolInfo.value || []) {
      if (!it) continue;
      if (it.pool_gacha_type !== "weapon") continue;
      if (!it.pool_id) continue;
      if (!it.up6_id) continue;
      weaponUp6ByPoolId[it.pool_id] = it.up6_id;
    }

    return Object.keys(params.weaponRecords.value).map((k) =>
      analyzeWeaponPoolData(k, params.weaponRecords.value[k]!, weaponUp6ByPoolId[k]),
    );
  });

  return { charStatistics, weaponStatistics };
};
