export interface User {
  key?: string;
  uid: string;
  token: string;
  provider?: 'hypergryph' | 'gryphline';
  roleId?: UserRole;
  source?: 'login' | 'log';
}

export interface UserRole {
  serverId: string;
  serverName: string;
  nickName: string;
  roleId: string;
}

export interface AppConfig {
  users: User[];
  currentUser?: string;
  theme?: 'system' | 'light' | 'dark';
  updateSeenVersion?: string;
}

export interface HgApiResponse<T = any> {
  status: number;
  msg: string;
  data: T;
}

export interface HgGameBindingsData {
  list: GameAppInfo[];
}

export interface GameAppInfo {
  appCode: string;
  appName: string;
  supportMultiServer: boolean;
  bindingList: BindingAccount[];
}

export interface BindingAccount {
  uid: string;
  channelMasterId: number;
  channelName: string;
  isOfficial: boolean;
  isDefault: boolean;
  isDeleted: boolean;
  isBanned: boolean;
  registerTs: number;
  roles: GameRole[];
}

export interface GameRole {
  roleId: string;
  nickName: string;
  level: number;
  serverId: string;
  serverName: string;
  isDefault: boolean;
  isBanned: boolean;
  registerTs: number;
}

export type UserBindingsResponse = HgApiResponse<HgGameBindingsData>;

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

export interface EndFieldWeaponInfo {
  poolId: string;
  poolName: string;
  weaponId: string;
  weaponName: string;
  weaponType: string;
  rarity: number;
  isNew: boolean;
  gachaTs: string;
  seqId: string;
}

export interface GachaItem {
  seqId: string;
  [key: string]: any;
}

export interface EndFieldGachaData {
  list: EndFieldCharInfo[];
  hasMore: boolean;
}

export interface HistoryRecord {
  name: string;
  pity: number;
  isNew: boolean;
  isFree?: boolean;
}

export interface GachaStatistics {
  poolName: string;
  poolId?: string;
  poolType?: string;
  isCurrentPool?: boolean;
  totalPulls: number;
  paidPulls?: number;
  freePulls?: number;
  pityCount: number;
  bigPityMax?: number;
  bigPityCount?: number;
  bigPityRemaining?: number;
  up6Id?: string;
  gotUp6?: boolean;
  count6: number;
  count5: number;
  count4: number;
  history6: HistoryRecord[]; 
}

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

export interface PoolInfoEntry {
  pool_id: string;
  pool_gacha_type: string;
  pool_name: string;
  pool_type: string;
  up6_id: string;
}
