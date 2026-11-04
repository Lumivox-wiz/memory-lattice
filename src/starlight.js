// 记忆星云的观感映射（纯函数，无 React / 无 JSX，便于 Node 端守卫单测）
// 强度 → 星球亮度：强度越高越亮；短期记忆整体略暗一档（概念上「未沉淀」）

// 强度范围：写入时夹在约 0.1–10，常见 0.1–3。把强度线性映射到亮度，强到 4 即封顶到满亮。
export function starBrightness(strength, layer) {
  const s = Number(strength) || 0
  const base = Math.max(0.3, Math.min(1, 0.3 + s * 0.17))
  return layer === 'stm' ? base * 0.62 : base
}

// 强度 → 光晕强度（与亮度同向，强记忆光晕更实）
export function starHalo(strength) {
  const s = Number(strength) || 0
  return Math.max(0.4, Math.min(1, 0.45 + (Math.min(s, 4) / 4) * 0.45))
}

// 强度 → 星球半径系数（保持原观感：强度撑大星球）
export function starRadiusFactor(strength) {
  return 4 + Math.min(Number(strength) || 0, 5) * 2.1
}
