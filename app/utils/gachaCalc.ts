import type { EndFieldCharInfo, GachaStatistics, HistoryRecord, EndFieldWeaponInfo, EndfieldGachaParams } from '~/types/gacha'

export const POOL_TYPES = [
  "E_CharacterGachaPoolType_Special",
  "E_CharacterGachaPoolType_Joint",
  "E_CharacterGachaPoolType_Standard",
  "E_CharacterGachaPoolType_Beginner",
] as const;

export const SPECIAL_POOL_KEY = "E_CharacterGachaPoolType_Special" as const;
export const JOINT_POOL_KEY = "E_CharacterGachaPoolType_Joint" as const;
export const POOL_INFO_CHAR_POOL_KEYS = [
  SPECIAL_POOL_KEY,
  JOINT_POOL_KEY,
] as const;
const SPECIAL_BIG_PITY_MAX = 120;

export const POOL_NAME_MAP: Record<string, string> = {
  "E_CharacterGachaPoolType_Special": "特许寻访",
  "E_CharacterGachaPoolType_Joint": "辉光庆典",
  "E_CharacterGachaPoolType_Standard": "基础寻访",
  "E_CharacterGachaPoolType_Beginner": "启程寻访"
};

export const toUp6IdList = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      values
        .map((it) => String(it || "").trim())
        .filter(Boolean),
    ),
  );
};

export const getPoolInfoUp6Ids = (info?: {
  up6_id?: string;
  up6_ids?: string[];
}): string[] => {
  const up6Ids = toUp6IdList(info?.up6_ids);
  return up6Ids.length > 0 ? up6Ids : toUp6IdList(info?.up6_id);
};

export const parseGachaParams = (uri: string): EndfieldGachaParams | null => {
  try {
    const url = new URL(uri);
    const searchParams = new URLSearchParams(url.search);
    const params = Object.fromEntries(searchParams.entries()) as Partial<EndfieldGachaParams>;

    if (!params.u8_token || !params.pool_id) {
      console.error("缺少关键参数: u8_token 或 pool_id");
      return null;
    }
    return params as EndfieldGachaParams;
  } catch (error) {
    console.error("URI 解析失败:", error);
    return null;
  }
}

export const analyzePoolData = (poolKey: string, rawData: EndFieldCharInfo[]): GachaStatistics => {
  const data = [...rawData].reverse();

  let count6 = 0;
  let count5 = 0;
  let count4 = 0;
  let pullsSinceLast6 = 0;

  const historyRecords: HistoryRecord[] = [];

  for (const item of data) {
    pullsSinceLast6++;
    if (item.rarity === 6) {
      count6++;
      historyRecords.push({
        name: item.charName,
        pity: pullsSinceLast6,
        isNew: item.isNew,
        gachaTs: item.gachaTs,
        seqId: item.seqId,
        poolId: item.poolId,
        poolName: item.poolName,
      });
      pullsSinceLast6 = 0;
    } else if (item.rarity === 5) {
      count5++;
    } else if (item.rarity === 4) {
      count4++;
    }
  }

  historyRecords.reverse();

  return {
    poolType: poolKey,
    poolName: POOL_NAME_MAP[poolKey] || poolKey,
    totalPulls: data.length,
    pityCount: pullsSinceLast6,
    count6,
    count5,
    count4,
    history6: historyRecords
  };
}

export const analyzeSpecialPoolData = (
  rawData: EndFieldCharInfo[],
  poolInfoById: Record<string, { pool_name?: string; up6_id?: string }> = {},
): GachaStatistics[] => {
  const data = [...rawData].reverse();

  let globalSmallPity = 0;

  const results: GachaStatistics[] = [];
  let current: GachaStatistics | null = null;
  let currentPoolId = "";

  const finalizeCurrent = () => {
    if (!current) return;
    current.pityCount = globalSmallPity;

    current.bigPityMax = SPECIAL_BIG_PITY_MAX;
    current.bigPityCount = current.paidPulls || 0;
    if (current.gotUp6) current.bigPityRemaining = 0;
    else {
      current.bigPityRemaining = Math.max(
        0,
        SPECIAL_BIG_PITY_MAX - (current.paidPulls || 0),
      );
    }

    current.history6.reverse();
  };

  const startNewPool = (poolId: string, poolName: string): GachaStatistics  => {
    const info = poolInfoById[poolId];
    const up6Id = info?.up6_id || "";
    return {
      poolType: SPECIAL_POOL_KEY,
      poolId,
      poolName:
        poolName ||
        info?.pool_name ||
        poolId ||
        POOL_NAME_MAP[SPECIAL_POOL_KEY] ||
        SPECIAL_POOL_KEY,
      isCurrentPool: false,
      totalPulls: 0,
      paidPulls: 0,
      freePulls: 0,
      pityCount: 0,
      bigPityMax: SPECIAL_BIG_PITY_MAX,
      bigPityCount: 0,
      bigPityRemaining: SPECIAL_BIG_PITY_MAX,
      up6Id: up6Id || undefined,
      gotUp6: false,
      count6: 0,
      count5: 0,
      count4: 0,
      history6: [] as HistoryRecord[],
    };
  };

  for (const item of data) {
    if (item.poolId !== currentPoolId) {
      finalizeCurrent();
      currentPoolId = item.poolId;
      current = startNewPool(item.poolId, item.poolName);
      results.push(current);
    }

    if (!current) continue;

    // Fallback
    if (item.poolName) current.poolName = item.poolName;

    current.totalPulls++;

    const isFree = !!item.isFree;
    if (isFree) {
      current.freePulls = (current.freePulls || 0) + 1;
    } else {
      current.paidPulls = (current.paidPulls || 0) + 1;
      globalSmallPity++;
    }

    if (item.rarity === 6) {
      current.count6++;
      current.history6.push({
        name: item.charName,
        pity: globalSmallPity,
        isNew: item.isNew,
        isFree,
        isUp: !!current.up6Id && item.charId === current.up6Id,
        poolId: current.poolId,
        poolName: current.poolName,
        up6Id: current.up6Id || undefined,
        gachaTs: item.gachaTs,
        seqId: item.seqId,
      });

      if (current.up6Id && item.charId === current.up6Id) current.gotUp6 = true;
      if (!isFree) globalSmallPity = 0;
    } else if (item.rarity === 5) {
      current.count5++;
    } else if (item.rarity === 4) {
      current.count4++;
    }
  }

  finalizeCurrent();

  if (results.length > 0) {
    results[results.length - 1]!.isCurrentPool = true;
  }

  return results.reverse();
};

// 特殊寻访无小保底/大保底
export const analyzeJointPoolData = (
  rawData: EndFieldCharInfo[],
  poolInfoById: Record<
    string,
    { pool_name?: string; up6_id?: string; up6_ids?: string[] }
  > = {},
): GachaStatistics[] => {
  const data = [...rawData].reverse();

  const results: GachaStatistics[] = [];
  let current: GachaStatistics | null = null;
  let currentPoolId = "";
  let paidPity = 0;

  const finalizeCurrent = () => {
    if (!current) return;
    current.pityCount = paidPity;
    current.history6.reverse();
  };

  const startNewPool = (poolId: string, poolName: string): GachaStatistics => {
    const info = poolInfoById[poolId];
    const up6Ids = getPoolInfoUp6Ids(info);
    const up6Id = up6Ids[0] || "";
    return {
      poolType: JOINT_POOL_KEY,
      poolId,
      poolName:
        poolName ||
        info?.pool_name ||
        poolId ||
        POOL_NAME_MAP[JOINT_POOL_KEY] ||
        JOINT_POOL_KEY,
      isCurrentPool: false,
      totalPulls: 0,
      paidPulls: 0,
      freePulls: 0,
      pityCount: 0,
      up6Id: up6Id || undefined,
      up6Ids: up6Ids.length > 0 ? up6Ids : undefined,
      gotUp6: false,
      count6: 0,
      count5: 0,
      count4: 0,
      history6: [] as HistoryRecord[],
    };
  };

  for (const item of data) {
    if (item.poolId !== currentPoolId) {
      finalizeCurrent();
      currentPoolId = item.poolId;
      current = startNewPool(item.poolId, item.poolName);
      paidPity = 0;
      results.push(current);
    }

    if (!current) continue;

    if (item.poolName) current.poolName = item.poolName;

    current.totalPulls++;

    const isFree = !!item.isFree;
    if (isFree) {
      current.freePulls = (current.freePulls || 0) + 1;
    } else {
      current.paidPulls = (current.paidPulls || 0) + 1;
      paidPity++;
    }

    if (item.rarity === 6) {
      const up6Ids = current.up6Ids || [];
      const isUp = up6Ids.includes(item.charId);
      current.count6++;
      current.history6.push({
        name: item.charName,
        pity: isFree ? 0 : paidPity,
        isNew: item.isNew,
        isFree,
        isUp: up6Ids.length > 0 && isUp,
        poolId: current.poolId,
        poolName: current.poolName,
        up6Id: current.up6Id || undefined,
        up6Ids: up6Ids.length > 0 ? up6Ids : undefined,
        gachaTs: item.gachaTs,
        seqId: item.seqId,
      });

      if (isUp) current.gotUp6 = true;
      if (!isFree) paidPity = 0;
    } else if (item.rarity === 5) {
      current.count5++;
    } else if (item.rarity === 4) {
      current.count4++;
    }
  }

  finalizeCurrent();

  if (results.length > 0) {
    results[results.length - 1]!.isCurrentPool = true;
  }

  return results.reverse();
};

export const analyzeWeaponPoolData = (
  poolKey: string,
  rawData: EndFieldWeaponInfo[],
  up6Id?: string,
): GachaStatistics => {
  const data = [...rawData].reverse();

  let count6 = 0;
  let count5 = 0;
  let count4 = 0;
  let pullsSinceLast6 = 0;
  let gotUp6 = false;

  const historyRecords: HistoryRecord[] = [];

  for (const item of data) {
    pullsSinceLast6++;

    if (item.rarity === 6) {
      count6++;

      historyRecords.push({
        name: item.weaponName,
        pity: pullsSinceLast6,
        isNew: item.isNew,
        isUp: !!up6Id && item.weaponId === up6Id,
        poolId: poolKey,
        poolName: item.poolName || poolKey,
        up6Id: up6Id || undefined,
        gachaTs: item.gachaTs,
        seqId: item.seqId,
      });

      if (up6Id && item.weaponId === up6Id) gotUp6 = true;
      pullsSinceLast6 = 0;
    } else if (item.rarity === 5) {
      count5++;
    } else if (item.rarity === 4) {
      count4++;
    }
  }

  historyRecords.reverse();

  const displayPoolName = data.length > 0 && data[data.length - 1]!.poolName
    ? data[data.length - 1]!.poolName
    : poolKey;

  return {
    poolId: poolKey,
    poolName: displayPoolName,
    totalPulls: data.length,
    pityCount: pullsSinceLast6,
    up6Id,
    gotUp6,
    count6,
    count5,
    count4,
    history6: historyRecords
  };
}

export const delay = (min: number, max: number) => {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  return new Promise(resolve => setTimeout(resolve, ms));
};
