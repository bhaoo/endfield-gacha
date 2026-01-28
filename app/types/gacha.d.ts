export interface User {
  uid: string;
  token: string;
}

export interface AppConfig {
  users: User[];
  theme?: 'system' | 'light' | 'dark';
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