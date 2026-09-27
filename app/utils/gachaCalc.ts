import type { EndFieldCharInfo, GachaStatistics, HistoryRecord, EndFieldWeaponInfo, EndfieldGachaParams } from '~/types/gacha'

export const SPECIAL_POOL_KEY = "E_CharacterGachaPoolType_Special" as const;
export const RERUN_POOL_KEY = "E_CharacterGachaPoolType_Rerun" as const;
export const JOINT_POOL_KEY = "E_CharacterGachaPoolType_Joint" as const;
export const STANDARD_POOL_KEY = "E_CharacterGachaPoolType_Standard" as const;
export const BEGINNER_POOL_KEY = "E_CharacterGachaPoolType_Beginner" as const;

export const POOL_TYPES = [
  SPECIAL_POOL_KEY,
  RERUN_POOL_KEY,
  JOINT_POOL_KEY,
  STANDARD_POOL_KEY,
  BEGINNER_POOL_KEY,
] as const;

export const POOL_INFO_CHAR_POOL_KEYS = [
  SPECIAL_POOL_KEY,
  RERUN_POOL_KEY,
  JOINT_POOL_KEY,
] as const;
const SPECIAL_BIG_PITY_MAX = 120;
export const GIFT_KIND_PREFIX = "gift";

export const WEAPON_LIMITED_POOL_TYPE = "special" as const;
export const WEAPON_CONSTANT_POOL_TYPE = "constant" as const;
export const WEAPON_RERUN_POOL_TYPE = "rerun" as const;
export const WEAPON_POOL_TYPE_LABELS: Record<string, string> = {
  [WEAPON_LIMITED_POOL_TYPE]: "限定申领",
  [WEAPON_CONSTANT_POOL_TYPE]: "常驻申领",
};

// 限定申领池的 poolId 形如 weponbox_1_0_1，重构申领池形如 rerun_wpn_yvonne；
// 常驻申领池带 constant 段（如 weaponbox_constant_2）
export const resolveWeaponPoolType = (poolId: string): string => {
  const value = String(poolId || "").toLowerCase();
  if (value.includes(WEAPON_CONSTANT_POOL_TYPE)) return WEAPON_CONSTANT_POOL_TYPE;
  if (value.startsWith("rerun") || value.includes("rerun_")) return WEAPON_RERUN_POOL_TYPE;
  return WEAPON_LIMITED_POOL_TYPE;
};

// 是否携带 kind 字段（角色有，武器没有）
const hasKindField = (value: object): value is { kind?: string } => 'kind' in value

// 是否为奖励记录
export const isGiftKind = (kind: unknown): boolean =>
  typeof kind === "string" && kind.startsWith(GIFT_KIND_PREFIX);

/**
 * 剔除奖励记录（如寻访情报书、信物赠礼、武库赠礼）
 *
 * 用 in 收窄而非泛型约束，以免弱类型检测拒绝没有共同属性的类型。
 */
const filterStatisticalRecords = <T extends object>(data: T[]): T[] =>
  data.filter((item) => !hasKindField(item) || !isGiftKind(item.kind));

export const POOL_NAME_MAP: Record<string, string> = {
  [SPECIAL_POOL_KEY]: "特许寻访",
  [RERUN_POOL_KEY]: "重构寻访",
  [JOINT_POOL_KEY]: "辉光庆典",
  [STANDARD_POOL_KEY]: "基础寻访",
  [BEGINNER_POOL_KEY]: "启程寻访",
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

/** poolId → 累计次数 映射 */
export const toRerunCountMap = (entries: unknown): RerunCountMap => {
  const map: RerunCountMap = {};
  if (!Array.isArray(entries)) return map;

  for (const item of entries) {
    const entry = normalizeRerunCountEntry(item);
    if (!entry) continue;
    map[entry.poolId] = Math.max(map[entry.poolId] || 0, entry.totalPullCount);
  }
  return map;
};

/** 丢弃非数字、负数与非法 poolId */
export const normalizeRerunCountMap = (value: unknown): RerunCountMap => {
  const map: RerunCountMap = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return map;

  for (const [poolId, count] of Object.entries(value as Record<string, unknown>)) {
    const key = String(poolId || "").trim();
    if (!key) continue;
    const num = Number(count);
    if (!Number.isFinite(num) || num < 0) continue;
    map[key] = Math.floor(num);
  }
  return map;
};

/** 合并累计次数（按 poolId 取较大数） */
export const mergeRerunCountMap = (
  local: RerunCountMap | undefined,
  incoming: RerunCountMap | undefined,
): RerunCountMap => {
  const merged: RerunCountMap = { ...normalizeRerunCountMap(local) };
  for (const [poolId, count] of Object.entries(normalizeRerunCountMap(incoming))) {
    merged[poolId] = Math.max(merged[poolId] || 0, count);
  }
  return merged;
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
  const data = filterStatisticalRecords(rawData).reverse();

  let count6 = 0;
  let count5 = 0;
  let count4 = 0;
  let paidPulls = 0;
  let freePulls = 0;
  // 仅付费抽计入保底（加急招募不计入保底计数）
  let pullsSinceLast6 = 0;

  const historyRecords: HistoryRecord[] = [];

  for (const item of data) {
    const isFree = !!item.isFree;
    if (isFree) freePulls++;
    else {
      paidPulls++;
      pullsSinceLast6++;
    }

    if (item.rarity === 6) {
      count6++;
      historyRecords.push({
        name: item.charName,
        charId: item.charId,
        pity: pullsSinceLast6,
        isNew: item.isNew,
        isFree,
        gachaTs: item.gachaTs,
        seqId: item.seqId,
        poolId: item.poolId,
        poolName: item.poolName,
      });
      if (!isFree) pullsSinceLast6 = 0;
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
    paidPulls,
    freePulls,
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
  const data = filterStatisticalRecords(rawData).reverse();

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
      // 小保底跨池继承：进入该池时的实时进度
      startPity: globalSmallPity,
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
        charId: item.charId,
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

/**
 * 重构寻访
 *
 * - 80 抽 6★ 保底在所有「重构寻访」卡池共享
 * - 120 抽 UP 6★ 大保底仅当前「{{pool_name}}」重构寻访中继承（即同名卡池）
 */
export const analyzeRerunPoolData = (
  rawData: EndFieldCharInfo[],
  poolInfoById: Record<
    string,
    { pool_name?: string; up6_id?: string }
  > = {},
): GachaStatistics[] => {
  const data = filterStatisticalRecords(rawData).reverse();

  let globalSmallPity = 0;

  const byPoolName = new Map<string, GachaStatistics>();
  const poolIdsByName = new Map<string, string[]>();
  const results: GachaStatistics[] = [];
  let latestPoolName = "";

  const resolvePoolName = (item: EndFieldCharInfo): string =>
    String(item.poolName || "").trim() ||
    String(poolInfoById[item.poolId]?.pool_name || "").trim() ||
    String(item.poolId || "").trim() ||
    POOL_NAME_MAP[RERUN_POOL_KEY] ||
    RERUN_POOL_KEY;

  for (const item of data) {
    const poolName = resolvePoolName(item);

    let current = byPoolName.get(poolName);
    if (!current) {
      current = {
        poolType: RERUN_POOL_KEY,
        // 合并后仅保留最近版本的 poolId，供 UI 作为唯一标识使用
        poolId: item.poolId,
        poolName,
        isCurrentPool: false,
        totalPulls: 0,
        paidPulls: 0,
        freePulls: 0,
        pityCount: 0,
        // 小保底跨池继承：进入该池时的实时进度
        startPity: globalSmallPity,
        bigPityMax: SPECIAL_BIG_PITY_MAX,
        bigPityCount: 0,
        bigPityRemaining: SPECIAL_BIG_PITY_MAX,
        gotUp6: false,
        count6: 0,
        count5: 0,
        count4: 0,
        history6: [] as HistoryRecord[],
      };
      byPoolName.set(poolName, current);
      poolIdsByName.set(poolName, []);
      results.push(current);
    }

    const poolId = String(item.poolId || "").trim();
    if (poolId) {
      const versionIds = poolIdsByName.get(poolName)!;
      if (!versionIds.includes(poolId)) versionIds.push(poolId);
      current.poolId = poolId;
    }

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
        charId: item.charId,
        pity: globalSmallPity,
        isNew: item.isNew,
        isFree,
        poolId: item.poolId,
        poolName,
        gachaTs: item.gachaTs,
        seqId: item.seqId,
      });

      if (!isFree) globalSmallPity = 0;
    } else if (item.rarity === 5) {
      current.count5++;
    } else if (item.rarity === 4) {
      current.count4++;
    }

    current.pityCount = globalSmallPity;
    latestPoolName = poolName;
  }

  for (const stat of results) {
    const versionIds = poolIdsByName.get(stat.poolName) || [];

    // 同名卡池共享同一个 UP 干员
    let up6Id = "";
    for (const poolId of versionIds) {
      up6Id = String(poolInfoById[poolId]?.up6_id || "").trim();
      if (up6Id) break;
    }
    stat.up6Id = up6Id || undefined;

    for (const rec of stat.history6) {
      rec.up6Id = stat.up6Id;
      rec.isUp = !!stat.up6Id && rec.charId === stat.up6Id;
      if (rec.isUp) stat.gotUp6 = true;
    }

    stat.bigPityCount = stat.paidPulls || 0;
    stat.bigPityRemaining = stat.gotUp6
      ? 0
      : Math.max(0, SPECIAL_BIG_PITY_MAX - (stat.paidPulls || 0));
    stat.history6.reverse();
  }

  // 最后一条寻访记录所属的即为当前池
  const latest = byPoolName.get(latestPoolName);
  if (latest) latest.isCurrentPool = true;

  return results.reverse();
};

// 辉光庆典类型无小保底/大保底
export const analyzeJointPoolData = (
  rawData: EndFieldCharInfo[],
  poolInfoById: Record<
    string,
    { pool_name?: string; up6_id?: string; up6_ids?: string[] }
  > = {},
): GachaStatistics[] => {
  const data = filterStatisticalRecords(rawData).reverse();

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
        charId: item.charId,
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
  const data = filterStatisticalRecords(rawData).reverse();

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
    poolType: resolveWeaponPoolType(poolKey),
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
