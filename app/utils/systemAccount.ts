export const SYSTEM_UID_AUTO = 'system'
export const SYSTEM_UID_OFFICIAL = 'system_official'
export const SYSTEM_UID_BILIBILI = 'system_bilibili'

export type SystemUid =
  | typeof SYSTEM_UID_AUTO
  | typeof SYSTEM_UID_OFFICIAL
  | typeof SYSTEM_UID_BILIBILI

export type SystemChannel = 'official' | 'bilibili' | 'unknown'

export const isSystemUid = (uid: string | null | undefined): uid is SystemUid =>
  uid === SYSTEM_UID_AUTO ||
  uid === SYSTEM_UID_OFFICIAL ||
  uid === SYSTEM_UID_BILIBILI

export const inferSystemChannel = (params: {
  channel?: string
  subChannel?: string
}): SystemChannel => {
  const channel = String(params.channel ?? '')
  const subChannel = String(params.subChannel ?? '')

  if (channel === '1' && subChannel === '1') return 'official'
  if (channel === '2' && subChannel === '2') return 'bilibili'
  return 'unknown'
}

export const systemUidFromChannel = (channel: SystemChannel): SystemUid => {
  if (channel === 'official') return SYSTEM_UID_OFFICIAL
  if (channel === 'bilibili') return SYSTEM_UID_BILIBILI
  return SYSTEM_UID_AUTO
}

export const systemUidLabel = (uid: string): string => {
  if (uid === SYSTEM_UID_OFFICIAL) return 'system(官服)'
  if (uid === SYSTEM_UID_BILIBILI) return 'system(Bilibili)'
  return 'system(自动识别)'
}

