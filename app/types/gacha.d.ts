// types/gacha.d.ts

export interface EndfieldGachaParams {
  pool_id: string;
  u8_token: string;
  platform: string;
  channel: string;
  subChannel: string;
  lang: string;
  server: string;
  [key: string]: string | undefined;
}

export interface EndFieldCharInfo {
  charId: string;
  charName: string;
  gachaTs: string;
  isFree: boolean;
  isNew: boolean;
  poolId: string;
  poolName: string;
  rarity: number;
  seqId: string;
}

export interface EndFieldGachaData {
  list: EndFieldCharInfo[];
  hasMore: boolean;
}

export interface EndFieldGachaResponse {
  code: number;
  data: EndFieldGachaData;
  msg: string;
}

export interface HistoryRecord {
  name: string;
  pity: number;
  isNew: boolean;
}

export interface GachaStatistics {
  poolName: string;
  totalPulls: number;
  pityCount: number;
  count6: number;
  count5: number;
  count4: number;
  history6: HistoryRecord[]; 
}