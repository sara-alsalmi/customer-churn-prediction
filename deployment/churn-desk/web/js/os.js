// Window manager, Dock and notifications: the "macOS" core.
import { $, $$, h, esc, clock } from "./util.js";
import * as sound from "./sound.js";
import { emit } from "./state.js";
import { prefs } from "./prefs.js";

const layer = () => $("#windows");
const wins = new Map(); // window id -> {el, opts, app, minimized, tile}
let z = 20;
let focusedId = null;
export const mru = []; // app ids, most recently used first

export const isPhone = () => matchMedia("(max-width: 900px)").matches;

export function area() {
  const r = layer().getBoundingClientRect();
  return { w: r.width, h: r.height - 80 }; // leave room for the dock
}

// ---------- apps ----------
export const apps = {}; // id -> {id, name, launch, icon, menu, keywords}
export function registerApp(id, launch, meta = {}) { apps[id] = { id, name: meta.name || id, launch, ...meta }; }
export const appOf = (winId) => wins.get(winId)?.app || winId.split(":")[0];
export function appName(id) { return apps[id]?.name || id; }
export function appIcon(id, cls = "") {
  if (apps[id]?.icon) return `<span class="ic ${apps[id].iconClass || ""} ${cls}">${apps[id].icon}</span>`;
  const d = $(`.dock-app[data-app="${id}"] .ic`);
  if (d) { const c = d.cloneNode(true); c.classList.add(...cls.split(" ").filter(Boolean)); return c.outerHTML; }
  return `<span class="ic ic-generic ${cls}"><svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>`;
}
export function windowsOf(appId) { return [...wins.entries()].filter(([, w]) => w.app === appId).map(([id]) => id); }
export function runningApps() { return [...new Set([...wins.values()].map((w) => w.app))]; }
export function allWindows() {
  return [...wins.entries()].map(([id, w]) => ({ id, title: w.opts.title, app: w.app, minimized: w.minimized, z: +w.el.style.zIndex || 0 }))
    .sort((a, b) => b.z - a.z);
}
export const focused = () => focusedId;

// Open an app: show its existing window or start it.
export function launch(appId) {
  sound.unlock();
  const ids = windowsOf(appId);
  if (ids.length) {
    const top = allWindows().find((w) => w.app === appId && !w.minimized) || allWindows().find((w) => w.app === appId);
    if (wins.get(top.id).minimized) restore(top.id);
    return focus(top.id);
  }
  const b = $(`.dock-app[data-app="${appId}"]`);
  if (b) { b.classList.remove("launching"); void b.offsetWidth; b.classList.add("launching"); setTimeout(() => b.classList.remove("launching"), 800); }
  apps[appId]?.launch?.();
}

// Quit: close every window of the app.
export function quit(appId) { windowsOf(appId).forEach((id) => close(id)); }

// ---------- windows ----------
const LIGHTS = `
  <button class="l-close" aria-label="إغلاق"><svg viewBox="0 0 12 12"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5"/></svg></button>
  <button class="l-min" aria-label="تصغير"><svg viewBox="0 0 12 12"><path d="M2.8 6h6.4"/></svg></button>
  <button class="l-max" aria-label="تكبير"><svg viewBox="0 0 12 12"><path d="M3.2 8.8V4.4l4.4 4.4zM8.8 3.2v4.4L4.4 3.2z" class="fill"/></svg></button>`;

export function open(id, opts) {
  const ex = wins.get(id);
  if (ex) {
    if (ex.minimized) restore(id);
    focus(id);
    return ex.el;
  }
  const app = opts.app || id.split(":")[0];
  const el = h(`
    <div class="win opening" data-id="${esc(id)}" data-app="${esc(app)}" role="dialog" aria-label="${esc(opts.title)}">
      <div class="win-bar">
        <div class="win-lights">${LIGHTS}</div>
        <div class="win-title">${esc(opts.title)}${opts.sub ? `<small>${esc(opts.sub)}</small>` : ""}</div>
        <div class="win-tools"></div>
      </div>
      <div class="win-body"></div>
      ${opts.resizable === false ? "" : ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => `<i class="rz rz-${d}" data-d="${d}"></i>`).join("")}
    </div>`);
  const a = area();
  const w = Math.min(opts.width || 480, a.w - 24), hh = Math.min(opts.height || 520, a.h - 16);
  el.style.width = w + "px";
  el.style.height = hh + "px";
  let pos = typeof opts.pos === "function" ? opts.pos(a, w, hh) : { x: (a.w - w) / 2, y: Math.max(12, (a.h - hh) / 2) };
  // cascade like macOS when a window already sits there
  for (let i = 0; i < 8 && [...wins.values()].some((o) => !o.minimized && Math.abs(o.el.offsetLeft - pos.x) < 6 && Math.abs(o.el.offsetTop - pos.y) < 6); i++) {
    pos = { x: pos.x - 26, y: pos.y + 26 };
  }
  el.style.left = Math.max(8, Math.min(pos.x, a.w - w - 8)) + "px";
  el.style.top = Math.max(8, Math.min(pos.y, a.h - 60)) + "px";
  layer().appendChild(el);
  wins.set(id, { el, opts, app, minimized: false });
  el.addEventListener("animationend", () => el.classList.remove("opening"), { once: true });

  $(".l-close", el).onclick = (e) => { e.stopPropagation(); close(id); };
  $(".l-min", el).onclick = (e) => { e.stopPropagation(); minimize(id); };
  $(".l-max", el).onclick = (e) => { e.stopPropagation(); toggleMax(id); };
  el.addEventListener("pointerdown", () => focus(id), true);
  drag(el, $(".win-bar", el));
  $$(".rz", el).forEach((r) => resize(el, r, opts));
  opts.render?.($(".win-body", el), el);
  dockState(app);
  focus(id);
  emit("windows");
  return el;
}

export function get(id) { return wins.get(id)?.el; }
export const isOpen = (id) => wins.has(id);

export function setTitle(id, title) {
  const w = wins.get(id);
  if (!w) return;
  w.opts.title = title;
  $(".win-title", w.el).firstChild.textContent = title;
  emit("windows");
}

export function focus(id) {
  const w = wins.get(id);
  if (!w || w.minimized) return;
  if (focusedId !== id || !w.el.classList.contains("focused")) {
    $$(".win").forEach((x) => x.classList.remove("focused"));
    w.el.classList.add("focused");
    w.el.style.zIndex = ++z;
  }
  focusedId = id;
  const i = mru.indexOf(w.app);
  if (i) { if (i > 0) mru.splice(i, 1); mru.unshift(w.app); }
  emit("focus", id);
}

// Click on the wallpaper: no window has focus, the menu bar shows «الملفات».
export function blurAll() {
  $$(".win").forEach((x) => x.classList.remove("focused"));
  focusedId = null;
  emit("focus", null);
}

function focusNext() {
  const next = allWindows().find((w) => !w.minimized);
  if (next) focus(next.id); else blurAll();
}

export function close(id) {
  const w = wins.get(id);
  if (!w) return;
  if (w.opts.onClose && w.opts.onClose() === false) return;
  w.el.classList.add("closing");
  wins.delete(id);
  w.tile?.remove();
  dockState(w.app);
  if (focusedId === id) { focusedId = null; focusNext(); }
  setTimeout(() => w.el.remove(), 320);
  emit("windows");
}

// Fly the window into its Dock tile (the macOS "scale" effect with a little genie bend).
export function minimize(id) {
  const w = wins.get(id);
  if (!w || w.minimized) return;
  w.minimized = true;
  const tile = h(`<button class="dock-app dock-min" data-win="${esc(id)}" title="${esc(w.opts.title)}">${appIcon(w.app, "mini")}<span class="min-thumb"></span></button>`);
  tile.onclick = () => restore(id);
  $("#dockTrash").before(tile);
  w.tile = tile;
  $("#dockMinSep").classList.add("show");
  if (focusedId === id) { focusedId = null; focusNext(); }
  if (isPhone() || prefs.reduceMotion) { w.el.style.display = "none"; emit("windows"); return; }
  const anim = w.el.animate(genie(w.el, tile), { duration: 520, easing: "cubic-bezier(.55,.05,.65,.95)", fill: "forwards" });
  anim.onfinish = () => { w.el.style.display = "none"; anim.cancel(); };
  emit("windows");
}

export function restore(id) {
  const w = wins.get(id);
  if (!w || !w.minimized) return;
  w.minimized = false;
  w.el.style.display = "";
  const tile = w.tile;
  w.tile = null;
  if (tile && !isPhone()) {
    const anim = w.el.animate(genie(w.el, tile).reverse(), { duration: 480, easing: "cubic-bezier(.2,.8,.3,1)" });
    anim.onfinish = () => tile.remove();
  } else tile?.remove();
  if (!$$(".dock-min").filter((t) => t !== tile).length) $("#dockMinSep").classList.remove("show");
  focus(id);
  emit("windows");
}

function genie(el, tile) {
  const r = el.getBoundingClientRect(), t = tile.getBoundingClientRect();
  const sx = t.width / r.width, sy = t.height / r.height;
  const dx = t.left - r.left, dy = t.top - r.top;
  el.style.transformOrigin = "0 0";
  return [
    { transform: "none", opacity: 1, clipPath: "inset(0 0 0 0 round 18px)" },
    { transform: `translate(${dx * 0.35}px, ${dy * 0.55}px) scale(${0.6 + sx * 0.4}, ${0.75})`, opacity: 0.85, offset: 0.45, clipPath: "inset(0 10% 0 10% round 18px)" },
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.25, clipPath: "inset(0 0 0 0 round 18px)" },
  ];
}

function rectOf(el) { return { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height }; }
function animateTo(el, rect, ms = 450) {
  el.style.transition = `left ${ms}ms var(--ease-out), top ${ms}ms var(--ease-out), width ${ms}ms var(--ease-out), height ${ms}ms var(--ease-out)`;
  Object.assign(el.style, rect);
  setTimeout(() => (el.style.transition = ""), ms + 30);
}

export function toggleMax(id) {
  const w = wins.get(id);
  if (!w || isPhone()) return;
  const el = w.el;
  if (el.dataset.prev) {
    animateTo(el, JSON.parse(el.dataset.prev));
    delete el.dataset.prev;
  } else {
    el.dataset.prev = JSON.stringify(rectOf(el));
    const a = area();
    animateTo(el, { left: "8px", top: "8px", width: a.w - 16 + "px", height: a.h - 4 + "px" });
  }
}

// Tile a window to half the screen ("left" / "right"), like macOS Sequoia.
export function tile(id, side) {
  const w = wins.get(id);
  if (!w || isPhone()) return;
  const el = w.el, a = area();
  if (!el.dataset.prev) el.dataset.prev = JSON.stringify(rectOf(el));
  const half = (a.w - 24) / 2;
  animateTo(el, { left: (side === "left" ? 8 : 16 + half) + "px", top: "8px", width: half + "px", height: a.h - 4 + "px" });
}

// Move a window to a new rect with animation (used when a call starts).
export function place(id, rect) {
  const w = wins.get(id);
  if (!w || isPhone()) return;
  const el = w.el, a = area();
  delete el.dataset.prev;
  const width = Math.min(rect.w, a.w - 16), height = Math.min(rect.h, a.h - 16);
  animateTo(el, {
    left: Math.max(8, Math.min(rect.x, a.w - width - 8)) + "px", top: Math.max(8, rect.y) + "px",
    width: width + "px", height: height + "px",
  }, 600);
}

function snapZone(e) {
  if (e.clientY <= 38) return "max";
  if (e.clientX <= 6) return "left";
  if (e.clientX >= innerWidth - 6) return "right";
  return null;
}
function snapRect(zone) {
  const a = area(), half = (a.w - 24) / 2;
  if (zone === "max") return { x: 8, y: 8, w: a.w - 16, h: a.h - 4 };
  return { x: zone === "left" ? 8 : 16 + half, y: 8, w: half, h: a.h - 4 };
}

function drag(el, bar) {
  let sx, sy, ox, oy, on = false, moved = false, zone = null;
  const ghost = () => $("#snapGhost");
  bar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button, input, .win-tools") || isPhone() || document.body.classList.contains("mc")) return;
    on = true; moved = false; sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop;
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener("pointermove", (e) => {
    if (!on) return;
    if (!moved) {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < 4) return;
      moved = true;
      el.classList.add("dragging");
      // dragging a zoomed or tiled window gives it back its old size under the pointer
      if (el.dataset.prev) {
        const p = JSON.parse(el.dataset.prev);
        const frac = (sx - el.getBoundingClientRect().left) / el.offsetWidth;
        delete el.dataset.prev;
        el.style.width = p.width; el.style.height = p.height;
        ox = sx - layer().getBoundingClientRect().left - frac * el.offsetWidth;
      }
    }
    const a = layer().getBoundingClientRect();
    const x = Math.min(Math.max(ox + e.clientX - sx, -el.offsetWidth + 120), a.width - 120);
    const y = Math.min(Math.max(oy + e.clientY - sy, 0), a.height - 60);
    el.style.left = x + "px"; el.style.top = y + "px";
    const zn = snapZone(e);
    if (zn !== zone) {
      zone = zn;
      const g = ghost();
      if (zone) { const r = snapRect(zone); Object.assign(g.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" }); g.classList.add("show"); }
      else g.classList.remove("show");
    }
  });
  const end = () => {
    if (!on) return;
    on = false; el.classList.remove("dragging");
    ghost().classList.remove("show");
    if (zone) {
      const pre = rectOf(el);
      if (zone === "max") toggleMax(el.dataset.id);
      else tile(el.dataset.id, zone);
      if (!el.dataset.prev) el.dataset.prev = JSON.stringify(pre);
    }
    zone = null;
  };
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", end);
  bar.addEventListener("dblclick", (e) => { if (!e.target.closest("button")) toggleMax(el.dataset.id); });
}

function resize(el, handle, opts) {
  const minW = opts.minW || 320, minH = opts.minH || 240;
  let s = null;
  handle.addEventListener("pointerdown", (e) => {
    if (isPhone()) return;
    e.stopPropagation(); e.preventDefault();
    s = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, d: handle.dataset.d };
    delete el.dataset.prev;
    el.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    let { l, t, w, h: hh } = s;
    if (s.d.includes("e")) w = Math.max(minW, s.w + dx);
    if (s.d.includes("w")) { w = Math.max(minW, s.w - dx); l = s.l + (s.w - w); }
    if (s.d.includes("s")) hh = Math.max(minH, s.h + dy);
    if (s.d.includes("n")) { hh = Math.max(minH, s.h - dy); t = Math.max(0, s.t + (s.h - hh)); if (t === 0) hh = s.t + s.h; }
    Object.assign(el.style, { left: l + "px", top: t + "px", width: w + "px", height: hh + "px" });
  });
  const end = () => { if (!s) return; s = null; el.classList.remove("dragging"); emit("resized", el.dataset.id); };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

// ---------- Mission Control ----------
let mcOn = false;
export function missionControl(force) {
  const want = force ?? !mcOn;
  if (want === mcOn || isPhone()) return;
  mcOn = want;
  const list = allWindows().filter((w) => !w.minimized).reverse();
  const box = $("#mcLabels");
  box.innerHTML = "";
  document.body.classList.toggle("mc", mcOn);
  if (!mcOn) {
    list.forEach(({ id }) => { const el = wins.get(id).el; el.style.transition = "transform .45s var(--ease-out)"; el.style.transform = ""; setTimeout(() => (el.style.transition = ""), 480); });
    return;
  }
  const L = layer().getBoundingClientRect();
  const W = L.width, H = L.height - 110;
  const n = list.length;
  if (!n) return;
  const cols = Math.ceil(Math.sqrt(n * (W / H) / 1.4)) || 1, rows = Math.ceil(n / cols);
  const cw = (W - 80) / cols, ch = (H - 30) / rows;
  list.forEach(({ id, title, app }, i) => {
    const el = wins.get(id).el;
    const r = i / cols | 0, c = i % cols;
    const inRow = Math.min(cols, n - r * cols);
    // RTL: the first window sits on the right; a short last row is centred
    const cxx = W - 40 - (c + 0.5) * cw - (cols - inRow) * cw / 2;
    const cy = 40 + (r + 0.5) * ch;
    const sc = Math.min(1, (cw - 40) / el.offsetWidth, (ch - 50) / el.offsetHeight);
    const tx = cxx - (el.offsetLeft + el.offsetWidth / 2), ty = cy - (el.offsetTop + el.offsetHeight / 2);
    el.style.transformOrigin = "50% 50%";
    el.style.transition = "transform .5s var(--ease-out)";
    el.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`;
    setTimeout(() => (el.style.transition = ""), 520);
    const lab = h(`<div class="mc-label">${appIcon(app, "tiny")}<span>${esc(title)}</span></div>`);
    lab.style.left = cxx + "px";
    lab.style.top = cy + (el.offsetHeight * sc) / 2 + 12 + "px";
    box.appendChild(lab);
  });
}
export const inMissionControl = () => mcOn;

// Right-click menus are drawn by mac.js; apps call os.emitContext(event, items).
export let emitContext = null;
export function onContext(fn) { emitContext = fn; }

// ---------- dock ----------
export function dockState(appId) {
  $(`.dock-app[data-app="${appId}"]`)?.classList.toggle("running", windowsOf(appId).length > 0);
}

export function initDock(onContext) {
  $$(".dock-app[data-app]").forEach((b) => {
    b.addEventListener("click", () => {
      sound.unlock();
      const id = b.dataset.app;
      if (apps[id]?.dockClick) return apps[id].dockClick();
      launch(id);
    });
    b.addEventListener("contextmenu", (e) => { e.preventDefault(); onContext?.(b.dataset.app, b); });
  });
  const dock = $("#dock");
  const size = () => prefs.dockSize;
  dock.addEventListener("pointermove", (e) => {
    if (isPhone() || !prefs.magnify) return;
    $$(".dock-app", dock).forEach((a) => {
      const r = a.getBoundingClientRect();
      const d = Math.abs(e.clientX - (r.left + r.width / 2));
      const s = Math.max(0, 1 - d / 160);
      const px = size() + size() * 0.55 * s * s;
      a.style.width = a.style.height = px + "px";
    });
  });
  dock.addEventListener("pointerleave", () => $$(".dock-app", dock).forEach((a) => (a.style.width = a.style.height = "")));
}

export function bounce(id) {
  const b = $(`.dock-app[data-app="${id}"]`);
  if (!b) return;
  b.classList.remove("bounce"); void b.offsetWidth; b.classList.add("bounce");
}

// ---------- notifications ----------
export const history = [];
export function notify({ icon, iconBg = "rgba(255,255,255,.1)", app, title, text, time = "الآن", actions, ring = false, ttl = 6500, onClick }) {
  const rec = { icon, iconBg, app, title, text, at: new Date(), onClick };
  if (!ring) { history.unshift(rec); if (history.length > 40) history.pop(); emit("notifs"); }
  const quiet = prefs.dnd && !ring;
  const el = h(`
    <div class="notif glass ${ring ? "ring" : ""}">
      <div class="n-ic" style="background:${iconBg}">${icon || ""}</div>
      <div>
        <div class="n-head"><b>${esc(app)}</b><span>${esc(time)}</span></div>
        ${title ? `<div class="n-text"><b>${esc(title)}</b></div>` : ""}
        <div class="n-text">${esc(text)}</div>
      </div>
      <button class="n-x" aria-label="إغلاق">×</button>
      ${actions ? `<div class="n-actions">${actions.map((a, i) => `<button class="${a.kind || ""}" data-i="${i}">${esc(a.label)}</button>`).join("")}</div>` : ""}
    </div>`);
  const dismiss = () => { if (!el.isConnected) return; el.classList.add("out"); setTimeout(() => el.remove(), 380); };
  if (quiet) return { el, dismiss };
  $("#notifs").prepend(el);
  if (!ring) sound.pop();
  $(".n-x", el).onclick = (e) => { e.stopPropagation(); dismiss(); };
  if (actions) $$(".n-actions button", el).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); dismiss(); actions[+b.dataset.i].do?.(); }));
  if (onClick) el.onclick = () => { dismiss(); onClick(); };
  // swipe it away
  let sx = null;
  el.addEventListener("pointerdown", (e) => { sx = e.clientX; });
  el.addEventListener("pointerup", (e) => { if (sx != null && e.clientX - sx < -50) dismiss(); sx = null; });
  if (ttl) setTimeout(dismiss, ttl);
  return { el, dismiss };
}

// ---------- clock ----------
export function startClock() {
  const tick = () => {
    const c = $("#mbClock");
    if (!c) return;
    const d = new Date();
    const day = d.toLocaleDateString("ar-SA-u-ca-gregory", { weekday: "short", day: "numeric", month: "short" });
    const t = d.toLocaleTimeString("ar-SA", { hour: "numeric", minute: "2-digit", hour12: true });
    c.textContent = `${day}  ${t}`;
  };
  tick();
  setInterval(tick, 5_000);
  void clock;
}
