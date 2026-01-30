import type { EndFieldCharInfo, GachaStatistics, HistoryRecord, EndFieldWeaponInfo, EndfieldGachaParams } from '~/types/gacha'

export const POOL_TYPES = [
  "E_CharacterGachaPoolType_Special",
  "E_CharacterGachaPoolType_Standard",
  "E_CharacterGachaPoolType_Beginner",
] as const;

export const POOL_NAME_MAP: Record<string, string> = {
  "E_CharacterGachaPoolType_Special": "限定寻访",
  "E_CharacterGachaPoolType_Standard": "基础寻访",
  "E_CharacterGachaPoolType_Beginner": "启程寻访"
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
        isNew: item.isNew
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
    poolName: POOL_NAME_MAP[poolKey] || poolKey,
    totalPulls: data.length,
    pityCount: pullsSinceLast6,
    count6,
    count5,
    count4,
    history6: historyRecords
  };
}

export const analyzeWeaponPoolData = (poolKey: string, rawData: EndFieldWeaponInfo[]): GachaStatistics => {
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
        name: item.weaponName,
        pity: pullsSinceLast6,
        isNew: item.isNew
      });
      
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
    poolName: displayPoolName,
    totalPulls: data.length,
    pityCount: pullsSinceLast6,
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