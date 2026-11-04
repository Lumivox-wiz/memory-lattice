window.__ModuleLoader__.load({ id: "memory-lattice", factory: (require) => {
var __module = { exports: {} };
var __origExports = __module.exports;
(function (module, exports) {

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.jsx
var client_exports = {};
__export(client_exports, {
  App: () => App,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react2 = __toESM(require("react"), 1);
var import_client = require("react-dom/client");
var import_react_dom = require("react-dom");

// src/graph3d.jsx
var import_react = __toESM(require("react"), 1);

// src/starlight.js
function starBrightness(strength, layer) {
  const s = Number(strength) || 0;
  const base = Math.max(0.3, Math.min(1, 0.3 + s * 0.17));
  return layer === "stm" ? base * 0.62 : base;
}
function starHalo(strength) {
  const s = Number(strength) || 0;
  return Math.max(0.4, Math.min(1, 0.45 + Math.min(s, 4) / 4 * 0.45));
}
function starRadiusFactor(strength) {
  return 4 + Math.min(Number(strength) || 0, 5) * 2.1;
}

// src/graph3d.jsx
var import_jsx_runtime = require("react/jsx-runtime");
function hexA(hex, a) {
  const h = (hex || "#8b95b0").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}
var CAM_F = 900;
var KIND_LABEL = { knowledge: "\u77E5\u8BC6", decision: "\u51B3\u7B56", mistake: "\u8E29\u5751", preference: "\u504F\u597D", goal: "\u76EE\u6807", trait: "\u7279\u8D28", event: "\u4E8B\u4EF6", fact: "\u4E8B\u5B9E" };
var KIND_COLOR = { knowledge: "#4f7dff", decision: "#2dd4a7", mistake: "#ff5d6c", preference: "#b06cff", goal: "#ffb02e", trait: "#ff6bb0", event: "#8b95b0", fact: "#22c8e6" };
function project3(x, y, z, view, cx, cy) {
  const cyw = Math.cos(view.yaw), syw = Math.sin(view.yaw);
  const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  const x1 = x * cyw - z * syw;
  const z1 = x * syw + z * cyw;
  const y1 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  const s = CAM_F / (CAM_F + z2 + 420) * view.zoom;
  return { sx: cx + x1 * s, sy: cy + y1 * s, s, z: z2 };
}
function NebulaGraph({ data, onSelect, selectedId, autoRotate = true, showLabels = true }) {
  const canvasRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data?.nodes?.length) return;
    const parent = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const kinds = [...new Set(data.nodes.map((n) => n.kind))];
    const clusterOf = new Map(data.nodes.map((n) => [n.kind, kinds.indexOf(n.kind)]));
    const centers = kinds.map((_, k) => {
      const a = k / kinds.length * Math.PI * 2;
      return { x: Math.cos(a) * 300, y: k % 2 ? 50 : -50, z: Math.sin(a) * 300 };
    });
    const nodes = data.nodes.map((n) => {
      const c = centers[clusterOf.get(n.kind)] || centers[0];
      return {
        ...n,
        x: c.x + (Math.random() - 0.5) * 170,
        y: c.y + (Math.random() - 0.5) * 130,
        z: c.z + (Math.random() - 0.5) * 170,
        vx: 0,
        vy: 0,
        vz: 0,
        pin: false
      };
    });
    const idx = new Map(nodes.map((n) => [n.id, n]));
    const edges = data.edges.filter((e) => idx.has(e.a) && idx.has(e.b));
    const neighbors = /* @__PURE__ */ new Map();
    for (const e of edges) {
      for (const [a, b] of [[e.a, e.b], [e.b, e.a]]) {
        if (!neighbors.has(a)) neighbors.set(a, /* @__PURE__ */ new Set());
        neighbors.get(a).add(b);
      }
    }
    const focusSet = selectedId ? /* @__PURE__ */ new Set([selectedId, ...neighbors.get(selectedId) || []]) : null;
    const stars = Array.from({ length: 140 }, () => {
      const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), r = 1400;
      return { x: r * Math.sin(b) * Math.cos(a), y: r * Math.cos(b), z: r * Math.sin(b) * Math.sin(a), tw: Math.random() * Math.PI * 2 };
    });
    const view = { yaw: 0.55, pitch: 0.24, zoom: 1 };
    let W = 0, H = 0, started = false;
    let raf = 0, rafBoot = 0, lastFrame = 0, spin = 0;
    const REPULSE = 5200, SPRING = 0.012, SPRING_LEN = 110, CLUSTER = 0.02, DAMP = 0.85;
    const relax = (ticks) => {
      for (let t = 0; t < ticks; t++) {
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
            let d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < 1) {
              dx = Math.random() - 0.5;
              dy = Math.random() - 0.5;
              dz = Math.random() - 0.5;
              d2 = 3;
            }
            const f = REPULSE / d2 / Math.sqrt(d2 + 100);
            a.vx += dx * f;
            a.vy += dy * f;
            a.vz += dz * f;
            b.vx -= dx * f;
            b.vy -= dy * f;
            b.vz -= dz * f;
          }
          if (!a.pin) {
            const c = centers[clusterOf.get(a.kind)] || centers[0];
            a.vx -= (a.x - c.x) * CLUSTER;
            a.vy -= (a.y - c.y) * CLUSTER;
            a.vz -= (a.z - c.z) * CLUSTER;
          }
        }
        for (const e of edges) {
          const a = idx.get(e.a), b = idx.get(e.b);
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          const f = (d - SPRING_LEN) * SPRING * (e.kind === "link" ? 2 : 1);
          if (!a.pin) {
            a.vx += dx / d * f;
            a.vy += dy / d * f;
            a.vz += dz / d * f;
          }
          if (!b.pin) {
            b.vx -= dx / d * f;
            b.vy -= dy / d * f;
            b.vz -= dz / d * f;
          }
        }
        for (const n of nodes) {
          if (n.pin) {
            n.vx = n.vy = n.vz = 0;
            continue;
          }
          n.vx *= DAMP;
          n.vy *= DAMP;
          n.vz *= DAMP;
          n.x += Math.max(-9, Math.min(9, n.vx));
          n.y += Math.max(-9, Math.min(9, n.vy));
          n.z += Math.max(-9, Math.min(9, n.vz));
        }
      }
    };
    const resize = () => {
      const nw = parent.clientWidth, nh = parent.clientHeight;
      if (!nw || !nh) return;
      W = nw;
      H = nh;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    };
    const draw = () => {
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0a0f1f");
      bg.addColorStop(1, "#111a38");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      for (const st of stars) {
        const p = project3(st.x, st.y, st.z, view, cx, cy);
        if (p.s <= 0) continue;
        ctx.globalAlpha = 0.22 + 0.3 * Math.abs(Math.sin(st.tw + spin * 0.3));
        ctx.fillStyle = "#cdd6ff";
        ctx.fillRect(p.sx, p.sy, 1.3, 1.3);
      }
      ctx.globalAlpha = 1;
      const cloudA = focusSet ? 0.3 : 1;
      for (let k = 0; k < kinds.length; k++) {
        const c = centers[k];
        if (!c) continue;
        const p = project3(c.x, c.y, c.z, view, cx, cy);
        if (p.s <= 0) continue;
        const color = KIND_COLOR[kinds[k]] || "#8b95b0";
        const R = 185 * p.s;
        const g = ctx.createRadialGradient(p.sx, p.sy, R * 0.12, p.sx, p.sy, R);
        g.addColorStop(0, hexA(color, 0.32 * cloudA));
        g.addColorStop(0.55, hexA(color, 0.12 * cloudA));
        g.addColorStop(1, hexA(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, R, 0, Math.PI * 2);
        ctx.fill();
        if (showLabels && p.s > 0.55) {
          ctx.globalAlpha = focusSet ? 0.45 : 0.85;
          ctx.fillStyle = "#cdd6ff";
          ctx.font = "600 13px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(KIND_LABEL[kinds[k]] || kinds[k], p.sx, p.sy - R * 0.62);
          ctx.globalAlpha = 1;
        }
      }
      const proj = nodes.map((n) => ({ n, ...project3(n.x, n.y, n.z, view, cx, cy) }));
      proj.sort((a, b) => b.z - a.z);
      const dim = (n) => focusSet && !focusSet.has(n.id) ? 0.12 : 1;
      const edgeById = new Map(proj.map((p) => [p.n.id, p]));
      for (const e of edges) {
        const a = edgeById.get(e.a), b = edgeById.get(e.b);
        if (!a || !b) continue;
        const related = focusSet && (focusSet.has(e.a) && focusSet.has(e.b));
        ctx.strokeStyle = e.kind === "link" ? "rgba(120,160,255,0.6)" : "rgba(150,165,220,0.3)";
        ctx.globalAlpha = Math.min(0.15 - (a.z + b.z) / 8e3 + 0.55, 0.95) * (focusSet ? related ? 0.9 : 0.06 : 1);
        ctx.lineWidth = (e.kind === "link" ? 1.7 : 0.7) * ((a.s + b.s) / 2);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const p of proj) {
        const n = p.n;
        const r = starRadiusFactor(n.strength) * p.s;
        const color = KIND_COLOR[n.kind] || "#8b95b0";
        const a = starBrightness(n.strength, n.layer) * dim(n);
        if (a <= 0.02) continue;
        const haloR = r * (2.6 + 0.5 * Math.min(n.strength, 4) / 4);
        const halo = ctx.createRadialGradient(p.sx, p.sy, r * 0.3, p.sx, p.sy, haloR);
        halo.addColorStop(0, color + "66");
        halo.addColorStop(1, color + "00");
        ctx.globalAlpha = a * starHalo(n.strength);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, haloR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = a;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fill();
        if (n.strength >= 2) {
          ctx.globalAlpha = a * Math.min(0.9, (n.strength - 2) * 0.4 + 0.3);
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, Math.max(1, r * 0.35), 0, Math.PI * 2);
          ctx.fill();
        }
        if (n.pin) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        if (selectedId === n.id) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (showLabels && p.s > 0.75 && a > 0.5) {
          ctx.fillStyle = "rgba(226,232,255,0.9)";
          ctx.font = "10px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(n.label.slice(0, 12), p.sx, p.sy + r + 12);
        }
        ctx.globalAlpha = 1;
      }
    };
    const tick = (ts) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || started !== true) return;
      if (ts - lastFrame < 33) return;
      lastFrame = ts;
      if (autoRotate && !drag) view.yaw += 21e-4;
      spin += 0.02;
      draw();
    };
    const place = () => {
      for (const n of nodes) {
        const c = centers[clusterOf.get(n.kind)] || centers[0];
        n.x = c.x + (Math.random() - 0.5) * 170;
        n.y = c.y + (Math.random() - 0.5) * 130;
        n.z = c.z + (Math.random() - 0.5) * 170;
      }
    };
    const boot = () => {
      resize();
      if (W > 0 && H > 0 && !started) {
        place();
        relax(320);
        started = true;
        draw();
        return;
      }
      if (started) draw();
    };
    boot();
    if (!started) rafBoot = requestAnimationFrame(boot);
    raf = requestAnimationFrame(tick);
    const ro = new ResizeObserver(() => {
      const bw = W, bh = H;
      resize();
      if (W !== bw || H !== bh) {
        if (!started && W > 0 && H > 0) {
          place();
          relax(320);
          started = true;
        } else if (started) {
          const dx = (W - bw) / 2, dy = (H - bh) / 2;
          for (const n of nodes) {
            n.x += dx;
            n.y += dy;
          }
        }
        draw();
      }
    });
    ro.observe(parent);
    let drag = null;
    const hit = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2, cy = rect.height / 2;
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      let best = null, bestZ = 1e9;
      for (const n of nodes) {
        const p = project3(n.x, n.y, n.z, view, cx, cy);
        const r = starRadiusFactor(n.strength) * p.s + 4;
        const d = (p.sx - mx) ** 2 + (p.sy - my) ** 2;
        if (d <= r * r && p.z < bestZ) {
          best = n;
          bestZ = p.z;
        }
      }
      return best;
    };
    const onDown = (ev) => {
      const n = hit(ev);
      if (n) {
        n.pin = true;
        drag = { mode: "node", node: n, bx: n.x, by: n.y, bz: n.z, sx: ev.clientX, sy: ev.clientY, moved: false };
      } else {
        drag = { mode: "orbit", lx: ev.clientX, ly: ev.clientY, sx: ev.clientX, sy: ev.clientY, moved: false };
      }
      canvas.style.cursor = "grabbing";
    };
    const onMove = (ev) => {
      if (!drag) return;
      if (drag.mode === "node") {
        const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        const rect = canvas.getBoundingClientRect();
        const p = project3(drag.node.x, drag.node.y, drag.node.z, view, rect.width / 2, rect.height / 2);
        if (p.s <= 0) return;
        const k = 1 / p.s;
        const cyw = Math.cos(view.yaw), syw = Math.sin(view.yaw);
        const cp = Math.cos(view.pitch);
        drag.node.x = drag.bx + dx * k * cyw;
        drag.node.z = drag.bz - dx * k * syw;
        drag.node.y = drag.by + dy * k / Math.max(cp, 0.4);
        relax(3);
        draw();
      } else {
        view.yaw += (ev.clientX - drag.lx) * 5e-3;
        view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + (ev.clientY - drag.ly) * 4e-3));
        drag.lx = ev.clientX;
        drag.ly = ev.clientY;
        if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 4) drag.moved = true;
        draw();
      }
    };
    const onUp = () => {
      if (drag) {
        if (drag.mode === "node") {
          drag.node.pin = false;
          if (!drag.moved) onSelect?.(drag.node);
        }
        drag = null;
      }
      canvas.style.cursor = "grab";
    };
    const onWheel = (ev) => {
      ev.preventDefault();
      view.zoom = Math.max(0.35, Math.min(3, view.zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
      draw();
    };
    const onLeave = () => {
      canvas.style.cursor = "grab";
    };
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mouseleave", onLeave);
    canvas.style.cursor = "grab";
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(rafBoot);
      ro.disconnect();
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [data, selectedId, autoRotate, showLabels]);
  if (!data?.nodes?.length) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ml-empty ml-empty-dark", children: "\u8BB0\u5FC6\u8FD8\u592A\u5C11\uFF0C\u753B\u4E0D\u51FA\u661F\u4E91 \u2014\u2014 \u804A\u51E0\u8F6E\u5929\u518D\u6765\u3002" });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ml-graph-inner", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", { ref: canvasRef, className: "ml-graph-canvas" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ml-graph-legend", children: [
      Object.entries(KIND_COLOR).map(([k, c]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: { background: c } }),
        KIND_LABEL[k] || k
      ] }, k)),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ml-dim", children: "\u62D6\u7A7A\u767D\u65CB\u8F6C \xB7 \u62D6\u8282\u70B9\u6574\u7406 \xB7 \u6EDA\u8F6E\u7F29\u653E \xB7 \u5355\u51FB\u805A\u7126" })
    ] })
  ] });
}

// src/client.jsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var PLUGIN_ID = "memory-lattice";
var API = "/memory-lattice/api";
var CSS = `
.ml-root { color: var(--dsw-alias-label-primary, #1f2937); font-size: 13px; }
.ml-tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; }
.ml-tab { border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: transparent; color: inherit;
  border-radius: 8px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
.ml-tab.ml-on { background: var(--dsw-alias-accent, #2563eb) !important; color: #fff !important; border-color: transparent; }
.ml-pane { display: flex; flex-direction: column; gap: 10px; }
.ml-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
.ml-stat { text-align: center; background: linear-gradient(145deg, var(--dsw-alias-bg-layer-1, #fff), var(--dsw-alias-bg-base, #f4f6fb));
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 12px; padding: 10px 4px;
  transition: transform .15s ease, box-shadow .15s ease; }
.ml-stat:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(30,50,120,.1); }
.ml-stat b { display: block; font-size: 20px; line-height: 1.3; }
.ml-stat span { font-size: 11px; opacity: .65; }
.ml-panel { background: var(--dsw-alias-bg-layer-1, #fff); border: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  border-radius: 10px; padding: 12px 14px; }
.ml-panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-weight: 600; }
.ml-bars { display: flex; flex-direction: column; gap: 6px; }
.ml-bar-row { display: grid; grid-template-columns: 84px 1fr 32px; align-items: center; gap: 8px; font-size: 12px; }
.ml-bar { height: 12px; background: var(--dsw-alias-bg-base, #f3f4f6); border-radius: 6px; overflow: hidden; }
.ml-bar i { display: block; height: 100%; border-radius: 6px; transition: width .3s; }
.ml-curve { width: 100%; max-height: 180px; }
.ml-filter { display: flex; gap: 6px; flex-wrap: wrap; }
.ml-filter input[type=text], .ml-filter input:not([type]) { flex: 1; min-width: 140px; padding: 6px 10px;
  border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db);
  background: var(--dsw-alias-bg-base, #f9fafb); color: inherit; font-size: 12px; }
.ml-filter select { padding: 5px 6px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db);
  background: var(--dsw-alias-bg-base, #f9fafb); color: inherit; font-size: 12px; }
.ml-card { background: var(--dsw-alias-bg-layer-1, #fff); border: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  border-radius: 10px; padding: 8px 12px; transition: border-color .15s, box-shadow .15s; }
.ml-card:hover { border-color: var(--dsw-alias-accent, #2563eb); box-shadow: 0 3px 14px rgba(30,50,120,.08); }
.ml-card[data-status=pending] { border-left: 3px solid #F59E0B; }
.ml-card[data-status=sleeping] { opacity: .6; border-left: 3px solid #6B7280; }
.ml-card[data-status=rejected] { opacity: .5; }
.ml-card[data-status=deleted] { opacity: .4; }
.ml-card-head { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.ml-card-title { flex: 1; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ml-kind-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.ml-card-meta { display: flex; gap: 4px; flex: none; }
.ml-chip { font-size: 10px; font-style: normal; padding: 1px 6px; border-radius: 999px;
  background: var(--dsw-alias-bg-base, #f3f4f6); color: var(--dsw-alias-label-secondary, #666); }
.ml-chip-stm { background: rgba(6,182,212,.15); color: #0891b2; }
.ml-chip-pending { background: rgba(245,158,11,.18); color: #b45309; }
.ml-chip-sleeping { background: rgba(107,114,128,.18); }
.ml-card-body { margin-top: 8px; border-top: 1px dashed var(--dsw-alias-border-l1, #e5e7eb); padding-top: 8px; }
.ml-body { white-space: pre-wrap; word-break: break-word; font: inherit; font-size: 12px; margin: 0 0 6px;
  max-height: 220px; overflow: auto; }
.ml-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
.ml-tag { font-size: 10px; padding: 1px 7px; border-radius: 999px; background: rgba(59,130,246,.12); color: var(--dsw-alias-accent, #2563eb); }
.ml-card-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.ml-card-actions button, .ml-panel-head button, .ml-filter button, .ml-actions button, .ml-node-card button, .ml-modal-head button {
  border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: transparent; color: inherit;
  border-radius: 7px; padding: 4px 10px; font-size: 11px; cursor: pointer; }
.ml-card-actions button:hover, .ml-panel-head button:hover, .ml-filter button:hover { opacity: .8; }
.ml-danger { color: #dc2626 !important; border-color: rgba(220,38,38,.4) !important; }
.ml-primary { background: var(--dsw-alias-accent, #2563eb) !important; color: #fff !important; }
.ml-empty { text-align: center; padding: 26px 10px; opacity: .55; font-size: 12px; }
.ml-hint { font-size: 11px; opacity: .6; background: var(--dsw-alias-bg-base, #f9fafb);
  border-radius: 8px; padding: 7px 10px; }
.ml-dim { opacity: .5; font-size: 11px; margin-left: auto; }
.ml-md { background: var(--dsw-alias-bg-layer-1, #fff); border: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  border-radius: 10px; padding: 12px 16px; line-height: 1.65; font-size: 12.5px; }
.ml-md .ml-h { font-weight: 700; margin: 10px 0 4px; }
.ml-md .ml-h:first-child { margin-top: 0; }
.ml-md .ml-h2, .ml-md .ml-h3 { font-size: 13px; border-left: 3px solid var(--dsw-alias-accent, #2563eb); padding-left: 8px; }
.ml-md ul { margin: 4px 0; padding-left: 18px; }
.ml-timeline { display: flex; flex-direction: column; gap: 6px; }
.ml-snap { display: flex; flex-direction: column; gap: 2px; background: var(--dsw-alias-bg-layer-1, #fff);
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 8px; padding: 8px 12px; cursor: pointer; font-size: 12px; }
.ml-snap:hover { border-color: var(--dsw-alias-accent, #2563eb); }
.ml-snap span { opacity: .6; font-size: 11px; }
.ml-snap-view { border-color: var(--dsw-alias-accent, #2563eb); }
.ml-graph-wrap { position: relative; min-height: 320px; height: 420px; background: var(--dsw-alias-bg-layer-1, #fff);
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 12px; overflow: hidden; }
.ml-graph-inner { position: relative; width: 100%; height: 100%; }
.ml-graph-wrap canvas { display: block; width: 100%; height: 100%; }
/* \u661F\u4E91\u7248\uFF1A\u6DF1\u7A7A\u5E95\u8272\u56FA\u5B9A\uFF08\u753B\u5E03\u81EA\u5DF1\u753B\u80CC\u666F\uFF09\uFF0C\u73BB\u7483\u56FE\u4F8B */
.ml-graph-nebula { background: #0a0f1f; border-color: rgba(120,140,220,.25); }
.ml-graph-legend { position: absolute; left: 12px; bottom: 10px; display: flex; gap: 10px; flex-wrap: wrap;
  align-items: center; font-size: 10px; pointer-events: none; color: #aeb8dd;
  background: rgba(10,16,34,.55); backdrop-filter: blur(6px); padding: 4px 10px; border-radius: 8px;
  border: 1px solid rgba(120,140,220,.18); }
.ml-graph-legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px;
  box-shadow: 0 0 6px currentColor; }
.ml-node-card { position: absolute; top: 12px; right: 12px; width: min(280px, 72%);
  display: flex; flex-direction: column; gap: 8px;
  background: rgba(10,16,34,.82); backdrop-filter: blur(10px); border: 1px solid rgba(120,140,220,.3);
  border-radius: 12px; padding: 12px 14px; font-size: 12px; color: #dbe3ff;
  box-shadow: 0 8px 30px rgba(0,0,0,.5); }
.ml-node-card-head { display: flex; align-items: flex-start; gap: 8px; }
.ml-node-card-head b { flex: 1; line-height: 1.4; word-break: break-word; font-size: 13px; }
.ml-node-card-head button { flex: none; color: #dbe3ff !important; border-color: rgba(120,140,220,.4) !important;
  background: transparent !important; width: 22px; height: 22px; padding: 0; line-height: 1; border-radius: 6px; }
.ml-node-card-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.ml-chip { font-size: 10px; padding: 1px 8px; border-radius: 999px; border: 1px solid rgba(150,165,220,.35);
  color: #b9c4ee; font-style: normal; white-space: nowrap; }
.ml-node-card-row { display: flex; align-items: center; gap: 8px; }
.ml-node-card-row > span { opacity: .7; flex: none; }
.ml-node-card-row .ml-bar { flex: 1; height: 6px; border-radius: 999px; background: rgba(255,255,255,.12); overflow: hidden; }
.ml-node-card-row .ml-bar i { display: block; height: 100%; border-radius: 999px; }
.ml-node-card-row b { flex: none; font-variant-numeric: tabular-nums; }
.ml-node-card-tags { font-size: 11px; opacity: .7; word-break: break-word; line-height: 1.5; }
.ml-node-card-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 10px; opacity: .55; }
.ml-graph-tools { display: flex; gap: 6px; }
.ml-graph-tools button { border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: transparent; color: inherit;
  border-radius: 7px; padding: 4px 10px; font-size: 11px; cursor: pointer; }
.ml-graph-tools button:hover { opacity: .85; }
.ml-graph-tools .ml-tgl-on { background: var(--dsw-alias-accent, #2563eb) !important; color: #fff !important; border-color: transparent !important; }
.ml-empty-dark { color: #8b95b0; }
.ml-patrol { white-space: pre-wrap; word-break: break-word; font: 11px/1.6 ui-monospace, monospace; margin: 8px 0 0;
  max-height: 320px; overflow: auto; background: var(--dsw-alias-bg-base, #f9fafb); border-radius: 8px; padding: 10px 12px;
  color: var(--dsw-alias-label-secondary, #555); }
.ml-working-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 5px 0;
  border-bottom: 1px dashed var(--dsw-alias-border-l1, #e5e7eb); font-size: 12px; }
.ml-working-row:last-child { border-bottom: none; }
.ml-working-row button { border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: transparent; color: inherit;
  border-radius: 7px; padding: 3px 10px; font-size: 11px; cursor: pointer; }
/* \u591C\u5DE1\u961F\u5217 */
.ml-q-sec { font-size: 11px; font-weight: 600; opacity: .7; margin: 10px 0 4px; }
.ml-q-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px;
  border-bottom: 1px dashed var(--dsw-alias-border-l1, #e5e7eb); }
.ml-q-row:last-child { border-bottom: none; }
.ml-q-id { opacity: .5; font-variant-numeric: tabular-nums; flex: none; }
.ml-q-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ml-q-meta { opacity: .55; font-size: 11px; flex: none; }
.ml-q-actions { display: flex; gap: 5px; flex: none; align-items: center; }
.ml-q-actions button { border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: transparent; color: inherit;
  border-radius: 7px; padding: 3px 9px; font-size: 11px; cursor: pointer; }
.ml-q-actions button:hover { opacity: .8; }
.ml-q-tag { width: 90px; padding: 3px 8px; border-radius: 7px; font-size: 11px; color: inherit;
  border: 1px solid var(--dsw-alias-border-l2, #d1d5db); background: var(--dsw-alias-bg-base, #f9fafb); }
.ml-diff { font-size: 11.5px; margin: 6px 0 10px; padding: 8px 10px; border-radius: 8px;
  background: var(--dsw-alias-bg-base, #f9fafb); }
.ml-diff-add { color: #0f7b3f; }
.ml-diff-del { color: #b42318; }
.ml-field { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; max-width: 380px; }
.ml-field > span { font-size: 12px; font-weight: 500; }
.ml-field input, .ml-field select { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #d1d5db);
  background: var(--dsw-alias-bg-base, #f9fafb); color: inherit; font-size: 12px; }
.ml-field small { opacity: .5; font-size: 10.5px; }
.ml-field-check { flex-direction: row; align-items: center; gap: 8px; flex-wrap: nowrap; }
.ml-field-check > span { white-space: nowrap; flex: none; }
.ml-field-check small { margin-left: 4px; flex: 1; min-width: 0; }
.ml-actions { margin-top: 10px; }
/* \u4FDD\u7559\u7B56\u7565\uFF1A\u6309\u7C7B\u578B\u7684\u300C\u671F\u9650 + \u6761\u6570\u300D\u53CC\u5217\u8F93\u5165\uFF08\u66FF\u4EE3 "kind:days" \u624B\u5199\u5B57\u7B26\u4E32\uFF09 */
.ml-retention-head { display: grid; grid-template-columns: 68px 1fr 1fr; gap: 6px; font-size: 11px; opacity: .55; padding: 0 8px; }
.ml-retention-head span:not(:first-child) { text-align: right; }
.ml-retention-grid { display: flex; flex-direction: column; gap: 5px; width: 100%; }
.ml-retention-cell { display: grid; grid-template-columns: 68px 1fr 1fr; align-items: center; gap: 6px;
  padding: 4px 8px; font-size: 12px;
  border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #fff); }
.ml-retention-kind { opacity: .8; }
.ml-retention-cell input { width: 100%; min-width: 0; padding: 3px 6px; font-size: 12px; text-align: right;
  border: 1px solid var(--dsw-alias-border-l2, #d1d5db); border-radius: 6px;
  background: var(--dsw-alias-bg-base, #f9fafb); color: inherit; }
.ml-retention-core { opacity: .6; }
.ml-retention-core em { grid-column: 2 / 4; font-style: normal; font-size: 11px; text-align: right; }
/* \u5BFC\u5165 / \u8FC1\u79FB */
.ml-import-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 4px 0; }
.ml-import-row input[type="file"] { font-size: 12px; max-width: 100%; }
.ml-import-row select, .ml-import-row input[type="text"], .ml-import-row input:not([type]) {
  font-size: 12px; padding: 5px 8px; border-radius: 7px; max-width: 100%;
  border: 1px solid var(--dsw-alias-border-l2, #d1d5db);
  background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; }
.ml-import-preview { border: 1px dashed var(--dsw-alias-border-l2, #d1d5db); border-radius: 8px;
  padding: 8px 10px; margin: 6px 0; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
.ml-toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 99999;
  background: rgba(15,20,40,.85); backdrop-filter: blur(8px); color: #e7ecff;
  padding: 8px 18px; border-radius: 999px; font-size: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.35);
  border: 1px solid rgba(120,140,220,.3); }
.ml-sidebar-btn { font-size: 15px; line-height: 1; border: none; background: transparent; cursor: pointer; opacity: .75; padding: 4px; }
.ml-sidebar-btn:hover { opacity: 1; }
/* \u4FA7\u680F footer \u6309\u94AE\uFF1A\u6574\u884C\u5BBD + \u56FE\u6807 + \u6587\u5B57\uFF08footerActions \u5BB9\u5668\u9700\u8981 :has() \u6491\u884C\uFF0C\u5426\u5219\u88AB\u88C1\u5207\uFF09 */
[class*="footerActions"]:has(.ml-footer-btn), :has(> .ml-footer-btn) { width: 100%; }
[class*="footerActions"]:has(.ml-footer-btn) { flex-wrap: wrap; }
.ml-footer-btn { display: flex; align-items: center; gap: 9px; width: 100%; flex: 0 0 auto; min-width: 0;
  padding: 7px 10px; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.14));
  background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04)); color: var(--dsw-alias-label-secondary, #6b7280);
  font: inherit; font-size: 13.5px; line-height: 18px; border-radius: 8px; cursor: pointer; text-align: left; }
.ml-footer-btn:hover { background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.06)); color: var(--dsw-alias-label-primary, #111); }
.ml-footer-btn:active { transform: translateY(.5px); }
.ml-footer-ico { display: inline-flex; flex: none; width: 18px; height: 18px; align-items: center; justify-content: center; font-size: 14px; }
.ml-footer-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ml-modal-mask { position: fixed; inset: 0; background: rgba(8,10,22,.45); backdrop-filter: blur(6px); z-index: 9998;
  display: flex; align-items: flex-start; justify-content: center; padding: 48px 16px 16px; }
.ml-modal { width: min(860px, 96vw); max-height: 86vh; display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-base, #f9fafb); border: 1px solid var(--dsw-alias-border-l1, #e5e7eb);
  border-radius: 16px; box-shadow: 0 18px 60px rgba(0,0,0,.35); overflow: hidden; }
.ml-modal-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px;
  font-weight: 600; border-bottom: 1px solid var(--dsw-alias-border-l1, #e5e7eb); background: var(--dsw-alias-bg-layer-1, #fff); }
.ml-modal-head button { border: none; background: transparent; font-size: 18px; cursor: pointer; color: inherit; }
.ml-modal-body { padding: 14px 16px; overflow: auto; }
/* \u5F39\u7A97\u5185\u753B\u5E03\u7528\u7EDD\u5BF9\u5B9A\u4F4D\u94FA\u6EE1 header \u4EE5\u4E0B\u533A\u57DF \u2014\u2014 \u4E0D\u4F9D\u8D56 vh/flex \u7684\u53C2\u4E0E\u8BA1\u7B97\uFF0C\u4E0D\u53EF\u80FD\u7B97\u77EE */
.ml-graph-modal-bg .ml-modal-head, .ml-modal-graph .ml-modal-head { background: #0a0f1f; color: #dbe3ff; border-color: rgba(120,140,220,.25); }
.ml-modal-graph { position: relative; width: min(1200px, 94vw); height: 86vh; background: #0a0f1f; border-color: rgba(120,140,220,.3); }
.ml-graph-full { position: absolute; top: 45px; left: 0; right: 0; bottom: 0;
  height: auto !important; min-height: 0 !important; border: none; border-top: 1px solid rgba(120,140,220,.25); border-radius: 0; }
`;
var sessionToken = "";
var sessionPromise = null;
async function ensureSession(reset = false) {
  if (reset) sessionToken = "";
  if (sessionToken) return sessionToken;
  if (!sessionPromise) {
    const once = () => fetch(API + "/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    }).then((r) => r.json()).then((d) => d && d.token ? String(d.token) : "").catch(() => "");
    sessionPromise = once().then((t) => t ? t : new Promise((r) => setTimeout(r, 300)).then(once)).then((t) => sessionToken = t || "").finally(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}
async function api(path, opts = {}) {
  const token = await ensureSession();
  const send = (t) => fetch(API + path, {
    credentials: "same-origin",
    ...opts,
    headers: { "Content-Type": "application/json", ...t ? { "X-ML-Token": t } : {} },
    body: opts.body !== void 0 ? JSON.stringify(opts.body) : void 0
  });
  let res = await send(token);
  if (res.status === 401) res = await send(await ensureSession(true));
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, error: "HTTP " + res.status };
  }
  if (!res.ok && data && !data.error) data.error = "HTTP " + res.status;
  return data;
}
var KIND_LABEL2 = { knowledge: "\u77E5\u8BC6", decision: "\u51B3\u7B56", mistake: "\u8E29\u5751", preference: "\u504F\u597D", goal: "\u76EE\u6807", trait: "\u7279\u8D28", event: "\u4E8B\u4EF6", fact: "\u4E8B\u5B9E" };
var KIND_COLOR2 = { knowledge: "#3B82F6", decision: "#10B981", mistake: "#EF4444", preference: "#A855F7", goal: "#F59E0B", trait: "#EC4899", event: "#6B7280", fact: "#06B6D4" };
var STATUS_LABEL = { active: "\u751F\u6548", pending: "\u5F85\u5BA1", sleeping: "\u6C89\u7761", rejected: "\u5DF2\u9A73\u56DE", deleted: "\u56DE\u6536\u7AD9", restore: "\u6062\u590D" };
var LAYER_LABEL = { ltm: "\u957F\u671F", stm: "\u77ED\u671F" };
var SOURCE_LABEL = { manual: "\u4EBA\u5DE5\u624B\u5199", agent: "\u52A9\u624B\u5199\u5165", auto: "\u81EA\u52A8\u6355\u83B7", "auto-fallback": "\u81EA\u52A8\u6355\u83B7\xB7\u964D\u7EA7", promotion: "\u77ED\u671F\u664B\u5347", migration: "\u65E7\u5E93\u8FC1\u79FB" };
var fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 10);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
function NodeInfoCard({ node, neighbors, onClose }) {
  if (!node) return null;
  const color = KIND_COLOR2[node.kind] || "#6B7280";
  const st = Number(node.strength) || 0;
  const stPct = Math.max(4, Math.min(100, st / 4 * 100));
  const barColor = st >= 2 ? "#10B981" : st >= 0.6 ? "#F59E0B" : "#EF4444";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-node-card", style: { borderColor: color + "66" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-node-card-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { style: { color }, children: node.title || node.label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: onClose, "aria-label": "\u5173\u95ED\u4FE1\u606F\u5361", children: "\xD7" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-node-card-chips", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("em", { className: "ml-chip", style: { color, borderColor: color + "66" }, children: KIND_LABEL2[node.kind] || node.kind }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("em", { className: "ml-chip", children: LAYER_LABEL[node.layer] || node.layer }),
      node.status && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("em", { className: "ml-chip", children: STATUS_LABEL[node.status] || node.status }),
      node.source && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("em", { className: "ml-chip", children: SOURCE_LABEL[node.source] || node.source })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-node-card-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u5F3A\u5EA6" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-bar", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", { style: { width: stPct + "%", background: barColor } }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: st.toFixed(2) })
    ] }),
    node.tags && node.tags.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-node-card-tags", children: node.tags.map((t) => "#" + t).join(" ") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-node-card-meta", children: [
      node.created_at ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        "\u521B\u5EFA ",
        fmtDate(node.created_at)
      ] }) : null,
      neighbors > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        "\u5173\u8054 ",
        neighbors,
        " \u6761"
      ] }) : null,
      node.id != null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        "#",
        node.id
      ] }) : null
    ] })
  ] });
}
function mdToHtml(md) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = String(md || "").split("\n");
  const out = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      out.push(`<div class="ml-h ml-h${h[1].length}">${esc(h[2])}</div>`);
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${esc(li[1]).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</li>`);
      continue;
    }
    closeList();
    out.push(`<div class="ml-p">${esc(line).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</div>`);
  }
  closeList();
  return out.join("");
}
function CurveChart({ curve }) {
  const W = 520, H = 160, PAD = 28;
  const pts = (curve || []).filter((c) => c.weeks_ago >= 0 && c.n > 0).slice(0, 5);
  if (!pts.length) return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-empty", children: "\u8FD8\u6CA1\u6709\u53EF\u753B\u7684\u66F2\u7EBF \u2014\u2014 \u957F\u671F\u8BB0\u5FC6\u79EF\u7D2F\u540E\u518D\u770B\u3002" });
  const maxW = Math.max(...pts.map((p) => p.weeks_ago), 4);
  const x = (w) => PAD + w / maxW * (W - PAD * 2);
  const y = (s) => H - PAD - s * (H - PAD * 2);
  const actual = pts.map((p, i) => `${i ? "L" : "M"}${x(p.weeks_ago).toFixed(1)},${y(p.avg_strength).toFixed(1)}`).join(" ");
  const theory = [];
  for (let d = 0; d <= maxW * 7; d += 2) {
    const s = Math.exp(-d / 2.5);
    theory.push(`${theory.length ? "L" : "M"}${x(d / 7).toFixed(1)},${y(s).toFixed(1)}`);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { viewBox: `0 0 ${W} ${H}`, className: "ml-curve", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("line", { x1: PAD, y1: H - PAD, x2: W - PAD, y2: H - PAD, stroke: "var(--dsw-alias-border-l1, #ddd)" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("line", { x1: PAD, y1: PAD, x2: PAD, y2: H - PAD, stroke: "var(--dsw-alias-border-l1, #ddd)" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: theory.join(" "), fill: "none", strokeDasharray: "4 3", stroke: "var(--dsw-alias-border-l2, #aaa)", strokeWidth: "1.2" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: actual, fill: "none", stroke: "var(--dsw-alias-accent, #2563eb)", strokeWidth: "2" }),
    pts.map((p) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("g", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: x(p.weeks_ago), cy: y(p.avg_strength), r: "3.5", fill: "var(--dsw-alias-accent, #2563eb)" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("text", { x: x(p.weeks_ago), y: H - 8, fontSize: "10", textAnchor: "middle", fill: "var(--dsw-alias-label-secondary, #888)", children: [
        p.weeks_ago,
        "\u5468\u524D"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("text", { x: x(p.weeks_ago), y: y(p.avg_strength) - 8, fontSize: "10", textAnchor: "middle", fill: "var(--dsw-alias-label-primary, #333)", children: p.avg_strength })
    ] }, p.weeks_ago)),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("text", { x: PAD + 2, y: 16, fontSize: "10", textAnchor: "start", fill: "var(--dsw-alias-label-secondary, #888)", children: "\u865A\u7EBF = \u65E0\u590D\u4E60\u7684\u7406\u8BBA\u9057\u5FD8\u66F2\u7EBF" })
  ] });
}
function MemoryCard({ m, onAct, selectable }) {
  const [open, setOpen] = (0, import_react2.useState)(false);
  const kindColor = KIND_COLOR2[m.kind] || "#6B7280";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-card", "data-layer": m.layer, "data-status": m.status, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-card-head", onClick: () => setOpen(!open), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-kind-dot", style: { background: kindColor }, title: KIND_LABEL2[m.kind] || m.kind }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-card-title", children: m.title }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-card-meta", children: [
        m.layer === "stm" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("em", { className: "ml-chip ml-chip-stm", children: "\u77ED\u671F" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("em", { className: "ml-chip", title: "\u5F3A\u5EA6 " + m.strength, children: [
          "\u5F3A\u5EA6 ",
          Number(m.strength).toFixed(2)
        ] }),
        m.status !== "active" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("em", { className: "ml-chip ml-chip-" + m.status, children: STATUS_LABEL[m.status] || m.status })
      ] })
    ] }),
    open && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-card-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "ml-body", children: m.body }),
      !!m.tags?.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-tags", children: m.tags.map((t) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-tag", children: t }, t)) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-card-actions", children: [
        m.status === "pending" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => onAct("approve", m), children: "\u901A\u8FC7" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => onAct("reject", m), children: "\u9A73\u56DE" })
        ] }),
        m.status === "active" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => onAct("reinforce", m), children: "\u5F3A\u5316" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => onAct("sleep", m), children: "\u6C89\u7761" })
        ] }),
        m.status === "sleeping" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => onAct("awaken", m), children: "\u5524\u9192" }),
        m.status !== "deleted" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ml-danger", onClick: () => {
          if (!window.confirm("\u79FB\u5230\u56DE\u6536\u7AD9\uFF1F\u5220\u9664\u540E\u4ECD\u53EF\u5728\u300C\u56DE\u6536\u7AD9\u300D\u91CC\u6062\u590D\u3002")) return;
          onAct("delete", m);
        }, children: "\u5220\u9664" }),
        m.status === "deleted" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => onAct("restore", m), children: "\u6062\u590D" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-dim", children: [
          "#",
          m.id,
          " \xB7 ",
          LAYER_LABEL[m.layer],
          " \xB7 ",
          KIND_LABEL2[m.kind] || m.kind,
          " \xB7 ",
          SOURCE_LABEL[m.source] || m.source || "\u2014",
          " \xB7 \u590D\u4E60 ",
          m.review_count,
          " \u6B21 \xB7 \u547D\u4E2D ",
          m.hits,
          m.status === "deleted" && m.deleted_at ? ` \xB7 \u5220\u9664\u4E8E ${String(m.deleted_at).slice(0, 16).replace("T", " ")}` : ""
        ] })
      ] })
    ] })
  ] });
}
function diffLines(oldText, newText) {
  const norm = (t) => String(t || "").split("\n").map((s) => s.trim()).filter((s) => s && !/^#\s/.test(s));
  const a = norm(oldText), b = norm(newText);
  const setA = new Set(a), setB = new Set(b);
  return { added: b.filter((l) => !setA.has(l)), removed: a.filter((l) => !setB.has(l)) };
}
function App({ t }) {
  const [tab, setTab] = (0, import_react2.useState)("overview");
  const [recycleItems, setRecycleItems] = (0, import_react2.useState)([]);
  const [graphFull, setGraphFull] = (0, import_react2.useState)(false);
  const [autoRotate, setAutoRotate] = (0, import_react2.useState)(true);
  const [showLabels, setShowLabels] = (0, import_react2.useState)(true);
  const [ov, setOv] = (0, import_react2.useState)(null);
  const [items, setItems] = (0, import_react2.useState)([]);
  const [reviewItems, setReviewItems] = (0, import_react2.useState)([]);
  const [filter, setFilter] = (0, import_react2.useState)({ layer: "", status: "", kind: "", q: "" });
  const [graphData, setGraphData] = (0, import_react2.useState)(null);
  const [persona, setPersona] = (0, import_react2.useState)(null);
  const [patrol, setPatrol] = (0, import_react2.useState)(null);
  const [patrolOpen, setPatrolOpen] = (0, import_react2.useState)(false);
  const [queue, setQueue] = (0, import_react2.useState)(null);
  const [queueOpen, setQueueOpen] = (0, import_react2.useState)(false);
  const [working, setWorking] = (0, import_react2.useState)([]);
  const [selectedNode, setSelectedNode] = (0, import_react2.useState)(null);
  const [cfg, setCfg] = (0, import_react2.useState)(null);
  const [toast, setToast] = (0, import_react2.useState)("");
  const toastTimer = (0, import_react2.useRef)(null);
  const say = (0, import_react2.useCallback)((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3e3);
  }, []);
  const loadOverview = (0, import_react2.useCallback)(() => api("/overview").then((d) => d.ok && setOv(d)), []);
  const loadPatrol = (0, import_react2.useCallback)(() => api("/patrol").then((d) => d.ok && setPatrol(d)), []);
  const loadWorking = (0, import_react2.useCallback)(() => api("/working").then((d) => d.ok && setWorking(d.items || [])), []);
  const loadQueue = (0, import_react2.useCallback)(() => api("/patrol/queue").then((d) => d.ok && setQueue(d)), []);
  const patrolAct = async (action, payload) => {
    if (action === "delete" && !window.confirm("\u79FB\u5230\u56DE\u6536\u7AD9\uFF1F\u5220\u9664\u540E\u4ECD\u53EF\u5728\u300C\u56DE\u6536\u7AD9\u300D\u91CC\u6062\u590D\u3002")) return;
    const r = await api("/patrol/action", { method: "POST", body: { action, ...payload } });
    say(r.ok ? "\u5DF2\u5904\u7406" : "\u5931\u8D25\uFF1A" + (r.error || "\u672A\u77E5\u9519\u8BEF"));
    loadQueue();
    loadOverview();
    loadPatrol();
    loadWorking();
  };
  const loadList = (0, import_react2.useCallback)(() => {
    const p = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
    api("/list?" + p).then((d) => d.ok && setItems(d.items));
  }, [filter]);
  const loadReview = (0, import_react2.useCallback)(() => api("/list?status=pending").then((d) => d.ok && setReviewItems(d.items)), []);
  const loadGraph = (0, import_react2.useCallback)(() => api("/graph").then((d) => d.ok && setGraphData(d)), []);
  const loadPersona = (0, import_react2.useCallback)(() => api("/persona").then((d) => d.ok && setPersona(d)), []);
  const loadCfg = (0, import_react2.useCallback)(() => api("/config").then((d) => d.ok && setCfg(d)), []);
  const loadRecycle = (0, import_react2.useCallback)(() => api("/list?status=deleted&limit=200").then((d) => d.ok && setRecycleItems(d.items || [])), []);
  (0, import_react2.useEffect)(() => {
    loadOverview();
  }, [loadOverview]);
  (0, import_react2.useEffect)(() => {
    if (tab === "overview") {
      loadPatrol();
      loadWorking();
    }
  }, [tab, loadPatrol, loadWorking]);
  (0, import_react2.useEffect)(() => {
    if (tab === "list") loadList();
  }, [tab, loadList]);
  (0, import_react2.useEffect)(() => {
    if (tab === "review") loadReview();
  }, [tab, loadReview]);
  (0, import_react2.useEffect)(() => {
    if (tab === "graph") loadGraph();
  }, [tab, loadGraph]);
  (0, import_react2.useEffect)(() => {
    if (tab === "persona") loadPersona();
  }, [tab, loadPersona]);
  (0, import_react2.useEffect)(() => {
    if (tab === "config") loadCfg();
  }, [tab, loadCfg]);
  (0, import_react2.useEffect)(() => {
    if (tab === "recycle") loadRecycle();
  }, [tab, loadRecycle]);
  const act = async (action, m) => {
    if (action === "reinforce") return onReinforce(m);
    const r = await api("/audit", { method: "POST", body: { id: m.id, action } });
    say(r.ok ? `#${m.id} ${STATUS_LABEL[action] || action}\u5B8C\u6210` : `\u64CD\u4F5C\u5931\u8D25\uFF1A${r.error}`);
    loadList();
    loadReview();
    loadOverview();
    loadRecycle();
  };
  const onReinforce = async (m) => {
    const r = await api("/reinforce", { method: "POST", body: { id: m.id, quality: 5 } });
    say(r.ok ? `#${m.id} \u5DF2\u5F3A\u5316` : "\u5F3A\u5316\u5931\u8D25");
    loadList();
    loadReview();
    loadOverview();
  };
  const runSweep = async () => {
    const r = await api("/sweep", { method: "POST", body: {} });
    say(r.ok ? `\u6E05\u626B\u5B8C\u6210\uFF1A\u8870\u51CF ${r.stats.decayed} \xB7 \u6C89\u7761 ${r.stats.slept} \xB7 \u664B\u5347 ${r.stats.promoted} \xB7 \u6DD8\u6C70 ${r.stats.expired}` : "\u6E05\u626B\u5931\u8D25\uFF1A" + r.error);
    loadOverview();
  };
  const synthesize = async () => {
    say("\u6B63\u5728\u5408\u6210\u4EBA\u683C\u753B\u50CF\u2026");
    const r = await api("/persona/synthesize", { method: "POST", body: {} });
    say(r.ok ? `\u753B\u50CF v${r.id} \u5DF2\u751F\u6210\uFF08${r.mode === "llm" ? "\u6A21\u578B\u5408\u6210" : "\u672C\u5730\u805A\u5408\u515C\u5E95"}\uFF09${r.note ? " \xB7 " + r.note : ""}` : "\u5408\u6210\u5931\u8D25\uFF1A" + r.error);
    loadPersona();
  };
  const saveCfg = async (patch) => {
    const r = await api("/config", { method: "POST", body: { patch } });
    say(r.ok ? "\u914D\u7F6E\u5DF2\u4FDD\u5B58" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + r.error);
    loadCfg();
  };
  const pendingCount = ov?.totals?.pending ?? 0;
  const recycleCount = ov?.totals?.deleted ?? 0;
  const TABS = [
    ["overview", "\u6982\u89C8"],
    ["list", "\u8BB0\u5FC6"],
    ["review", `\u5BA1\u6838${pendingCount ? ` (${pendingCount})` : ""}`],
    ["persona", "\u4EBA\u683C"],
    ["graph", "\u4E91\u56FE"],
    ["config", "\u914D\u7F6E"],
    ["recycle", `\u56DE\u6536\u7AD9${recycleCount ? ` (${recycleCount})` : ""}`]
  ];
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-root", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-tabs", children: TABS.map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ml-tab" + (tab === id ? " ml-on" : ""), onClick: () => setTab(id), children: label }, id)) }),
    tab === "overview" && ov && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-pane", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-stats", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-stat", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: ov.totals.ltmActive }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u957F\u671F\u8BB0\u5FC6" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-stat", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: ov.totals.stmActive }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u77ED\u671F\u8BB0\u5FC6" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-stat", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: ov.totals.pending }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u5F85\u5BA1\u6838" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-stat", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: ov.due }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u5F85\u590D\u4E60\uFF08\u5230\u671F\uFF09" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-stat", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: ov.totals.sleeping }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u6C89\u7761\u4E2D" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-panel", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-panel-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u8BB0\u5FC6\u5F3A\u5EA6\u5206\u5E03\uFF08\u957F\u671F\uFF09" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: runSweep, children: "\u7ACB\u5373\u6E05\u626B" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-bars", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-bar-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u5F3A (\u22652)" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-bar", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", { style: { width: pct(ov.strengthBuckets.high, ov.totals.ltmActive), background: "#10B981" } }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: ov.strengthBuckets.high })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-bar-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u4E2D (0.6-2)" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-bar", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", { style: { width: pct(ov.strengthBuckets.mid, ov.totals.ltmActive), background: "#F59E0B" } }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: ov.strengthBuckets.mid })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-bar-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u5F31 (\u22640.6)" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-bar", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", { style: { width: pct(ov.strengthBuckets.low, ov.totals.ltmActive), background: "#EF4444" } }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: ov.strengthBuckets.low })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-panel", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-panel-head", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u9057\u5FD8\u66F2\u7EBF\uFF08\u8FD1 30 \u5929\u5B9E\u9645\u5F3A\u5EA6\uFF09" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CurveChart, { curve: ov.curve })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-panel", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-panel-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
            "\u591C\u5DE1 \xB7 ",
            patrol?.latest?.day || "\u8FD8\u6CA1\u6709\u62A5\u544A"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-graph-tools", children: [
            patrol?.latest && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => setPatrolOpen(!patrolOpen), children: patrolOpen ? "\u6536\u8D77" : "\u67E5\u770B\u62A5\u544A" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: async () => {
              if (!queueOpen) loadQueue();
              setQueueOpen(!queueOpen);
            }, children: queueOpen ? "\u6536\u8D77\u961F\u5217" : "\u5904\u7406\u961F\u5217" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: async () => {
              const r = await api("/patrol", { method: "POST", body: {} });
              say(r.ok ? "\u591C\u5DE1\u5B8C\u6210\uFF1A" + r.summary : "\u591C\u5DE1\u5931\u8D25");
              loadPatrol();
              loadOverview();
              if (queueOpen) loadQueue();
            }, children: "\u7ACB\u5373\u591C\u5DE1" })
          ] })
        ] }),
        patrol?.latest ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-hint", children: patrol.latest.summary }),
          patrolOpen && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "ml-patrol", children: patrol.content })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-empty", children: "\u6BCF\u5929 18 \u70B9\u540E\u81EA\u52A8\u751F\u6210\uFF08\u4E5F\u53EF\u4EE5\u70B9\u300C\u7ACB\u5373\u591C\u5DE1\u300D\uFF09" })
      ] }),
      queueOpen && queue && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-panel", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-panel-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
            "\u591C\u5DE1\u961F\u5217 \xB7 \u53EF\u76F4\u63A5\u5904\u7406",
            queue.truncated ? `\uFF08\u53EA\u626B\u6700\u8FD1 ${queue.scanLimit} \u6761\uFF09` : ""
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: loadQueue, children: "\u5237\u65B0" })
        ] }),
        !queue.neverHit.length && !queue.dups.length && !queue.conflicts.length && !queue.fading.length && !queue.unclassified.length ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-empty", children: "\u961F\u5217\u662F\u7A7A\u7684 \u2713" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          !!queue.neverHit.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-sec", children: [
              "\u4E45\u672A\u547D\u4E2D\uFF08",
              queue.neverHit.length,
              "\uFF09\xB7 \u6CA1\u88AB\u7528\u8FC7\u7684\u8BB0\u5FC6"
            ] }),
            queue.neverHit.map((it) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-q-id", children: [
                "#",
                it.id
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-q-title", children: it.title }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-q-actions", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => patrolAct("strengthen", { ids: [it.id] }), children: "\u7559\u7528\xB7\u5F3A\u5316" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ml-danger", onClick: () => patrolAct("delete", { ids: [it.id] }), children: "\u5220\u9664" })
              ] })
            ] }, it.id))
          ] }),
          !!queue.dups.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-sec", children: [
              "\u7591\u4F3C\u91CD\u590D\uFF08",
              queue.dups.length,
              " \u5BF9\uFF09\xB7 \u9009\u4E00\u6761\u4FDD\u7559\uFF0C\u53E6\u4E00\u6761\u5F52\u6863"
            ] }),
            queue.dups.map((p) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-q-title", children: [
                "#",
                p.a.id,
                " ",
                p.a.title,
                " \u2194 #",
                p.b.id,
                " ",
                p.b.title
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-q-actions", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => patrolAct("merge", { keep: p.a.id, ids: [p.a.id, p.b.id] }), children: "\u4FDD\u7559 A" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => patrolAct("merge", { keep: p.b.id, ids: [p.a.id, p.b.id] }), children: "\u4FDD\u7559 B" })
              ] })
            ] }, p.a.id + "-" + p.b.id))
          ] }),
          !!queue.conflicts.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-sec", children: [
              "\u77DB\u76FE\u5019\u9009\uFF08",
              queue.conflicts.length,
              " \u5BF9\uFF09\xB7 \u53E3\u5F84\u76F8\u53CD\uFF0C\u9009\u4E00\u6761\u7559\u4E0B"
            ] }),
            queue.conflicts.map((p) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-q-title", children: [
                "#",
                p.a.id,
                " ",
                p.a.title,
                " \u2194 #",
                p.b.id,
                " ",
                p.b.title
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-q-actions", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => patrolAct("delete", { ids: [p.b.id] }), children: "\u5220 B" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => patrolAct("delete", { ids: [p.a.id] }), children: "\u5220 A" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => patrolAct("sleep", { ids: [p.a.id, p.b.id] }), children: "\u90FD\u5148\u7761" })
              ] })
            ] }, p.a.id + "-" + p.b.id))
          ] }),
          !!queue.fading.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-sec", children: [
              "\u5C06\u88AB\u9057\u5FD8\uFF08",
              queue.fading.length,
              "\uFF09\xB7 \u5F3A\u5EA6\u4F4E\uFF0C\u5FEB\u8981\u6C89\u7761"
            ] }),
            queue.fading.map((it) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-q-id", children: [
                "#",
                it.id
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-q-title", children: it.title }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-q-actions", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => patrolAct("strengthen", { ids: [it.id] }), children: "\u5F3A\u5316" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => patrolAct("sleep", { ids: [it.id] }), children: "\u4EFB\u5B83\u7761" })
              ] })
            ] }, it.id))
          ] }),
          !!queue.unclassified.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-sec", children: [
              "\u672A\u5F52\u7C7B\uFF08",
              queue.unclassified.length,
              "\uFF09\xB7 \u8865\u4E2A\u6807\u7B7E\u5C31\u80FD\u8FDB\u4E91\u56FE"
            ] }),
            queue.unclassified.map((it) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-q-id", children: [
                "#",
                it.id
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-q-title", children: it.title }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-q-actions", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "input",
                {
                  className: "ml-q-tag",
                  placeholder: "\u6807\u7B7E",
                  onKeyDown: (e) => {
                    if (e.key === "Enter" && e.target.value.trim()) patrolAct("tag", { ids: [it.id], tag: e.target.value.trim() });
                  }
                }
              ) })
            ] }, it.id))
          ] })
        ] })
      ] }),
      !!working.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-panel", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-panel-head", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u5F85\u529E / \u627F\u8BFA\uFF08\u5DE5\u4F5C\u8BB0\u5FC6\uFF09" }) }),
        working.map((w) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-working-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
            w.suggested ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("em", { className: "ml-chip ml-chip-pending", children: "\u5EFA\u8BAE" }) : null,
            w.kind === "promise" ? "\u7B54\u5E94\u8FC7" : "\u5F85\u529E",
            "\uFF1A",
            w.text
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-q-actions", children: w.suggested ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: async () => {
              await api("/working", { method: "POST", body: { action: "confirm", id: w.id } });
              loadWorking();
            }, children: "\u4FDD\u7559" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ml-danger", onClick: async () => {
              await api("/working", { method: "POST", body: { action: "drop", id: w.id } });
              loadWorking();
            }, children: "\u5FFD\u7565" })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: async () => {
            await api("/working", { method: "POST", body: { action: "complete", text: w.text } });
            loadWorking();
          }, children: "\u5B8C\u6210" }) })
        ] }, w.id))
      ] })
    ] }),
    tab === "list" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-pane", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-filter", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { placeholder: "\u641C\u7D22\u8BB0\u5FC6\u2026", value: filter.q, onChange: (e) => setFilter({ ...filter, q: e.target.value }), onKeyDown: (e) => e.key === "Enter" && loadList() }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { value: filter.layer, onChange: (e) => setFilter({ ...filter, layer: e.target.value }), children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: "\u5168\u90E8\u5C42\u6B21" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "ltm", children: "\u957F\u671F" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "stm", children: "\u77ED\u671F" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { value: filter.status, onChange: (e) => setFilter({ ...filter, status: e.target.value }), children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: "\u751F\u6548\u4E2D" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "active", children: "\u751F\u6548" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "pending", children: "\u5F85\u5BA1" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "sleeping", children: "\u6C89\u7761" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "rejected", children: "\u5DF2\u9A73\u56DE" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { value: filter.kind, onChange: (e) => setFilter({ ...filter, kind: e.target.value }), children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: "\u5168\u90E8\u7C7B\u578B" }),
          Object.entries(KIND_LABEL2).map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: k, children: v }, k))
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: loadList, children: "\u67E5\u8BE2" })
      ] }),
      items.length ? items.map((m) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MemoryCard, { m, selectable: true, onAct: (a, mm) => a === "reinforce" ? onReinforce(mm) : act(a, mm) }, m.id)) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-empty", children: "\u6CA1\u6709\u5339\u914D\u7684\u8BB0\u5FC6" })
    ] }),
    tab === "recycle" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-pane", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-hint", children: "\u56DE\u6536\u7AD9\u91CC\u7684\u8BB0\u5FC6\u8FD8\u6CA1\u88AB\u771F\u6B63\u5220\u6389 \u2014\u2014 \u70B9\u300C\u6062\u590D\u300D\u4F1A\u56DE\u5230\u5220\u9664\u524D\u7684\u72B6\u6001\uFF08\u6C89\u7761\u8FC7\u7684\u56DE\u6C89\u7761\uFF0C\u5426\u5219\u56DE\u751F\u6548\uFF09\u3002\u5F7B\u5E95\u6E05\u9664\u76EE\u524D\u53EA\u6709\u914D\u7F6E\u9875\u7684\u300C\u6E05\u7A7A\u8BB0\u5FC6\u5E93\u300D\u3002" }),
      recycleItems.length ? recycleItems.map((m) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MemoryCard, { m, onAct: act }, m.id)) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-empty", children: "\u56DE\u6536\u7AD9\u662F\u7A7A\u7684 \u2713" })
    ] }),
    tab === "review" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-pane", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-hint", children: "\u957F\u671F\u8BB0\u5FC6\u5199\u5165\u4E0E\u664B\u5347\u90FD\u8981\u8FC7\u8FD9\u91CC\uFF1A\u901A\u8FC7 \u2192 \u751F\u6548\u53C2\u4E0E\u53EC\u56DE\uFF1B\u9A73\u56DE \u2192 \u8FDB\u5DF2\u9A73\u56DE\uFF08\u53EF\u91CD\u65B0\u63D0\u4EA4\uFF09\u3002" }),
      reviewItems.length ? reviewItems.map((m) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MemoryCard, { m, onAct: act }, m.id)) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-empty", children: "\u5BA1\u6838\u961F\u5217\u662F\u7A7A\u7684 \u2713" })
    ] }),
    tab === "persona" && persona && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-pane", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-panel-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          "\u5F53\u524D\u753B\u50CF ",
          persona.current ? persona.current.exact ? `\uFF08\u5FEB\u7167 ${persona.current.createdAt.slice(0, 10)}\uFF09` : "\uFF08\u5B9E\u65F6\u805A\u5408\uFF0C\u5C1A\u672A\u5FEB\u7167\uFF09" : ""
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: synthesize, children: "\u7ACB\u5373\u5408\u6210" })
      ] }),
      persona.current ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-md", dangerouslySetInnerHTML: { __html: mdToHtml(persona.current.content) } }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-empty", children: "\u8FD8\u6CA1\u6709\u753B\u50CF \u2014\u2014 \u7B49\u957F\u671F\u8BB0\u5FC6\u91CC\u51FA\u73B0\u7279\u8D28/\u504F\u597D/\u76EE\u6807\u7C7B\u5185\u5BB9\u540E\u5408\u6210\u3002" }),
      (!!persona.evidence?.length || !!persona.excludedEvidence?.length) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-panel", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-panel-head", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          "\u753B\u50CF\u8BC1\u636E\uFF08",
          persona.evidence?.length || 0,
          " \u6761\u5728\u7528\uFF09"
        ] }) }),
        (persona.evidence || []).map((e) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-q-id", children: [
            "#",
            e.id
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-q-title", children: e.title }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-q-meta", children: [
            KIND_LABEL2[e.kind] || e.kind,
            " \xB7 \u5F3A\u5EA6",
            e.strength
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-q-actions", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: async () => {
            const r = await api("/persona/exclude", { method: "POST", body: { id: e.id } });
            say(r.ok ? "\u5DF2\u4ECE\u753B\u50CF\u6392\u9664" : "\u64CD\u4F5C\u5931\u8D25");
            loadPersona();
          }, children: "\u5426\u5B9A\u8FD9\u6761" }) })
        ] }, e.id)),
        !!persona.excludedEvidence?.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-sec", children: [
            "\u5DF2\u6392\u9664\uFF08",
            persona.excludedEvidence.length,
            "\uFF09\xB7 \u4E0D\u53C2\u4E0E\u4E0B\u6B21\u5408\u6210"
          ] }),
          persona.excludedEvidence.map((e) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-q-id", children: [
              "#",
              e.id
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-q-title", children: e.title }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-q-actions", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: async () => {
              const r = await api("/persona/exclude", { method: "POST", body: { id: e.id, exclude: false } });
              say(r.ok ? "\u5DF2\u6062\u590D" : "\u64CD\u4F5C\u5931\u8D25");
              loadPersona();
            }, children: "\u6062\u590D" }) })
          ] }, e.id))
        ] })
      ] }),
      !!persona.timeline?.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-panel-head", style: { marginTop: 14 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          "\u6210\u957F\u65F6\u95F4\u7EBF\uFF08",
          persona.timeline.length,
          " \u7248\uFF09"
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-timeline", children: persona.timeline.map((s) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-snap", onClick: async () => {
          const d = await api("/persona/snapshot?id=" + s.id);
          if (d.ok) setPersona((p) => ({ ...p, viewing: d.snapshot, viewingEvidence: d.evidence || [] }));
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("b", { children: [
            "v",
            persona.timeline.length - persona.timeline.indexOf(s),
            " \xB7 ",
            s.created_at.slice(0, 16).replace("T", " ")
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
            s.trigger,
            " \xB7 \u7D20\u6750 ",
            s.memory_count,
            " \u6761 \xB7 ",
            s.summary.slice(0, 40),
            "\u2026"
          ] })
        ] }, s.id)) }),
        persona.viewing && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-md ml-snap-view", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-panel-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
              "\u5386\u53F2\u5FEB\u7167 #",
              persona.viewing.id
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => setPersona((p) => ({ ...p, viewing: null })), children: "\u5173\u95ED" })
          ] }),
          persona.current && (() => {
            const d = diffLines(persona.viewing.content, persona.current.content);
            return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-diff", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                "\u4E0E\u5F53\u524D\u7248\u672C\u7684\u5DEE\u5F02\uFF1A\u65B0\u589E ",
                d.added.length,
                " \u884C \xB7 \u6D88\u5931 ",
                d.removed.length,
                " \u884C"
              ] }),
              d.added.slice(0, 5).map((l, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-diff-add", children: [
                "+ ",
                l
              ] }, "a" + i)),
              d.removed.slice(0, 5).map((l, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-diff-del", children: [
                "\u2212 ",
                l
              ] }, "r" + i))
            ] });
          })(),
          !!persona.viewingEvidence?.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-evidence", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-sec", children: [
              "\u8FD9\u7248\u753B\u50CF\u7684\u8BC1\u636E\u94FE\uFF08",
              persona.viewingEvidence.length,
              " \u6761\uFF09"
            ] }),
            persona.viewingEvidence.map((e) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-q-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-q-id", children: [
                "#",
                e.id
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-q-title", children: e.title }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-q-meta", children: [
                KIND_LABEL2[e.kind] || e.kind,
                " \xB7 ",
                SOURCE_LABEL[e.source] || e.source || "\u2014",
                " \xB7 \u5F3A\u5EA6",
                e.strength,
                " \xB7 ",
                "\u547D\u4E2D",
                e.hits,
                " \xB7 \u786E\u8BA4",
                e.confirmed,
                "\u6B21",
                e.lastReview ? ` \xB7 \u590D\u4E60\u4E8E ${String(e.lastReview).slice(0, 10)}` : ""
              ] })
            ] }, e.id))
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { dangerouslySetInnerHTML: { __html: mdToHtml(persona.viewing.content) } })
        ] })
      ] })
    ] }),
    tab === "graph" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-pane", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-panel-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          "\u8BB0\u5FC6\u661F\u4E91 \xB7 ",
          graphData?.nodes?.length ?? 0,
          " \u8282\u70B9"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-graph-tools", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: autoRotate ? "ml-tgl-on" : "", onClick: () => setAutoRotate(!autoRotate), children: autoRotate ? "\u25C9 \u81EA\u8F6C" : "\u25CB \u81EA\u8F6C" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: showLabels ? "ml-tgl-on" : "", onClick: () => setShowLabels(!showLabels), children: showLabels ? "\u25C9 \u6807\u7B7E" : "\u25CB \u6807\u7B7E" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => setGraphFull(true), children: "\u653E\u5927\u67E5\u770B" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-graph-wrap ml-graph-nebula", style: { height: 500 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(NebulaGraph, { data: graphData, onSelect: setSelectedNode, selectedId: selectedNode?.id, autoRotate, showLabels }),
        selectedNode && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          NodeInfoCard,
          {
            node: selectedNode,
            neighbors: graphData?.edges ? graphData.edges.filter((e) => e.a === selectedNode.id || e.b === selectedNode.id).length : 0,
            onClose: () => setSelectedNode(null)
          }
        )
      ] }),
      graphFull && (0, import_react_dom.createPortal)(
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-modal-mask", onClick: (e) => {
          if (e.target === e.currentTarget) setGraphFull(false);
        }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-modal ml-modal-graph", "data-windows-titlebar": true, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-modal-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u8BB0\u5FC6\u661F\u4E91" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => setGraphFull(false), children: "\xD7" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-graph-wrap ml-graph-full ml-graph-nebula", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(NebulaGraph, { data: graphData, onSelect: setSelectedNode, selectedId: selectedNode?.id, autoRotate, showLabels }),
            selectedNode && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              NodeInfoCard,
              {
                node: selectedNode,
                neighbors: graphData?.edges ? graphData.edges.filter((e) => e.a === selectedNode.id || e.b === selectedNode.id).length : 0,
                onClose: () => setSelectedNode(null)
              }
            )
          ] })
        ] }) }),
        document.body
      )
    ] }),
    tab === "config" && cfg && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ConfigForm, { cfg, onSave: saveCfg, onImported: () => {
      loadOverview();
      loadList();
      loadCfg();
    } }),
    toast && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-toast", children: toast })
  ] });
}
function pct(v, total) {
  return total ? Math.min(100, Math.round(v / total * 100)) + "%" : "0%";
}
function ConfigForm({ cfg, onSave, onImported }) {
  const s = cfg.settings || {};
  const [form, setForm] = (0, import_react2.useState)({
    autoCapture: s.autoCapture !== false,
    autoRecall: s.autoRecall !== false,
    distillEnabled: s.distillEnabled === true,
    decayEnabled: s.decayEnabled !== false,
    personaEnabled: s.personaEnabled !== false,
    auditMode: s.auditMode === "none" ? "none" : "all",
    captureProvider: s.captureProvider || "",
    captureModel: s.captureModel || "",
    stmTtlHours: s.stmTtlHours ?? 48,
    maxPerDay: s.maxPerDay ?? 80,
    captureMinChars: s.captureMinChars ?? 200,
    dedupThreshold: s.dedupThreshold ?? 0.85,
    recallLimit: s.recallLimit ?? 5,
    personaIntervalHours: s.personaIntervalHours ?? 24,
    personaAutoSynth: s.personaAutoSynth === true,
    personaProvider: s.personaProvider || "",
    personaModel: s.personaModel || "",
    retentionPolicy: s.retentionPolicy ?? "event:90,knowledge:365",
    retentionCounts: s.retentionCounts ?? "",
    maxMemories: s.maxMemories ?? 2e4,
    conflictAutoResolve: s.conflictAutoResolve === true,
    semanticRecall: s.semanticRecall === true,
    vectorRecall: s.vectorRecall !== false
  });
  const [providers, setProviders] = (0, import_react2.useState)([]);
  const [providerNote, setProviderNote] = (0, import_react2.useState)("");
  (0, import_react2.useEffect)(() => {
    api("/providers").then((d) => {
      if (d.ok) {
        setProviders(d.providers || []);
        setProviderNote(d.note || (d.providers?.length ? "" : "\u5BBF\u4E3B\u6CA1\u6709\u53EF\u7528\u7684\u6A21\u578B Provider"));
      }
    });
  }, []);
  const models = providers.find((p) => p.id === form.captureProvider)?.models || [];
  const personaModels = providers.find((p) => p.id === form.personaProvider)?.models || [];
  const num = (k, label, hint) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "ml-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "number", value: form[k], onChange: (e) => setForm({ ...form, [k]: Number(e.target.value) }) }),
    hint && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: hint })
  ] });
  const bool = (k, label, hint) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "ml-field ml-field-check", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.checked }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: label }),
    hint && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: hint })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-pane", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u5BA1\u6838\u6A21\u5F0F" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { value: form.auditMode, onChange: (e) => setForm({ ...form, auditMode: e.target.value }), children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "all", children: "all \u2014\u2014 \u957F\u671F\u8BB0\u5FC6\u5168\u90E8\u8FDB\u5BA1\u6838\u4E2D\u5FC3\uFF08\u63A8\u8350\uFF09" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "none", children: "none \u2014\u2014 \u5168\u90E8\u514D\u5BA1\u76F4\u8FBE" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: "\u77ED\u671F\u8BB0\u5FC6\u6C38\u8FDC\u514D\u5BA1\uFF0848h \u751F\u547D\u671F\u7684\u8349\u7A3F\u5C42\uFF09" })
    ] }),
    bool("autoCapture", "\u81EA\u52A8\u6355\u83B7", "\u6BCF\u8F6E\u5BF9\u8BDD\u7ED3\u675F\u628A\u503C\u5F97\u8BB0\u7684\u5185\u5BB9\u5199\u8FDB\u77ED\u671F\u8BB0\u5FC6\uFF08\u672C\u5730\uFF0C\u4E0D\u51FA\u7F51\uFF09"),
    bool("distillEnabled", "LLM \u84B8\u998F\uFF08\u4F1A\u51FA\u7AD9\uFF09", "\u5F00\u542F\u540E\u6BCF\u8F6E\u628A\u6700\u591A 12,000 \u5B57\u5BF9\u8BDD\u53D1\u7ED9\u4F60\u6307\u5B9A\u7684\u6A21\u578B Provider \u505A\u538B\u7F29\uFF1B\u9ED8\u8BA4\u5173\u95ED"),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "ml-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u84B8\u998F Provider" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "select",
        {
          value: form.captureProvider,
          disabled: !form.distillEnabled,
          onChange: (e) => setForm({ ...form, captureProvider: e.target.value, captureModel: "" }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: "\uFF08\u672A\u9009\u62E9 \xB7 \u4E0D\u51FA\u7AD9\uFF09" }),
            providers.map((p) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: p.id, children: p.name }, p.id))
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: providerNote || "\u5F00\u542F\u84B8\u998F\u540E\u5FC5\u987B\u9009\u4E00\u4E2A\uFF1B\u672A\u9009\u65F6\u63D2\u4EF6\u4E0D\u4F1A\u53D1\u51FA\u4EFB\u4F55\u8BF7\u6C42" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "ml-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u84B8\u998F\u6A21\u578B\uFF08\u53EF\u9009\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "select",
        {
          value: form.captureModel,
          disabled: !form.distillEnabled || !models.length,
          onChange: (e) => setForm({ ...form, captureModel: e.target.value }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: "\uFF08\u7528\u8BE5 Provider \u7684\u9ED8\u8BA4\u6A21\u578B\uFF09" }),
            models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: m.id, children: m.name }, m.id))
          ]
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-hint", children: "\u9690\u79C1\u8FB9\u754C\uFF1A\u81EA\u52A8\u6355\u83B7\u7684\u539F\u6587\u53EA\u7559\u5728\u672C\u5730\u77ED\u671F\u5C42\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u62FC\u8FDB\u7CFB\u7EDF\u63D0\u793A\uFF1B\u53EA\u6709\u7ECF\u4F60\u5728\u5BA1\u6838\u4E2D\u5FC3\u6279\u51C6\u7684\u957F\u671F\u8BB0\u5FC6\u624D\u4F1A\u88AB\u6CE8\u5165\uFF08\u514D\u5BA1\u6A21\u5F0F\u4E0B\u4E5F\u4F1A\u6392\u9664\u81EA\u52A8\u6765\u6E90\uFF09\u3002 \u84B8\u998F\u5173\u95ED\u65F6\u96F6\u51FA\u7AD9\uFF1B\u5F00\u542F\u4F46\u672A\u9009 Provider \u65F6\u540C\u6837\u4E0D\u51FA\u7AD9\u3002" }),
    bool("autoRecall", "\u81EA\u52A8\u53EC\u56DE\u6CE8\u5165", "systemPrompt \u6CE8\u5165\u8BB0\u5FC6\u89C4\u5219\u3001\u5F85\u529E\u4E0E\u4EBA\u683C\u753B\u50CF\uFF08\u4EC5\u53EF\u4FE1\u8BB0\u5FC6\uFF09"),
    bool("decayEnabled", "\u9057\u5FD8\u8870\u51CF", "\u5173\u95ED\u540E\u8BB0\u5FC6\u4E0D\u518D\u6C89\u7761\uFF08\u4E0D\u63A8\u8350\uFF0C\u5C31\u6CA1\u6709\u300C\u9057\u5FD8\u300D\u4E86\uFF09"),
    bool("personaEnabled", "\u4EBA\u683C\u753B\u50CF", "\u4ECE\u957F\u671F\u8BB0\u5FC6\u6301\u7EED\u5408\u6210\u7528\u6237\u753B\u50CF\u5E76\u6CE8\u5165\u4F1A\u8BDD"),
    num("stmTtlHours", "\u77ED\u671F\u8BB0\u5FC6\u751F\u547D\u671F\uFF08\u5C0F\u65F6\uFF09"),
    num("maxPerDay", "\u6BCF\u65E5\u5199\u5165\u4E0A\u9650"),
    num("captureMinChars", "\u6355\u83B7\u6700\u5C0F\u5BF9\u8BDD\u5B57\u6570"),
    num("dedupThreshold", "\u53BB\u91CD\u9608\u503C (0-1)", "\u4E0E\u5DF2\u6709\u8BB0\u5FC6\u76F8\u4F3C\u5EA6\u8D85\u8FC7\u5B83\u5C31\u8FFD\u52A0\u800C\u4E0D\u662F\u65B0\u5EFA"),
    num("recallLimit", "\u53EC\u56DE\u6761\u6570\u4E0A\u9650"),
    num("personaIntervalHours", "\u4EBA\u683C\u5408\u6210\u95F4\u9694\uFF08\u5C0F\u65F6\uFF09"),
    bool("personaAutoSynth", "LLM \u5408\u6210\u4EBA\u683C\uFF08\u4F1A\u51FA\u7AD9\uFF09", "\u5F00\u542F\u540E\u6309\u95F4\u9694\u628A\u753B\u50CF\u7D20\u6750\u53D1\u7ED9\u4F60\u4E0B\u9762\u6307\u5B9A\u7684 Provider\uFF1B\u9ED8\u8BA4\u5173 \u2014\u2014 \u5173\u7740\u65F6\u53EA\u8DD1\u672C\u5730\u89C4\u5219\u515C\u5E95\uFF0C\u96F6\u51FA\u7AD9"),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "ml-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u4EBA\u683C Provider" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "select",
        {
          value: form.personaProvider,
          disabled: !form.personaAutoSynth,
          onChange: (e) => setForm({ ...form, personaProvider: e.target.value, personaModel: "" }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: "\uFF08\u672A\u9009\u62E9 \xB7 \u53EA\u8DD1\u672C\u5730\u515C\u5E95\uFF09" }),
            providers.map((p) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: p.id, children: p.name }, p.id))
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: form.personaAutoSynth ? "\u5FC5\u987B\u9009\u4E00\u4E2A\uFF0C\u5426\u5219\u6BCF\u6B21\u5408\u6210\u90FD\u9000\u56DE\u672C\u5730\u515C\u5E95" : "\u672A\u5F00\u542F LLM \u5408\u6210\uFF0C\u6B64\u9879\u4E0D\u751F\u6548" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "ml-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u4EBA\u683C\u6A21\u578B\uFF08\u53EF\u9009\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "select",
        {
          value: form.personaModel,
          disabled: !form.personaAutoSynth || !personaModels.length,
          onChange: (e) => setForm({ ...form, personaModel: e.target.value }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: "\uFF08\u7528\u8BE5 Provider \u7684\u9ED8\u8BA4\u6A21\u578B\uFF09" }),
            personaModels.map((m) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: m.id, children: m.name }, m.id))
          ]
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      RetentionGrid,
      {
        daysText: form.retentionPolicy,
        countsText: form.retentionCounts,
        onChangeDays: (v) => setForm({ ...form, retentionPolicy: v }),
        onChangeCounts: (v) => setForm({ ...form, retentionCounts: v })
      }
    ),
    num("maxMemories", "\u8BB0\u5FC6\u5E93\u5BB9\u91CF\u4E0A\u9650", "\u8D85\u8FC7\u540E\u4ECE\u300C\u6700\u5F31\u4E14\u6CA1\u88AB\u7528\u8FC7\u300D\u7684\u5F00\u59CB\u6DD8\u6C70\uFF08\u6838\u5FC3\u5C42\u8C41\u514D\uFF09\uFF1B0 = \u4E0D\u9650"),
    bool("conflictAutoResolve", "\u77DB\u76FE\u81EA\u52A8\u88C1\u51B3", "\u591C\u5DE1\u65F6\u628A\u300C0 \u547D\u4E2D\u4E14\u5F3A\u5EA6 < 1\u300D\u7684\u77DB\u76FE\u4E00\u65B9\u7F6E\u4E3A\u6C89\u7761\uFF08\u53EF\u5524\u9192\uFF09\uFF1B\u9ED8\u8BA4\u5173"),
    bool("vectorRecall", "\u672C\u5730\u5411\u91CF\u8BED\u4E49\u53EC\u56DE", "\u5206\u5E03\u8BBA\u5411\u91CF\uFF08\u672C\u5730\u8BA1\u7B97\u3001\u96F6\u51FA\u7AD9\uFF09\uFF1A\u8865\u300C\u6362\u4E2A\u8BF4\u6CD5\u3001\u5B57\u9762\u4E0D\u6CBE\u8FB9\u300D\u7684\u53EC\u56DE\u6B7B\u89D2"),
    bool("semanticRecall", "\u6A21\u578B\u6269\u5199\u53EC\u56DE\uFF08\u4F1A\u51FA\u7AD9\uFF09", "memory_recall \u7ED3\u679C\u4E0D\u8DB3\u65F6\u7528\u6A21\u578B\u6539\u5199\u67E5\u8BE2\uFF1B\u9700\u5148\u9009 Provider\uFF0C\u9ED8\u8BA4\u5173"),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ImportPanel, { onDone: onImported }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BackupPanel, {}),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ml-primary", onClick: () => onSave(form), children: "\u4FDD\u5B58\u914D\u7F6E" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ml-danger", onClick: async () => {
        if (!window.confirm("\u5C06\u786C\u5220\u9664\u5168\u90E8\u8BB0\u5FC6\u3001\u4EBA\u683C\u5FEB\u7167\u3001\u5F85\u529E\u4E0E\u5BA1\u8BA1\u65E5\u5FD7\uFF0C\u4E14\u4E0D\u53EF\u6062\u590D\u3002\u786E\u5B9A\u6E05\u7A7A\uFF1F")) return;
        const r = await api("/wipe", { method: "POST", body: { confirm: "CLEAR" } });
        alert(r.ok ? `\u5DF2\u6E05\u7A7A\uFF1A\u8BB0\u5FC6 ${r.removed.memories} \u6761 \xB7 \u753B\u50CF\u5FEB\u7167 ${r.removed.personas} \u6761` : "\u6E05\u7A7A\u5931\u8D25\uFF1A" + r.error);
      }, children: "\u6E05\u7A7A\u8BB0\u5FC6\u5E93" })
    ] })
  ] });
}
var RETENTION_KINDS = [
  { kind: "knowledge", label: "\u77E5\u8BC6" },
  { kind: "decision", label: "\u51B3\u7B56" },
  { kind: "mistake", label: "\u8E29\u5751" },
  { kind: "event", label: "\u4E8B\u4EF6" },
  { kind: "fact", label: "\u4E8B\u5B9E" },
  { kind: "preference", label: "\u504F\u597D", core: true },
  { kind: "goal", label: "\u76EE\u6807", core: true },
  { kind: "trait", label: "\u7279\u8D28", core: true }
];
var parsePolicyMap = (text) => {
  const out = {};
  for (const part of String(text || "").split(",")) {
    const [k, d] = part.split(":").map((s) => String(s || "").trim());
    const n = Number(d);
    if (k && Number.isFinite(n) && n > 0) out[k] = Math.round(n);
  }
  return out;
};
var formatPolicyMap = (map) => Object.entries(map).filter(([k, d]) => d > 0 && !RETENTION_KINDS.some((x) => x.kind === k && x.core)).map(([k, d]) => `${k}:${d}`).join(",");
function RetentionGrid({ daysText, countsText, onChangeDays, onChangeCounts }) {
  const days = parsePolicyMap(daysText);
  const maxes = parsePolicyMap(countsText);
  const setOne = (map, kind, raw, emit) => {
    const next = { ...map };
    const n = Math.round(Number(raw));
    if (!raw || !Number.isFinite(n) || n <= 0) delete next[kind];
    else next[kind] = n;
    emit(formatPolicyMap(next));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u4FDD\u7559\u7B56\u7565\uFF08\u6309\u7C7B\u578B\uFF09" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-retention-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u7C7B\u578B" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u671F\u9650\uFF08\u5929\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u6761\u6570\u4E0A\u9650" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-retention-grid", children: RETENTION_KINDS.map((k) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-retention-cell" + (k.core ? " ml-retention-core" : ""), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-retention-kind", children: k.label }),
      k.core ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("em", { title: "\u6838\u5FC3\u5C42\u6C38\u4E0D\u8870\u51CF\u3001\u4E5F\u4E0D\u8BBE\u6761\u6570\u4E0A\u9650", children: "\u65E0\u671F\u9650 \xB7 \u4E0D\u9650\u6761\u6570" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            type: "number",
            min: "1",
            placeholder: "\u4E0D\u9650",
            title: "\u8D85\u8FC7\u8FD9\u4E48\u591A\u5929\u4E14\u4ECE\u6CA1\u88AB\u53EC\u56DE \u2192 \u6DD8\u6C70",
            value: days[k.kind] ?? "",
            onChange: (e) => setOne(days, k.kind, e.target.value, onChangeDays)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            type: "number",
            min: "1",
            placeholder: "\u4E0D\u9650",
            title: "\u8FD9\u4E00\u7C7B\u6700\u591A\u4FDD\u7559\u591A\u5C11\u6761\uFF0C\u8D85\u51FA\u5148\u6DD8\u6C70\u6700\u5F31/\u6700\u4E45\u672A\u7528\u7684",
            value: maxes[k.kind] ?? "",
            onChange: (e) => setOne(maxes, k.kind, e.target.value, onChangeCounts)
          }
        )
      ] })
    ] }, k.kind)) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: "\u671F\u9650\uFF1A\u53EA\u6DD8\u6C70\u300C\u4ECE\u6CA1\u88AB\u53EC\u56DE\u300D\u4E14\u8D85\u8FC7\u5929\u6570\u7684\u6761\u76EE\u3002\u6761\u6570\uFF1A\u8FD9\u4E00\u7C7B\u8D85\u8FC7\u4E0A\u9650\u65F6\uFF0C\u6309\u300C\u547D\u4E2D\u6B21\u6570 \u2192 \u5F3A\u5EA6 \u2192 \u6700\u540E\u66F4\u65B0\u300D\u4ECE\u5F31\u5230\u5F3A\u6DD8\u6C70\u3002 \u4E24\u8005\u5747\u4E3A\u8F6F\u5220\u9664\uFF08\u8FDB\u56DE\u6536\u7AD9\uFF09\uFF0C\u7559\u7A7A = \u4E0D\u9650\u3002\u6838\u5FC3\u5C42\uFF08\u7279\u8D28 / \u504F\u597D / \u76EE\u6807\uFF09\u6C38\u4E0D\u6DD8\u6C70\u3002" })
  ] });
}
function BackupPanel() {
  const [mode, setMode] = (0, import_react2.useState)("full");
  const [pass, setPass] = (0, import_react2.useState)("");
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [info, setInfo] = (0, import_react2.useState)(null);
  const [err, setErr] = (0, import_react2.useState)("");
  const [watermark, setWatermark] = (0, import_react2.useState)("");
  const [auto, setAuto] = (0, import_react2.useState)(null);
  const [autoBusy, setAutoBusy] = (0, import_react2.useState)(false);
  const [autoRes, setAutoRes] = (0, import_react2.useState)(null);
  (0, import_react2.useEffect)(() => {
    api("/backup").then((d) => {
      if (!d.ok) return;
      if (d.watermark) setWatermark(d.watermark);
      if (d.auto) setAuto(d.auto);
    });
  }, []);
  const runAuto = async () => {
    setAutoBusy(true);
    setAutoRes(null);
    const r = await api("/backup", { method: "POST", body: { autoRun: true } });
    setAutoBusy(false);
    setAutoRes(r);
    if (r.ok) api("/backup").then((d) => {
      if (d.ok && d.watermark) setWatermark(d.watermark);
    });
  };
  const run = async () => {
    if (pass && pass.length < 8) {
      setErr("\u53E3\u4EE4\u81F3\u5C11 8 \u4E2A\u5B57\u7B26");
      return;
    }
    setBusy(true);
    setErr("");
    setInfo(null);
    const r = await api("/backup", { method: "POST", body: { full: mode === "full", passphrase: pass } });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error || "\u5907\u4EFD\u5931\u8D25");
      return;
    }
    const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const name = `memory-lattice-${mode === "full" ? "full" : "delta"}-${day}${pass ? ".enc" : ""}.json`;
    const blob = new Blob([r.text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2e3);
    setInfo({ ...r.stats, name });
    setWatermark(r.stats.watermark);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-field ml-import", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u5907\u4EFD\uFF08\u52A0\u5BC6 / \u589E\u91CF\uFF09" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-import-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { value: mode, onChange: (e) => setMode(e.target.value), children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "full", children: "\u5168\u91CF \u2014\u2014 \u5168\u90E8\u8BB0\u5FC6\u4E0E\u753B\u50CF\u5FEB\u7167" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("option", { value: "incremental", children: [
          "\u589E\u91CF \u2014\u2014 \u53EA\u5BFC\u51FA\u4E0A\u6B21\u5907\u4EFD\u4E4B\u540E\u7684\u53D8\u5316",
          watermark ? "" : "\uFF08\u8FD8\u6CA1\u6709\u5907\u4EFD\u8BB0\u5F55\uFF0C\u9996\u6B21\u7B49\u540C\u5168\u91CF\uFF09"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "input",
        {
          type: "password",
          placeholder: "\u53E3\u4EE4\uFF08\u53EF\u9009\uFF0C\u22658 \u5B57\u7B26\uFF09",
          value: pass,
          onChange: (e) => setPass(e.target.value),
          autoComplete: "new-password"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ml-primary", disabled: busy, onClick: run, children: busy ? "\u751F\u6210\u4E2D\u2026" : "\u751F\u6210\u5E76\u4E0B\u8F7D" })
    ] }),
    watermark && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
      "\u4E0A\u6B21\u5907\u4EFD\u6C34\u4F4D\uFF1A",
      watermark.replace("T", " ").slice(0, 19),
      "\uFF08\u589E\u91CF\u4ECE\u8FD9\u4E2A\u65F6\u95F4\u70B9\u4E4B\u540E\u53D6\uFF09"
    ] }),
    info && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-import-preview", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        info.mode === "incremental" ? "\u589E\u91CF" : "\u5168\u91CF",
        " \xB7 \u8BB0\u5FC6 ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: info.memories }),
        " \u6761",
        info.personas ? ` \xB7 \u753B\u50CF\u5FEB\u7167 ${info.personas}` : "",
        info.deletions ? ` \xB7 \u5220\u9664\u8BB0\u5F55 ${info.deletions}` : "",
        " \xB7 ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("b", { children: [
          Math.max(1, Math.round(info.bytes / 1024)),
          "KB"
        ] }),
        info.encrypted ? " \xB7 \u5DF2\u52A0\u5BC6" : " \xB7 \u660E\u6587"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-dim", children: info.name })
    ] }),
    err && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: err }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-field", style: { marginTop: 10 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u81EA\u52A8\u5B9A\u65F6\u5907\u4EFD" }),
      auto && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-dim", children: [
        auto.enabled ? `\u5DF2\u5F00\u542F \xB7 \u6BCF ${auto.intervalHours} \u5C0F\u65F6 \xB7 \u4FDD\u7559 ${auto.keep} \u4EFD \xB7 ${auto.encrypt ? "\u52A0\u5BC6" : "\u660E\u6587"}` : "\u5DF2\u5173\u95ED \u2014\u2014 \u5F00\u5173\u3001\u95F4\u9694\u3001\u4FDD\u7559\u4EFD\u6570\u5728\u300C\u63D2\u4EF6\u8BBE\u7F6E\u300D\u91CC\u6539",
        auto.lastAt ? ` \xB7 \u4E0A\u6B21 ${auto.lastAt.replace("T", " ").slice(0, 19)}` : "",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
          "\u76EE\u5F55\uFF1A",
          auto.dir
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-import-row", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { disabled: autoBusy, onClick: runAuto, children: autoBusy ? "\u6267\u884C\u4E2D\u2026" : "\u7ACB\u5373\u5907\u4EFD\u4E00\u6B21" }) }),
      autoRes && autoRes.ok && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
        "\u5DF2\u5199\u5165 ",
        autoRes.file,
        "\uFF08",
        Math.max(1, Math.round(autoRes.bytes / 1024)),
        "KB \xB7 \u4FDD\u7559 ",
        autoRes.kept,
        " \u4EFD",
        autoRes.removed?.length ? ` \xB7 \u6E05\u7406\u65E7\u5907\u4EFD ${autoRes.removed.length} \u4EFD` : "",
        "\uFF09"
      ] }),
      autoRes && !autoRes.ok && autoRes.skipped === "passphrase-missing" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
        "\u5DF2\u5F00\u542F\u52A0\u5BC6\uFF0C\u4F46\u73AF\u5883\u53D8\u91CF ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: "MEMORY_LATTICE_BACKUP_PASSPHRASE" }),
        " \u672A\u8BBE\u7F6E \u2014\u2014 \u672C\u6B21\u6CA1\u6709\u5199\u4EFB\u4F55\u6587\u4EF6\uFF0C\u4E5F\u4E0D\u4F1A\u9000\u5316\u6210\u660E\u6587\u3002\u8BBE\u597D\u73AF\u5883\u53D8\u91CF\u540E\u9700\u91CD\u542F DSH \u624D\u4F1A\u751F\u6548\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
        "\u5907\u4EFD\u5199\u5728\u5E93\u5185\u76EE\u5F55\uFF08\u8D8A\u754C\u914D\u7F6E\u4F1A\u88AB\u56DE\u843D\u5230 ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: "backups/" }),
        "\uFF09\uFF1B\u5F00\u542F\u52A0\u5BC6\u65F6\u53E3\u4EE4\u53EA\u4ECE\u4E0A\u8FF0\u73AF\u5883\u53D8\u91CF\u8BFB\u53D6\uFF0C \u4E0D\u843D\u914D\u7F6E\u3001\u4E0D\u8FDB\u65E5\u5FD7\u3002"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: "\u52A0\u5BC6\u7528 scrypt \u6D3E\u751F + AES-256-GCM \u8BA4\u8BC1\u52A0\u5BC6\uFF1B\u53E3\u4EE4\u4E0D\u843D\u76D8\u3001\u4E0D\u8FDB\u65E5\u5FD7\uFF08\u5FD8\u4E86\u5C31\u65E0\u6CD5\u6062\u590D\uFF09\u3002 \u589E\u91CF\u5907\u4EFD\u4F1A\u5E26\u300C\u5BF9\u7AEF\u5DF2\u5220\u9664\u300D\u6E05\u5355\uFF0C\u6062\u590D\u65F6\u540C\u6B65\u5220\u9664\uFF0C\u4E0D\u4F1A\u8D8A\u6062\u590D\u8D8A\u591A\u3002" })
  ] });
}
function ImportPanel({ onDone }) {
  const [payload, setPayload] = (0, import_react2.useState)("");
  const [fileName, setFileName] = (0, import_react2.useState)("");
  const [mode, setMode] = (0, import_react2.useState)("skip");
  const [preview, setPreview] = (0, import_react2.useState)(null);
  const [confirmText, setConfirmText] = (0, import_react2.useState)("");
  const [pass, setPass] = (0, import_react2.useState)("");
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [msg, setMsg] = (0, import_react2.useState)("");
  const [src, setSrc] = (0, import_react2.useState)({ kind: "local", name: "" });
  const [dirFiles, setDirFiles] = (0, import_react2.useState)([]);
  const [dirPath, setDirPath] = (0, import_react2.useState)("");
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    setMsg("");
    setPreview(null);
    try {
      const text = await file.text();
      setPayload(text);
      setFileName(file.name);
      setSrc({ kind: "local", name: file.name });
      const r = await api("/import/preview", { method: "POST", body: { payload: text, mode, passphrase: pass } });
      if (r.ok) setPreview(r);
      else setMsg("\u89E3\u6790\u5931\u8D25\uFF1A" + (r.error || "\u672A\u77E5\u9519\u8BEF"));
    } catch (e) {
      setMsg("\u8BFB\u53D6\u6587\u4EF6\u5931\u8D25\uFF1A" + String(e?.message || e));
    }
    setBusy(false);
  };
  const loadDir = async () => {
    const r = await api("/backup");
    if (!r.ok) {
      setMsg("\u8BFB\u4E0D\u5230\u5907\u4EFD\u76EE\u5F55\uFF1A" + (r.error || ""));
      return;
    }
    setDirFiles(r.files || []);
    setDirPath(r.dir || "");
    if (!r.files?.length) setMsg("\u5907\u4EFD\u76EE\u5F55\u91CC\u8FD8\u6CA1\u6709\u5907\u4EFD\u6587\u4EF6\uFF08\u5148\u70B9\u300C\u7ACB\u5373\u5907\u4EFD\u4E00\u6B21\u300D\uFF0C\u6216\u7B49\u5B9A\u65F6\u4EFB\u52A1\u8DD1\u4E00\u8F6E\uFF09");
  };
  const pickDir = async (name) => {
    if (!name) return;
    setBusy(true);
    setMsg("");
    setPreview(null);
    setPayload("");
    setFileName("");
    setSrc({ kind: "dir", name });
    const r = await api("/import/preview", { method: "POST", body: { file: name, mode, passphrase: pass } });
    if (r.ok) setPreview(r);
    else setMsg("\u89E3\u6790\u5931\u8D25\uFF1A" + (r.error || "\u672A\u77E5\u9519\u8BEF"));
    setBusy(false);
  };
  const reqBody = (extra) => src.kind === "dir" ? { file: src.name, ...extra } : { payload, ...extra };
  const rePreview = async (nextMode) => {
    setMode(nextMode);
    setPreview(null);
    if (!payload && src.kind !== "dir") return;
    const r = await api("/import/preview", { method: "POST", body: reqBody({ mode: nextMode, passphrase: pass }) });
    if (r.ok) setPreview(r);
    else setMsg("\u89E3\u6790\u5931\u8D25\uFF1A" + (r.error || ""));
  };
  const run = async () => {
    if (mode === "replace" && confirmText !== "REPLACE") {
      setMsg("\u6574\u5E93\u66FF\u6362\u9700\u8981\u8F93\u5165 REPLACE \u786E\u8BA4");
      return;
    }
    setBusy(true);
    setMsg("");
    const r = await api("/import", { method: "POST", body: reqBody({ mode, confirm: confirmText, passphrase: pass }) });
    setBusy(false);
    if (r.ok) {
      setMsg(`\u5BFC\u5165\u5B8C\u6210\uFF1A\u65B0\u5EFA ${r.created} \xB7 \u8DF3\u8FC7 ${r.skipped} \xB7 \u5408\u5E76 ${r.merged} \xB7 \u753B\u50CF\u5FEB\u7167 ${r.personas}${r.wiped ? ` \xB7 \u5148\u6E05\u7A7A ${r.wiped}` : ""}`);
      setPreview(null);
      setPayload("");
      setFileName("");
      setConfirmText("");
      setSrc({ kind: "local", name: "" });
      onDone?.();
    } else setMsg("\u5BFC\u5165\u5931\u8D25\uFF1A" + (r.error || "\u672A\u77E5\u9519\u8BEF"));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-field ml-import", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u5BFC\u5165 / \u8FC1\u79FB" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-import-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "file", accept: ".json,application/json", onChange: (e) => pick(e.target.files?.[0]) }),
      fileName && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-dim", children: fileName })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-import-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: loadDir, children: "\u4ECE\u5907\u4EFD\u76EE\u5F55\u5BFC\u5165\u2026" }),
      dirFiles.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { value: src.kind === "dir" ? src.name : "", onChange: (e) => pickDir(e.target.value), children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "", children: "\u9009\u62E9\u5907\u4EFD\u6587\u4EF6\u2026" }),
        dirFiles.map((f) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("option", { value: f.name, children: [
          f.name,
          " \xB7 ",
          new Date(f.mtime).toLocaleString("zh-CN"),
          " \xB7 ",
          Math.round(f.size / 1024),
          "KB"
        ] }, f.name))
      ] }),
      dirPath && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-dim", title: "\u5907\u4EFD\u76EE\u5F55", children: [
        "\u76EE\u5F55\uFF1A",
        dirPath
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-import-row", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "input",
      {
        type: "password",
        placeholder: "\u52A0\u5BC6\u5907\u4EFD\u53E3\u4EE4\uFF08\u660E\u6587\u6587\u4EF6\u7559\u7A7A\uFF09",
        value: pass,
        autoComplete: "off",
        onChange: (e) => setPass(e.target.value),
        onBlur: () => {
          if (payload || src.kind === "dir") rePreview(mode);
        }
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-import-row", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { value: mode, onChange: (e) => rePreview(e.target.value), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "skip", children: "skip \u2014\u2014 \u540C\u5185\u5BB9\u8DF3\u8FC7\uFF0C\u5176\u4F59\u65B0\u5EFA\uFF08\u63A8\u8350\uFF0C\u53EF\u91CD\u590D\u6267\u884C\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "merge", children: "merge \u2014\u2014 \u8FD1\u4F3C\u91CD\u590D\u6539\u4E3A\u5F3A\u5316\u5DF2\u6709\u6761\u76EE" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "new", children: "new \u2014\u2014 \u5168\u90E8\u65B0\u5EFA\uFF08\u5141\u8BB8\u91CD\u590D\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "replace", children: "replace \u2014\u2014 \u5148\u6E05\u7A7A\u518D\u5BFC\u5165\uFF08\u5371\u9669\uFF09" })
    ] }) }),
    preview && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-import-preview", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        "\u5171 ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: preview.total }),
        " \u6761 \u2192 \u65B0\u5EFA ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: preview.create }),
        " \xB7 \u8DF3\u8FC7 ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: preview.skip }),
        " \xB7 \u5408\u5E76 ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: preview.merge }),
        preview.update ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          " \xB7 \u66F4\u65B0 ",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: preview.update })
        ] }) : null,
        preview.deleted ? ` \xB7 \u540C\u6B65\u5220\u9664 ${preview.deleted}` : "",
        preview.personaTotal ? ` \xB7 \u753B\u50CF\u5FEB\u7167 ${preview.personaNew}/${preview.personaTotal} \u65B0\u589E` : "",
        preview.encrypted ? " \xB7 \u5DF2\u89E3\u5BC6" : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-dim", children: Object.entries(preview.byKind || {}).map(([k, n]) => `${KIND_LABEL2[k] || k} ${n}`).join(" \xB7 ") }),
      (preview.issues || []).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-dim", children: [
        "\u63D0\u793A\uFF1A",
        preview.issues.join("\uFF1B")
      ] }),
      mode === "replace" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-import-row", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { placeholder: "\u8F93\u5165 REPLACE \u786E\u8BA4\u6574\u5E93\u66FF\u6362", value: confirmText, onChange: (e) => setConfirmText(e.target.value) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-import-row", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: mode === "replace" ? "ml-danger" : "ml-primary", disabled: busy, onClick: run, children: busy ? "\u5BFC\u5165\u4E2D\u2026" : mode === "replace" ? "\u6E05\u7A7A\u5E76\u5BFC\u5165" : "\u6267\u884C\u5BFC\u5165" }) })
    ] }),
    msg && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: msg }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("small", { children: [
      "\u4ECE\u672C\u63D2\u4EF6\u5BFC\u51FA\u7684 JSON \u6216\u522B\u7684\u5DE5\u5177\u7684\u8BB0\u5FC6 JSON \u90FD\u80FD\u5BFC\u5165\uFF1B\u8C03\u5EA6\u72B6\u6001\uFF08\u5F3A\u5EA6 / \u95F4\u9694 / \u590D\u4E60\u6B21\u6570\uFF09\u4E00\u8D77\u642C\uFF0C\u5BFC\u5165\u540E\u9057\u5FD8\u66F2\u7EBF\u63A5\u7740\u8D70\u3002",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
      "\u300C\u4ECE\u5907\u4EFD\u76EE\u5F55\u5BFC\u5165\u300D\u8D70\u7684\u662F\u5907\u4EFD\u76EE\u5F55\u91CC\u7684\u81EA\u5BB6\u5907\u4EFD\u6587\u4EF6 \u2014\u2014 \u628A\u8BE5\u76EE\u5F55\u6307\u5230\u7F51\u76D8/\u540C\u6B65\u76D8\u76EE\u5F55\uFF0C\u5C31\u662F**\u5355\u5411\u8DE8\u673A\u540C\u6B65**\u7684\u5165\u53E3\uFF08\u53E6\u4E00\u53F0\u673A\u5668\u70B9\u4E00\u4E0B\u5BFC\u5165\u5373\u53EF\uFF09\u3002"
    ] })
  ] });
}
function SidebarButton() {
  const [open, setOpen] = (0, import_react2.useState)(false);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { className: "ml-footer-btn", title: "\u5FC6\u67A2 \xB7 \u8BB0\u5FC6\u5E93", onClick: () => setOpen(true), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-footer-ico", children: "\u{1F9E0}" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-footer-label", children: "\u5FC6\u67A2\u8BB0\u5FC6" })
    ] }),
    open && (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-modal-mask", onClick: (e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-modal", "data-windows-titlebar": true, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ml-modal-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u5FC6\u67A2 \xB7 \u8BB0\u5FC6\u5E93" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: () => setOpen(false), children: "\xD7" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ml-modal-body", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(App, {}) })
      ] }) }),
      document.body
    )
  ] });
}
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => {
    const el = document.createElement("style");
    el.id = PLUGIN_ID + "-style";
    el.textContent = CSS;
    document.head.appendChild(el);
    return () => el.remove();
  }, PLUGIN_ID + ": styles");
  ctx.effect(() => ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register({
      name: "settings.section",
      id: PLUGIN_ID,
      order: 26,
      label: () => "\u5FC6\u67A2\u8BB0\u5FC6",
      locale: PLUGIN_ID,
      inject: () => ({})
    }, () => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(App, {}))
  ), PLUGIN_ID + ": settings section");
  ctx.effect(() => ctx.slots.inject(
    "sidebar.footer.action",
    () => ctx.slots.register({
      name: "sidebar.footer.action",
      id: PLUGIN_ID + ":footer",
      order: 101,
      label: () => "\u5FC6\u67A2\u8BB0\u5FC6",
      locale: PLUGIN_ID,
      inject: () => ({})
    }, () => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SidebarButton, {}))
  ), PLUGIN_ID + ": sidebar entry");
}

})(__module, __module.exports);
return __module.exports;
} });

