// 忆枢 · 艾宾浩斯遗忘引擎
//
// 每条长期记忆（LTM）带一组调度状态，用 SM-2（Anki 同款）的简化变体调度：
//   强化（被召回命中 / 用户标记有用 / 手动复习）→ 间隔按 ease 拉长，强度上升
//   到期未强化 → 强度按半衰期衰减；低于阈值 → 「沉睡」归档（不删除，可唤醒复活）
// 短期记忆（STM）不走这套：它按 created_at + stmTtl 过期，命中过的晋升进 LTM 待审。
//
// 所有函数都是纯计算（不碰 DB），便于单测；DB 侧只做读写。

/** 沉睡阈值：强度低于此值视为「遗忘」。 */
export const SLEEP_THRESHOLD = 0.25
/** 强度上限。 */
export const STRENGTH_MAX = 10
/** 复习间隔边界（小时）。 */
export const MIN_INTERVAL_H = 4
export const MAX_INTERVAL_H = 24 * 365

/**
 * 核心层：这几类记忆代表「我是谁 / 我要什么」，永不衰减、永不沉睡。
 * 参考 dsh-chain 的 core 池（原则/人格永不淡）与 Letta 的 core memory。
 */
export const CORE_KINDS = new Set(['trait', 'preference', 'goal'])

/**
 * 各类型记忆的「衰减半衰期」（天）。参考 dsh-chain 的分池半衰期：
 *   - 核心（trait/preference/goal）→ Infinity，不衰减
 *   - 决策/教训/事实 → 长（这类记错代价高）
 *   - 知识 → 中；事件 → 短（一次性上下文，很快该淡出）
 * 半衰期越长，到期后衰减越慢。
 */
export const KIND_HALF_LIFE_DAYS = {
  trait: Infinity,
  preference: Infinity,
  goal: Infinity,
  decision: 365,
  mistake: 365,
  fact: 365,
  knowledge: 120,
  event: 20,
}

export const isCoreKind = (kind) => CORE_KINDS.has(String(kind || ''))

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * 新记忆的初始复习间隔（小时），按记忆类别分档：
 * 决策/教训这类「记错了代价高」的短间隔高频复习；事实/知识中等；事件类最长。
 */
export function initialIntervalHours(kind) {
  switch (String(kind || '')) {
    case 'decision':
    case 'mistake': return 8
    case 'preference':
    case 'trait':
    case 'goal': return 24
    case 'event': return 72
    default: return 24
  }
}

/**
 * SM-2 强化：quality 0-5（3 及以上算成功）。
 *   - 命中（recall hit）  → q=3（想起了）
 *   - 用户/Agent 标有用   → q=5（确定有用）
 *   - 手动「复习一下」    → q=4
 * 成功：interval *= ease，ease 按 quality 微调；失败：interval 减半。
 * 强度：成功 +gain（间隔越长 gain 越小，防止无限膨胀），失败按差值扣。
 * @param {object} mem 含 interval_hours/ease/strength/review_count
 * @param {number} quality 0-5
 * @param {number} now epoch ms
 * @returns {object} 新的 {strength, ease, interval_hours, due_at, last_review_at, review_count}
 */
export function reinforce(mem, quality, now = Date.now()) {
  const q = clamp(Number(quality) || 0, 0, 5)
  let { interval_hours: interval, ease, strength } = mem
  interval = Number(interval) || initialIntervalHours(mem.kind)
  ease = clamp(Number(ease) || 2.5, 1.3, 2.8)
  strength = Number(strength) || 1

  if (q >= 3) {
    interval = clamp(interval * ease, MIN_INTERVAL_H, MAX_INTERVAL_H)
    // SM-2 的 ease 调整公式（q=5 → +0.1；q=4 → +0.02 边界）
    ease = clamp(ease + (0.1 - (5 - q) * 0.08 + (5 - q) * (5 - q) * 0.02), 1.3, 2.8)
    const gain = 0.5 / (1 + Math.log2(1 + interval / 24))
    // 软上限（审阅意见 ③）：强度超过 2.5 后增益按剩余空间递减 → 打断「富者愈富」，
    // 否则高频被召回的那几条会把整个召回位次占死，变成回声室。
    const soft = Math.max(0.08, 1 - Math.max(0, strength - 2.5) / 3)
    strength = clamp(strength + gain * soft, SLEEP_THRESHOLD * 0.5, STRENGTH_MAX)
  } else {
    interval = clamp(interval / 2, MIN_INTERVAL_H, MAX_INTERVAL_H)
    ease = clamp(ease - 0.2, 1.3, 2.8)
    strength = clamp(strength - (5 - q) * 0.15, 0, STRENGTH_MAX)
  }

  const dueAt = now + interval * 3600_000
  return {
    strength: round3(strength),
    ease: round3(ease),
    interval_hours: round3(interval),
    due_at: new Date(dueAt).toISOString(),
    last_review_at: new Date(now).toISOString(),
    review_count: (Number(mem.review_count) || 0) + 1,
  }
}

/**
 * 衰减：到期未强化的记忆按「半衰期」指数衰减。
 * 半衰期 = 该类型的衰减半衰期（天）× 2（被强化过的记忆更稳），核心类型不衰减。
 * 幂等：给定 now，强度是 due_at 之后经过时间的确定函数。
 * @returns {number} 衰减后的强度（不落库，sweep 负责写回）
 */
export function decayedStrength(mem, now = Date.now()) {
  if (isCoreKind(mem.kind)) return Number(mem.strength) || 1 // 核心层永不衰减
  const due = Date.parse(mem.due_at || '') || 0
  if (!due || due >= now) return Number(mem.strength) || 1
  const overdueDays = (now - due) / 86400_000
  const kindHalfLife = KIND_HALF_LIFE_DAYS[mem.kind] ?? 120
  const halfLifeDays = Math.max(kindHalfLife, 1) * 2
  const s = (Number(mem.strength) || 1) * Math.pow(0.5, overdueDays / halfLifeDays)
  return round3(clamp(s, 0, STRENGTH_MAX))
}

/**
 * 单条记忆的 sweep 决策（纯函数）。
 * @returns {{write:object|null, transition:null|'sleep'}} write=要落库的字段；transition=是否转沉睡
 */
export function sweepOne(mem, now = Date.now()) {
  if (isCoreKind(mem.kind)) return { transition: null, write: null } // 核心层不参与遗忘
  const s = decayedStrength(mem, now)
  if (s <= SLEEP_THRESHOLD) {
    return {
      transition: 'sleep',
      write: { strength: s, updated_at: new Date(now).toISOString() },
    }
  }
  if (s !== (Number(mem.strength) || 1)) {
    return { transition: null, write: { strength: s } }
  }
  return { transition: null, write: null }
}

/**
 * STM 过期决策（纯函数）。
 * @param {object} mem STM 行
 * @param {number} ttlHours STM 生存期
 * @returns {'promote'|'expire'|'keep'} promote=命中过/强度够 → 晋升 LTM 待审；expire=软删；keep=还在期内
 */
export function stmSweepOne(mem, ttlHours, now = Date.now()) {
  const created = Date.parse(mem.created_at || '') || now
  const ageH = (now - created) / 3600_000
  if (ageH <= ttlHours) return 'keep'
  if ((Number(mem.hits) || 0) >= 1 || (Number(mem.strength) || 0) >= 1.5) return 'promote'
  return 'expire'
}

/** 唤醒沉睡记忆：重置调度，给一次「刚背完」的状态。 */
export function awaken(mem, now = Date.now()) {
  return {
    status: 'active',
    sleeping_at: null,
    strength: Math.max(0.6, (Number(mem.strength) || 0) * 2),
    interval_hours: initialIntervalHours(mem.kind),
    due_at: new Date(now + initialIntervalHours(mem.kind) * 3600_000).toISOString(),
    updated_at: new Date(now).toISOString(),
  }
}

/**
 * 旧卡迁移的初始调度：按卡龄折算（越久没动过的卡，越接近「快忘」状态）。
 * @param {object} card {updated_at}
 * @param {number} now
 */
export function migrationSchedule(card, now = Date.now()) {
  const updated = Date.parse(card.updated_at || '') || now
  const ageDays = Math.max(0, (now - updated) / 86400_000)
  // 卡龄折算间隔：3 天内 24h，之后每周翻倍，封顶 90 天
  const interval = clamp(24 * Math.pow(2, ageDays / 7), 24, 24 * 90)
  // 强度：新卡 1.0，每躺一个月衰减 15%，下限 0.35（略高于沉睡线，避免迁移即沉睡）
  const strength = Math.max(0.35, 1.0 * Math.pow(0.85, ageDays / 30))
  return {
    strength: round3(strength),
    interval_hours: round3(interval),
    due_at: new Date(now + interval * 3600_000).toISOString(),
  }
}

/**
 * 艾宾浩斯保留率曲线（可视化用）：经典的 R = e^(-t/S)。
 * @param {number} days 经过天数
 * @param {number} stability 记忆稳定性（天）；默认 2 ≈ 无复习的首次遗忘
 */
export function retention(days, stability = 2) {
  return Math.exp(-days / Math.max(stability, 0.1))
}

function round3(v) { return Math.round(v * 1000) / 1000 }
