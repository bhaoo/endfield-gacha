/**
 * 寻访数据评价功能
 *
 * 依据《明日方舟：终末地》官方寻访概率与保底规则，对卡池的出货表现给出统计分位评价。
 *
 * 官方常数（来源于官方寻访详情「概率与保底规则说明」）：
 * - CHAR_RATE_6 = 0.8000%        6★ 基础概率
 * - CHAR_6_RATE_UP_TIME = 65     连续 65 次未出 6★ 后，之后每抽概率 +5%
 * - CHAR_6_RATE_UP_RATE = 5.0000%
 * - CHAR_6_GUARANTEED = 80       最多 80 次寻访必出 6★（计数继承到其他特许寻访）
 * - CHAR_UP_RATE_6 = 50.0000%    出 6★ 时 50% 为当期 UP
 * - CHAR_6_UP_GUARANTEED = 120   前 120 次寻访必定获得当期 UP（仅生效 1 次，计数不继承）
 * - CHAR_NEWBIE_TIME = 40        启程寻访 40 次保底，无概率提升
 *
 * 校验：由该模型算得的期望出货间隔 E[X] = 53.8993 抽，对应综合概率 100/E[X] = 1.8553%，
 * 叠加信物赠礼 1/240 后为 2.2720%，与官方公告 CHAR_RATE_6_AFTER_FIRST_UP = 2.2720% 精确吻合。
 */

import type { GachaStatistics, HistoryRecord } from '~/types/gacha'
import {
  BEGINNER_POOL_KEY,
  JOINT_POOL_KEY,
  RERUN_POOL_KEY,
  SPECIAL_POOL_KEY,
  STANDARD_POOL_KEY,
} from '~/utils/gachaCalc'

/** 6★ 基础概率 */
const CHAR_RATE_6 = 0.008
/** 概率提升起始抽数：已垫 65 抽后，之后每抽概率提升 */
const CHAR_SOFT_PITY = 65
/** 概率提升每抽概率增量 */
const CHAR_SOFT_STEP = 0.05
/** 小保底抽数 */
const CHAR_HARD_PITY = 80
/** 大保底抽数：必得当期 UP */
const CHAR_UP_GUARANTEE = 120
/** 出 6★ 时为当期 UP 的概率 */
const CHAR_UP_RATE = 0.5
/** 启程寻访保底抽数（无概率提升） */
const CHAR_NEWBIE_HARD_PITY = 40

/**
 * 「加急招募出当期 UP」的额外加成权重。
 *
 * 分位负责衡量「结果有多罕见」，加成负责衡量「结果有多值」。二者职责分离：
 * 加急招募的出货已按官方规则（不占保底计数、概率同基础概率）计入分位的零假设与观测值，
 * 故此处不再重复计价其稀有度，加成仅体现其额外收益。
 */
const FREE_UP_BONUS_PER = 0.05

/** 加急招募出 UP 的加成上限，避免多次叠加使评价失真 */
const FREE_UP_BONUS_CAP = 0.15

/**
 * 单个 6★ 出货间隔 X（距上一次出货的抽数，取值 1..hardPity）的概率分布与每抽出货率。
 *
 * `dist[i] = P(X = i + 1)`；`rates[i]` 为已垫 `i` 抽时下一抽的出货率。
 *
 * `upRate` / `upGuarantee` 为当期 UP 机制参数：官方仅在「特许寻访」公告了 50% UP 率与
 * 120 抽大保底；基础寻访、启程寻访、辉光庆典的公告均为「每位干员的获取概率均等」，
 * 故这些池不参与 UP 维度评价（置 null）。
 */
interface PoolModel {
  dist: Float64Array
  rates: Float64Array
  upRate: number | null
  upGuarantee: number | null
}

/** 概率模型按参数缓存：同一模型在多次渲染间复用，避免重复构建 */
const MODEL_CACHE = new Map<string, PoolModel>()

const buildModel = (
  hardPity: number,
  softPity: number | null,
  upRate: number | null = null,
  upGuarantee: number | null = null,
): PoolModel => {
  const key = `${hardPity}:${softPity ?? 'none'}:${upRate ?? 'none'}:${upGuarantee ?? 'none'}`
  const cached = MODEL_CACHE.get(key)
  if (cached) return cached

  const rates = new Float64Array(hardPity)
  for (let i = 0; i < hardPity; i++) {
    rates[i] =
      softPity !== null && i >= softPity
        ? Math.min(1, CHAR_RATE_6 + CHAR_SOFT_STEP * (i - softPity + 1))
        : CHAR_RATE_6
  }
  // 硬保底：最后一抽必定出货
  rates[hardPity - 1] = 1

  const dist = new Float64Array(hardPity)
  let survival = 1
  for (let i = 0; i < hardPity; i++) {
    dist[i] = survival * rates[i]!
    survival *= 1 - rates[i]!
  }

  const model: PoolModel = { dist, rates, upRate, upGuarantee }
  MODEL_CACHE.set(key, model)
  return model
}

/** 特许寻访：80 抽硬保底、65 抽后概率提升、120 抽大保底、50% UP */
const SPECIAL_MODEL = buildModel(CHAR_HARD_PITY, CHAR_SOFT_PITY, CHAR_UP_RATE, CHAR_UP_GUARANTEE)
/** 基础寻访 / 辉光庆典：80 抽硬保底、65 抽后概率提升，无 UP 机制 */
const STANDARD_MODEL = buildModel(CHAR_HARD_PITY, CHAR_SOFT_PITY)
/** 启程寻访：40 抽保底，无概率提升、无 UP 机制 */
const NEWBIE_MODEL = buildModel(CHAR_NEWBIE_HARD_PITY, null)

/** 池类型 → 概率模型 */
const MODEL_BY_POOL_TYPE: Record<string, PoolModel> = {
  [SPECIAL_POOL_KEY]: SPECIAL_MODEL,
  // 重构寻访与特许寻访同参数：80 硬保底、65 抽后概率提升、120 抽大保底、50% UP
  [RERUN_POOL_KEY]: SPECIAL_MODEL,
  [STANDARD_POOL_KEY]: STANDARD_MODEL,
  [JOINT_POOL_KEY]: STANDARD_MODEL,
  [BEGINNER_POOL_KEY]: NEWBIE_MODEL,
}

/** 离散卷积：`c[k] = Σ a[i]·b[k-i]` */
const convolve = (a: Float64Array, b: Float64Array): Float64Array => {
  const out = new Float64Array(a.length + b.length - 1)
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!
    if (ai === 0) continue
    for (let j = 0; j < b.length; j++) out[i + j]! += ai * b[j]!
  }
  return out
}

/** 二项分布概率质量函数 `P(K = k)`，`K ~ B(n, p)` */
const binomialPmf = (n: number, p: number): Float64Array => {
  const out = new Float64Array(n + 1)
  if (n <= 0) {
    out[0] = 1
    return out
  }
  out[0] = Math.pow(1 - p, n)
  let coef = 1
  for (let k = 1; k <= n; k++) {
    coef = (coef * (n - k + 1)) / k
    out[k] = coef * Math.pow(p, k) * Math.pow(1 - p, n - k)
  }
  return out
}

/**
 * 中位秩分位：`q = P(N < n) + P(N = n)/2`。
 *
 * 对随机样本其期望恒为 0.5 且均匀分布于 [0, 1]，故 `q > 0.5` 即表现优于理论中位水平。
 * 取中位秩而非单侧尾概率，可避免离散分布下的系统性偏斜。
 */
const medianRank = (pmf: Float64Array, value: number): number => {
  if (pmf.length === 0) return 0.5
  const n = Math.min(Math.max(value, 0), pmf.length - 1)
  let below = 0
  for (let k = 0; k < n; k++) below += pmf[k]!
  return below + pmf[n]! / 2
}

/**
 * 在已垫 `startPity` 抽的前提下，距下一次 6★ 出货的剩余抽数分布。
 *
 * 已知前 `startPity` 抽未出货，故取条件分布 `P(X = c0 + y) / P(X > c0)`。
 */
const conditionalInterval = (dist: Float64Array, startPity: number): Float64Array => {
  if (startPity <= 0) return dist
  const hardPity = dist.length
  const clamped = Math.min(startPity, hardPity)
  if (clamped >= hardPity) return Float64Array.of(1)

  let tail = 0
  for (let i = clamped; i < hardPity; i++) tail += dist[i]!
  if (tail <= 0) return Float64Array.of(1)

  const remaining = hardPity - clamped
  const out = new Float64Array(remaining)
  for (let y = 0; y < remaining; y++) out[y] = dist[clamped + y]! / tail
  return out
}

/**
 * 付费抽的 6★ 出货数量分布 `pmf[k] = P(在 pulls 抽内恰好获得 k 个 6★)`，含起始垫抽继承。
 */
const paidSixDistribution = (
  dist: Float64Array,
  startPity: number,
  pulls: number,
  maxCount: number,
): Float64Array => {
  if (pulls <= 0) {
    const out = new Float64Array(maxCount + 1)
    out[0] = 1
    return out
  }

  const first = conditionalInterval(dist, startPity)

  // ge[k] = P(前 k 个出货的累计抽数 ≤ pulls)；S_k 最小值为 k，故只需累加下标 [0, pulls-k]
  const ge = new Float64Array(maxCount + 2)
  ge[0] = 1
  let acc: Float64Array | null = null
  for (let k = 1; k <= maxCount + 1; k++) {
    acc = k === 1 ? first : convolve(acc!, dist)
    const limit = pulls - k + 1
    if (limit <= 0) {
      ge[k] = 0
    } else if (limit >= acc.length) {
      ge[k] = 1
    } else {
      let sum = 0
      for (let i = 0; i < limit; i++) sum += acc[i]!
      ge[k] = sum
    }
  }

  const out = new Float64Array(maxCount + 1)
  for (let k = 0; k <= maxCount; k++) out[k] = Math.max(0, ge[k]! - ge[k + 1]!)
  return out
}

/**
 * 特许寻访的 6★ 数与 UP 数的联合过程，返回两者的边缘分布。
 *
 * 大保底会在第 `upGuarantee` 抽强制产出一个 6★（且必为当期 UP），因此 6★ 数量分布
 * 同样受大保底影响，两者必须由同一过程导出——独立建模会使 6★ 分位产生系统性偏差。
 *
 * 状态为 `(垫抽位置, 是否已获当期 UP, 计数)`，两个边缘分布分别以 6★ 数与 UP 数作为计数。
 *
 * 加急招募不计入保底计数，但同样可能出 6★ 与当期 UP，故按基础概率独立卷积。
 */
const upPoolDistributions = (
  model: PoolModel,
  startPity: number,
  paidPulls: number,
  freePulls: number,
  maxCount: number,
): { sixPmf: Float64Array; upPmf: Float64Array } => {
  const { rates, upRate, upGuarantee } = model
  const rate = upRate ?? 0
  const hardPity = rates.length
  const pityStates = hardPity + 1
  const width = maxCount + 1
  const stride = 2 * width
  const size = pityStates * stride

  const idx = (pity: number, gotUp: number, count: number) =>
    pity * stride + gotUp * width + count

  let sixCur = new Float64Array(size)
  let sixNext = new Float64Array(size)
  let upCur = new Float64Array(size)
  let upNext = new Float64Array(size)

  const entry = idx(Math.min(startPity, hardPity), 0, 0)
  sixCur[entry] = 1
  upCur[entry] = 1

  for (let t = 1; t <= paidPulls; t++) {
    sixNext.fill(0)
    upNext.fill(0)
    const guaranteed = upGuarantee !== null && t >= upGuarantee

    for (let pity = 0; pity < pityStates; pity++) {
      const base = rates[Math.min(pity, hardPity - 1)]!
      const nextPity = Math.min(pity + 1, hardPity)

      for (let gotUp = 0; gotUp < 2; gotUp++) {
        // 大保底仅对「尚未获得当期 UP」的状态生效
        const forced = guaranteed && gotUp === 0
        const hitRate = forced ? 1 : base
        const upHitRate = forced ? 1 : rate
        const missRate = 1 - hitRate
        const off = pity * stride + gotUp * width
        const nextOff = nextPity * stride + gotUp * width

        for (let count = 0; count < width; count++) {
          const s = sixCur[off + count]!
          const u = upCur[off + count]!
          if (s === 0 && u === 0) continue

          if (missRate > 0) {
            if (s !== 0) sixNext[nextOff + count]! += s * missRate
            if (u !== 0) upNext[nextOff + count]! += u * missRate
          }

          if (count + 1 < width) {
            // 出 6★：垫抽清零。6★ 计数无论是否 UP 都 +1；UP 计数仅在命中当期 UP 时 +1。
            const hitUpOff = idx(0, 1, count + 1)
            if (s !== 0) {
              sixNext[hitUpOff]! += s * hitRate * upHitRate
              sixNext[idx(0, gotUp, count + 1)]! += s * hitRate * (1 - upHitRate)
            }
            if (u !== 0) {
              upNext[hitUpOff]! += u * hitRate * upHitRate
              upNext[idx(0, gotUp, count)]! += u * hitRate * (1 - upHitRate)
            }
          }
        }
      }
    }

    const s6 = sixCur
    sixCur = sixNext
    sixNext = s6
    const sU = upCur
    upCur = upNext
    upNext = sU
  }

  const sixPmf = new Float64Array(width)
  const upPmf = new Float64Array(width)
  for (let pity = 0; pity < pityStates; pity++) {
    for (let gotUp = 0; gotUp < 2; gotUp++) {
      const off = pity * stride + gotUp * width
      for (let count = 0; count < width; count++) {
        sixPmf[count]! += sixCur[off + count]!
        upPmf[count]! += upCur[off + count]!
      }
    }
  }

  if (freePulls <= 0) return { sixPmf, upPmf }

  // 加急招募：不占保底，每抽独立按基础概率出货，出 6★ 后按 UP 率判定
  const freeSix = binomialPmf(freePulls, CHAR_RATE_6)
  const freeUp = binomialPmf(freePulls, CHAR_RATE_6 * rate)
  return {
    sixPmf: convolve(sixPmf, freeSix).slice(0, width),
    upPmf: convolve(upPmf, freeUp).slice(0, width),
  }
}

/** 最非档位：阈值 -Infinity 使任意分数必然命中，单列以便类型收窄 */
const WORST_TIER = {
  name: '绝世非酋',
  threshold: -Infinity,
  color: 'text-indigo-400',
  badge: 'primary',
  variant: 'subtle',
} as const

/** 评价档位：按综合分位阈值降序（从最欧到最非） */
export const RATING_TIERS = [
  { name: '绝世欧皇', threshold: 0.999, color: 'text-rose-400', badge: 'error', variant: 'solid' },
  { name: '双层至尊欧皇', threshold: 0.99, color: 'text-amber-300', badge: 'warning', variant: 'subtle' },
  { name: '传说级欧皇', threshold: 0.95, color: 'text-amber-400', badge: 'warning', variant: 'subtle' },
  { name: '歪打正着的欧皇', threshold: 0.8, color: 'text-orange-400', badge: 'warning', variant: 'subtle' },
  { name: '薛定谔的欧洲人', threshold: 0.6, color: 'text-yellow-400', badge: 'neutral', variant: 'subtle' },
  { name: '脱欧入非', threshold: 0.4, color: 'text-muted', badge: 'neutral', variant: 'subtle' },
  { name: '面目全非', threshold: 0.2, color: 'text-sky-400', badge: 'info', variant: 'subtle' },
  { name: '非入骨髓', threshold: 0.05, color: 'text-blue-400', badge: 'info', variant: 'subtle' },
  WORST_TIER,
] as const

/** 评价档位 */
export type RatingTier = (typeof RATING_TIERS)[number]

/** 依据综合分位取档位（阈值降序排列，首个命中即最贴近的档位） */
export const resolveTier = (score: number): RatingTier =>
  RATING_TIERS.find((tier) => score >= tier.threshold) ?? WORST_TIER

/** 评价结果 */
export interface PoolRating {
  /** 6★ 出货运气分位（0~1，越大越欧） */
  q6: number
  /** 当期 UP 命中运气分位（0~1，越大越欧）；该池无 UP 机制时为 null */
  qUp: number | null
  /** 基础分：有 UP 机制时两项各占一半，否则仅计 6★ */
  baseScore: number
  /** 加急招募出当期 UP 的次数 */
  freeUpCount: number
  /** 加成：加急招募出当期 UP 的额外收益 */
  bonus: number
  /** 最终评价分 = 基础分 + 加成，用于取档位 */
  score: number
  /** 档位 */
  tier: RatingTier
  /** 理论期望出货间隔（抽） */
  expectedInterval: number
  /** 理论综合出货概率（%） */
  comprehensiveRate: number
}

/** 单个卡池的 6★ 与 UP 数量分布 */
interface PoolDistributions {
  sixPmf: Float64Array
  /** 该池无 UP 机制时为 null */
  upPmf: Float64Array | null
  model: PoolModel
}

/**
 * 计算单个卡池的 6★ 与 UP 数量分布。
 *
 * `startPity` 需为该池开始时的真实垫抽进度；聚合视图下各子池的大保底计数相互独立，
 * 故必须逐池建模后再卷积，不能直接对聚合后的总数建模。
 */
const poolDistributions = (stat: GachaStatistics): PoolDistributions | null => {
  const totalPulls = stat.totalPulls || 0
  if (totalPulls <= 0) return null

  const model = MODEL_BY_POOL_TYPE[stat.poolType || ''] || SPECIAL_MODEL
  const paidPulls = stat.paidPulls ?? totalPulls
  const freePulls = stat.freePulls ?? 0
  const startPity = stat.startPity ?? 0
  const sixCount = (stat.history6 || []).length

  // 上界按抽数期望的若干倍截断，尾部质量可忽略
  const bound = Math.max(Math.min(2048, Math.ceil(totalPulls / 16) + 8), sixCount + 8)

  if (model.upRate !== null) {
    // 大保底同时影响 6★ 与 UP，两者由同一过程导出
    const joint = upPoolDistributions(model, startPity, paidPulls, freePulls, bound)
    return { sixPmf: joint.sixPmf, upPmf: joint.upPmf, model }
  }

  let sixPmf = paidSixDistribution(model.dist, startPity, paidPulls, bound)
  if (freePulls > 0) {
    sixPmf = convolve(sixPmf, binomialPmf(freePulls, CHAR_RATE_6)).slice(0, bound + 1)
  }
  return { sixPmf, upPmf: null, model }
}

/** 理论期望出货间隔（抽） */
const expectedIntervalOf = (model: PoolModel) => {
  let mean = 0
  for (let i = 0; i < model.dist.length; i++) mean += (i + 1) * model.dist[i]!
  return mean
}

const assembleRating = (
  sixPmf: Float64Array,
  upPmf: Float64Array | null,
  sixCount: number,
  upCount: number,
  freeUpCount: number,
  model: PoolModel,
): PoolRating => {
  const q6 = medianRank(sixPmf, sixCount)
  const qUp = upPmf === null ? null : medianRank(upPmf, upCount)
  const baseScore = qUp === null ? q6 : (q6 + qUp) / 2

  // 加急招募出当期 UP 的额外收益；无 UP 机制的池不存在该加成
  const bonus = upPmf === null
    ? 0
    : Math.min(freeUpCount * FREE_UP_BONUS_PER, FREE_UP_BONUS_CAP)
  const score = baseScore + bonus

  const expectedInterval = expectedIntervalOf(model)
  return {
    q6,
    qUp,
    baseScore,
    freeUpCount,
    bonus,
    score,
    tier: resolveTier(score),
    expectedInterval,
    comprehensiveRate: 100 / expectedInterval,
  }
}

/** 统计 6★ 记录中「加急招募出当期 UP」的次数 */
const countFreeUp = (history: HistoryRecord[]) =>
  history.filter((rec) => rec.isFree && rec.isUp).length

/** 由单个卡池统计计算评价；无抽数时返回 null */
export const ratePool = (stat: GachaStatistics): PoolRating | null => {
  const dist = poolDistributions(stat)
  if (!dist) return null
  const history = stat.history6 || []
  return assembleRating(
    dist.sixPmf,
    dist.upPmf,
    history.length,
    history.filter((rec) => rec.isUp).length,
    countFreeUp(history),
    dist.model,
  )
}

/**
 * 由多个子卡池聚合计算评价（如「全部卡池」视图）。
 *
 * 各子池的大保底计数独立生效，因此将逐池的出货数量分布卷积得到总量分布；
 * 各子池的 `startPity` 已由分析阶段按跨池继承顺序写入，卷积成立。
 */
export const ratePoolAggregate = (stats: GachaStatistics[]): PoolRating | null => {
  const valid = stats.filter((stat) => (stat.totalPulls || 0) > 0)
  if (valid.length <= 0) return null

  let sixPmf: Float64Array | null = null
  let upPmf: Float64Array | null = null
  let sixCount = 0
  let upCount = 0
  let freeUpCount = 0
  let model = SPECIAL_MODEL
  let hasUp = false

  for (const stat of valid) {
    const dist = poolDistributions(stat)
    if (!dist) continue
    const history = stat.history6 || []
    sixCount += history.length
    upCount += history.filter((rec) => rec.isUp).length
    freeUpCount += countFreeUp(history)
    model = dist.model
    sixPmf = sixPmf === null ? dist.sixPmf : convolve(sixPmf, dist.sixPmf)
    if (dist.upPmf !== null) {
      hasUp = true
      upPmf = upPmf === null ? dist.upPmf : convolve(upPmf, dist.upPmf)
    }
  }

  if (sixPmf === null) return null
  return assembleRating(sixPmf, hasUp ? upPmf : null, sixCount, upCount, freeUpCount, model)
}
