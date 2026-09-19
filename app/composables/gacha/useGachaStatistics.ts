import type { ComputedRef, Ref } from "vue";
import type {
  EndFieldCharInfo,
  EndFieldWeaponInfo,
  GachaStatistics,
  PoolInfoEntry,
} from "~/types/gacha";
import {
  JOINT_POOL_KEY,
  RERUN_POOL_KEY,
  analyzePoolData,
  analyzeJointPoolData,
  analyzeRerunPoolData,
  analyzeSpecialPoolData,
  analyzeWeaponPoolData,
  POOL_TYPES,
  SPECIAL_POOL_KEY,
} from "~/utils/gachaCalc";
import { compareSeqId } from "~/utils/seqId";

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
      } else if (poolType === RERUN_POOL_KEY) {
        out.push(...analyzeRerunPoolData(list, params.poolInfoById.value));
      } else if (poolType === JOINT_POOL_KEY) {
        out.push(...analyzeJointPoolData(list, params.poolInfoById.value));
      } else out.push(analyzePoolData(poolType, list));
    }

    // Fallback
    for (const [k, list] of Object.entries(params.charRecords.value)) {
      if ((POOL_TYPES as readonly string[]).includes(k)) continue;
      out.push(analyzePoolData(k, list as any));
    }

    // 无有效抽卡的池（即记录为空）不进行展示
    return out.filter((s) => s.totalPulls > 0);
  });

  const weaponStatistics = computed(() => {
    if (!params.weaponRecords.value) return [];

    const weaponInfoByPoolId: Record<string, PoolInfoEntry> = {};
    for (const it of params.poolInfo.value || []) {
      if (!it) continue;
      if (it.pool_gacha_type !== "weapon") continue;
      if (!it.pool_id) continue;
      weaponInfoByPoolId[it.pool_id] = it;
    }

    // seqId 全局递增：各池取自身最大值，其中最大者即当前池
    const maxSeqIdByPool: Record<string, string> = {};
    let currentPoolId = "";
    let globalMaxSeqId = "";
    for (const [poolKey, list] of Object.entries(params.weaponRecords.value)) {
      for (const item of list || []) {
        const seqId = String(item?.seqId || "");
        if (!seqId) continue;
        const poolMax = maxSeqIdByPool[poolKey];
        if (!poolMax || compareSeqId(seqId, poolMax) > 0) {
          maxSeqIdByPool[poolKey] = seqId;
        }
      }

      const poolMaxSeqId = maxSeqIdByPool[poolKey];
      if (!poolMaxSeqId) continue;
      if (!globalMaxSeqId || compareSeqId(poolMaxSeqId, globalMaxSeqId) > 0) {
        globalMaxSeqId = poolMaxSeqId;
        currentPoolId = poolKey;
      }
    }

    return Object.keys(params.weaponRecords.value)
      .sort((a, b) => {
        const aMax = maxSeqIdByPool[a];
        const bMax = maxSeqIdByPool[b];
        if (!aMax && !bMax) return 0;
        if (!aMax) return 1;
        if (!bMax) return -1;
        return compareSeqId(bMax, aMax);
      })
      .map((poolKey) => {
        const info = weaponInfoByPoolId[poolKey];
        const stat = analyzeWeaponPoolData(
          poolKey,
          params.weaponRecords.value[poolKey]!,
          info?.up6_id,
        );
        stat.isCurrentPool = poolKey === currentPoolId;
        return stat;
      });
  });

  return { charStatistics, weaponStatistics };
};
