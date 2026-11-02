// 记忆星云 · 3D 力导向 canvas（观感参考 dsh-chain：分簇池 / 透视 / 慢速自转 / 深度发光）
// 交互：拖空白=旋转视角 / 拖节点=整理布局 / 滚轮=缩放 / 单击节点=聚焦
// 性能：30fps 帧率上限；页面隐藏暂停；发光用径向渐变（不用 shadowBlur 高成本路径）
import React, { useState, useEffect, useRef, useCallback } from 'react'

const CAM_F = 900
const KIND_LABEL = { knowledge: '知识', decision: '决策', mistake: '踩坑', preference: '偏好', goal: '目标', trait: '特质', event: '事件', fact: '事实' }
const KIND_COLOR = { knowledge: '#4f7dff', decision: '#2dd4a7', mistake: '#ff5d6c', preference: '#b06cff', goal: '#ffb02e', trait: '#ff6bb0', event: '#8b95b0', fact: '#22c8e6' }

function project3(x, y, z, view, cx, cy) {
  const cyw = Math.cos(view.yaw), syw = Math.sin(view.yaw)
  const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch)
  const x1 = x * cyw - z * syw
  const z1 = x * syw + z * cyw
  const y1 = y * cp - z1 * sp
  const z2 = y * sp + z1 * cp
  const s = (CAM_F / (CAM_F + z2 + 420)) * view.zoom
  return { sx: cx + x1 * s, sy: cy + y1 * s, s, z: z2 }
}

export function NebulaGraph({ data, onSelect, selectedId, autoRotate = true, showLabels = true }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data?.nodes?.length) return
    const parent = canvas.parentElement
    const dpr = window.devicePixelRatio || 1

    const kinds = [...new Set(data.nodes.map((n) => n.kind))]
    const clusterOf = new Map(data.nodes.map((n) => [n.kind, kinds.indexOf(n.kind)]))
    const centers = kinds.map((_, k) => {
      const a = (k / kinds.length) * Math.PI * 2
      return { x: Math.cos(a) * 300, y: k % 2 ? 50 : -50, z: Math.sin(a) * 300 }
    })

    const nodes = data.nodes.map((n) => {
      const c = centers[clusterOf.get(n.kind)] || centers[0]
      return {
        ...n,
        x: c.x + (Math.random() - 0.5) * 170, y: c.y + (Math.random() - 0.5) * 130, z: c.z + (Math.random() - 0.5) * 170,
        vx: 0, vy: 0, vz: 0, pin: false,
      }
    })
    const idx = new Map(nodes.map((n) => [n.id, n]))
    const edges = data.edges.filter((e) => idx.has(e.a) && idx.has(e.b))
    const neighbors = new Map()
    for (const e of edges) {
      for (const [a, b] of [[e.a, e.b], [e.b, e.a]]) {
        if (!neighbors.has(a)) neighbors.set(a, new Set())
        neighbors.get(a).add(b)
      }
    }
    const focusSet = selectedId
      ? new Set([selectedId, ...(neighbors.get(selectedId) || [])])
      : null

    // 远景星幕
    const stars = Array.from({ length: 140 }, () => {
      const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), r = 1400
      return { x: r * Math.sin(b) * Math.cos(a), y: r * Math.cos(b), z: r * Math.sin(b) * Math.sin(a), tw: Math.random() * Math.PI * 2 }
    })

    const view = { yaw: 0.55, pitch: 0.24, zoom: 1 }
    let W = 0, H = 0, started = false
    let raf = 0, rafBoot = 0, lastFrame = 0, spin = 0

    const REPULSE = 5200, SPRING = 0.012, SPRING_LEN = 110, CLUSTER = 0.02, DAMP = 0.85

    const relax = (ticks) => {
      for (let t = 0; t < ticks; t++) {
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i]
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j]
            let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z
            let d2 = dx * dx + dy * dy + dz * dz
            if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dz = Math.random() - 0.5; d2 = 3 }
            const f = REPULSE / d2 / Math.sqrt(d2 + 100)
            a.vx += dx * f; a.vy += dy * f; a.vz += dz * f
            b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f
          }
          if (!a.pin) {
            const c = centers[clusterOf.get(a.kind)] || centers[0]
            a.vx -= (a.x - c.x) * CLUSTER; a.vy -= (a.y - c.y) * CLUSTER; a.vz -= (a.z - c.z) * CLUSTER
          }
        }
        for (const e of edges) {
          const a = idx.get(e.a), b = idx.get(e.b)
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
          const f = (d - SPRING_LEN) * SPRING * (e.kind === 'link' ? 2 : 1)
          if (!a.pin) { a.vx += dx / d * f; a.vy += dy / d * f; a.vz += dz / d * f }
          if (!b.pin) { b.vx -= dx / d * f; b.vy -= dy / d * f; b.vz -= dz / d * f }
        }
        for (const n of nodes) {
          if (n.pin) { n.vx = n.vy = n.vz = 0; continue }
          n.vx *= DAMP; n.vy *= DAMP; n.vz *= DAMP
          n.x += Math.max(-9, Math.min(9, n.vx)); n.y += Math.max(-9, Math.min(9, n.vy)); n.z += Math.max(-9, Math.min(9, n.vz))
        }
      }
    }

    const resize = () => {
      const nw = parent.clientWidth, nh = parent.clientHeight
      if (!nw || !nh) return
      W = nw; H = nh
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
    }

    const draw = () => {
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // 深空底：星云永远深色（不随宿主主题），观感对齐 dsh-chain
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#0a0f1f'); bg.addColorStop(1, '#111a38')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)
      const cx = W / 2, cy = H / 2
      // 星幕微闪
      for (const st of stars) {
        const p = project3(st.x, st.y, st.z, view, cx, cy)
        if (p.s <= 0) continue
        ctx.globalAlpha = 0.22 + 0.3 * Math.abs(Math.sin(st.tw + spin * 0.3))
        ctx.fillStyle = '#cdd6ff'
        ctx.fillRect(p.sx, p.sy, 1.3, 1.3)
      }
      ctx.globalAlpha = 1
      // 投影 + 深度排序（远→近）
      const proj = nodes.map((n) => ({ n, ...project3(n.x, n.y, n.z, view, cx, cy) }))
      proj.sort((a, b) => b.z - a.z)
      const dim = (n) => focusSet && !focusSet.has(n.id) ? 0.12 : 1
      const edgeById = new Map(proj.map((p) => [p.n.id, p]))
      for (const e of edges) {
        const a = edgeById.get(e.a), b = edgeById.get(e.b)
        if (!a || !b) continue
        const related = focusSet && (focusSet.has(e.a) && focusSet.has(e.b))
        ctx.strokeStyle = e.kind === 'link' ? 'rgba(120,160,255,0.6)' : 'rgba(150,165,220,0.3)'
        ctx.globalAlpha = Math.min(0.15 - (a.z + b.z) / 8000 + 0.55, 0.95) * (focusSet ? (related ? 0.9 : 0.06) : 1)
        ctx.lineWidth = (e.kind === 'link' ? 1.7 : 0.7) * ((a.s + b.s) / 2)
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke()
      }
      ctx.globalAlpha = 1
      for (const p of proj) {
        const n = p.n
        const r = (4 + Math.min(n.strength, 5) * 2.1) * p.s
        const color = KIND_COLOR[n.kind] || '#8b95b0'
        const a = dim(n) * (n.layer === 'stm' ? 0.55 : 1)
        if (a <= 0.02) continue
        // 光晕（径向渐变，零 filter）
        const halo = ctx.createRadialGradient(p.sx, p.sy, r * 0.3, p.sx, p.sy, r * 2.8)
        halo.addColorStop(0, color + '66'); halo.addColorStop(1, color + '00')
        ctx.globalAlpha = a * 0.85
        ctx.fillStyle = halo
        ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 2.8, 0, Math.PI * 2); ctx.fill()
        // 本体
        ctx.globalAlpha = a
        ctx.fillStyle = color
        ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2); ctx.fill()
        if (n.pin) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke() }
        if (selectedId === n.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.sx, p.sy, r + 4, 0, Math.PI * 2); ctx.stroke() }
        if (showLabels && p.s > 0.75 && a > 0.5) {
          ctx.fillStyle = 'rgba(226,232,255,0.9)'
          ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
          ctx.fillText(n.label.slice(0, 12), p.sx, p.sy + r + 12)
        }
        ctx.globalAlpha = 1
      }
    }

    const tick = (ts) => {
      raf = requestAnimationFrame(tick)
      if (document.hidden || started !== true) return
      if (ts - lastFrame < 33) return // 30fps 上限
      lastFrame = ts
      if (autoRotate && !drag) view.yaw += 0.0021
      spin += 0.02
      draw()
    }

    const place = () => {
      for (const n of nodes) {
        const c = centers[clusterOf.get(n.kind)] || centers[0]
        n.x = c.x + (Math.random() - 0.5) * 170; n.y = c.y + (Math.random() - 0.5) * 130; n.z = c.z + (Math.random() - 0.5) * 170
      }
    }

    // 启动三重保险：同步首绘 → rAF 校正 → RO 兜底（弹窗时序不稳，单靠 rAF 可能永不初始化）
    const boot = () => {
      resize()
      if (W > 0 && H > 0 && !started) { place(); relax(320); started = true; draw(); return }
      if (started) draw()
    }
    boot()
    if (!started) rafBoot = requestAnimationFrame(boot)
    raf = requestAnimationFrame(tick)

    const ro = new ResizeObserver(() => {
      const bw = W, bh = H
      resize()
      if (W !== bw || H !== bh) {
        if (!started && W > 0 && H > 0) { place(); relax(320); started = true }
        else if (started) {
          const dx = (W - bw) / 2, dy = (H - bh) / 2
          for (const n of nodes) { n.x += dx; n.y += dy }
        }
        draw()
      }
    })
    ro.observe(parent)

    // ---- 交互 ----
    let drag = null
    const hit = (ev) => {
      const rect = canvas.getBoundingClientRect()
      const cx = rect.width / 2, cy = rect.height / 2
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top
      let best = null, bestZ = 1e9
      for (const n of nodes) {
        const p = project3(n.x, n.y, n.z, view, cx, cy)
        const r = (4 + Math.min(n.strength, 5) * 2.1) * p.s + 4
        const d = (p.sx - mx) ** 2 + (p.sy - my) ** 2
        if (d <= r * r && p.z < bestZ) { best = n; bestZ = p.z }
      }
      return best
    }
    const onDown = (ev) => {
      const n = hit(ev)
      if (n) {
        n.pin = true
        drag = { mode: 'node', node: n, bx: n.x, by: n.y, bz: n.z, sx: ev.clientX, sy: ev.clientY, moved: false }
      } else {
        drag = { mode: 'orbit', lx: ev.clientX, ly: ev.clientY, sx: ev.clientX, sy: ev.clientY, moved: false }
      }
      canvas.style.cursor = 'grabbing'
    }
    const onMove = (ev) => {
      if (!drag) return
      if (drag.mode === 'node') {
        const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
        const rect = canvas.getBoundingClientRect()
        const p = project3(drag.node.x, drag.node.y, drag.node.z, view, rect.width / 2, rect.height / 2)
        if (p.s <= 0) return
        const k = 1 / p.s
        const cyw = Math.cos(view.yaw), syw = Math.sin(view.yaw)
        const cp = Math.cos(view.pitch)
        // 相机平面近似：屏幕右 → 世界 (cyw,0,-syw)；屏幕下 → 世界 y 分量为主
        drag.node.x = drag.bx + dx * k * cyw
        drag.node.z = drag.bz - dx * k * syw
        drag.node.y = drag.by + dy * k / Math.max(cp, 0.4)
        relax(3)
        draw()
      } else {
        view.yaw += (ev.clientX - drag.lx) * 0.005
        view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + (ev.clientY - drag.ly) * 0.004))
        drag.lx = ev.clientX; drag.ly = ev.clientY
        if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 4) drag.moved = true
        draw()
      }
    }
    const onUp = () => {
      if (drag) {
        if (drag.mode === 'node') {
          drag.node.pin = false
          if (!drag.moved) onSelect?.(drag.node)
        }
        drag = null
      }
      canvas.style.cursor = 'grab'
    }
    const onWheel = (ev) => {
      ev.preventDefault()
      view.zoom = Math.max(0.35, Math.min(3, view.zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)))
      draw()
    }
    const onLeave = () => { canvas.style.cursor = 'grab' }

    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('mouseleave', onLeave)
    canvas.style.cursor = 'grab'

    return () => {
      cancelAnimationFrame(raf); cancelAnimationFrame(rafBoot)
      ro.disconnect()
      canvas.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('mouseleave', onLeave)
    }
  }, [data, selectedId, autoRotate, showLabels])

  if (!data?.nodes?.length) return <div className="ml-empty ml-empty-dark">记忆还太少，画不出星云 —— 聊几轮天再来。</div>
  // 内层无高度（100% 填满调用方给的 wrap）—— 踩过双层 .ml-graph-wrap 嵌套把画布卡死在 420 的坑
  return (
    <div className="ml-graph-inner">
      <canvas ref={canvasRef} className="ml-graph-canvas" />
      <div className="ml-graph-legend">
        {Object.entries(KIND_COLOR).map(([k, c]) => (
          <span key={k}><i style={{ background: c }} />{KIND_LABEL[k] || k}</span>
        ))}
        <span className="ml-dim">拖空白旋转 · 拖节点整理 · 滚轮缩放 · 单击聚焦</span>
      </div>
    </div>
  )
}
