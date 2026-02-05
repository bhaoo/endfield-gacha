export const SYSTEM_UID_AUTO = 'system'

// 保留以兼容旧版本
export const SYSTEM_UID_OFFICIAL = 'system_official'
export const SYSTEM_UID_BILIBILI = 'system_bilibili'

export type SystemUid =
  | typeof SYSTEM_UID_AUTO
  | typeof SYSTEM_UID_OFFICIAL
  | typeof SYSTEM_UID_BILIBILI

export const isSystemUid = (uid: string | null | undefined): uid is SystemUid =>
  uid === SYSTEM_UID_AUTO ||
  uid === SYSTEM_UID_OFFICIAL ||
  uid === SYSTEM_UID_BILIBILI

export const systemUidLabel = (uid: string): string => {
  if (uid === SYSTEM_UID_OFFICIAL) return 'system(官服-已弃用)'
  if (uid === SYSTEM_UID_BILIBILI) return 'system(Bilibili-已弃用)'
  return 'system(自动识别)'
}
