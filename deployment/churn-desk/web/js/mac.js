// The system around the apps: menu bar, Control Center, Notification Center,
// Spotlight, app switcher, Launchpad, desktop, shortcuts, sleep and power.
import { $, $$, h, esc, n, pct, api, sleep, toAr, riskColor } from "./util.js";
import * as os from "./os.js";
import * as sound from "./sound.js";
import { state, on, emit } from "./state.js";
import { prefs, setPref } from "./prefs.js";
import { openSettings, ACCENTS, setWallImage } from "./apps/settings.js";
import { newNote, allNotes, openNotes, titleOf, trashedNotes, emptyTrash, deleteNote } from "./apps/notes.js";
import { openFinder, openItem, list as fsList, FOLDER_SVG, fileById } from "./apps/finder.js";
import { openHelp } from "./apps/help.js";
import { openMail } from "./apps/mail.js";
import { callPhase, callActions } from "./apps/call.js";
import { openReport, show as showReport } from "./apps/report.js";
import * as eggs from "./eggs.js";

let hooks = {};
const desktopOn = () => !$("#desktop").classList.contains("hidden") && !$("#sleepScr");
const IC = {
  search: `<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 15l5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  cc: `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="8" r="1.8" fill="currentColor"/><rect x="3" y="13" width="18" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7" cy="16" r="1.8" fill="currentColor"/></svg>`,
  wifi: `<svg viewBox="0 0 24 24"><path d="M2.5 9a14 14 0 0119 0M5.5 12.2a9.5 9.5 0 0113 0M8.6 15.3a5 5 0 016.8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="18.6" r="1.6" fill="currentColor"/></svg>`,
  wifiOff: `<svg viewBox="0 0 24 24"><path d="M2.5 9a14 14 0 0119 0M5.5 12.2a9.5 9.5 0 0113 0M8.6 15.3a5 5 0 016.8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".35"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  moon: `<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" fill="currentColor"/></svg>`,
  sun: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  speaker: `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  full: `<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  bell: `<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" fill="currentColor"/><path d="M10 20a2 2 0 004 0" fill="currentColor"/></svg>`,
  server: `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="13" width="16" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="7.5" r="1.2" fill="currentColor"/><circle cx="8" cy="16.5" r="1.2" fill="currentColor"/></svg>`,
  shot: `<svg viewBox="0 0 24 24"><path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`,
  mc: `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="8" height="6" rx="1.5" fill="currentColor"/><rect x="13" y="5" width="8" height="6" rx="1.5" fill="currentColor"/><rect x="3" y="13" width="8" height="6" rx="1.5" fill="currentColor"/><rect x="13" y="13" width="8" height="6" rx="1.5" fill="currentColor"/></svg>`,
};

export function init(h_) {
  hooks = h_;
  applyPrefs();
  on("prefs", applyPrefs);
  os.onContext((e, items) => popMenu(items, { x: e.clientX, y: e.clientY }));
  menubar();
  statusItems();
  keyboard();
  desktop();
  hotCorner();
  on("focus", updateAppName);
  on("employee", () => { $("#greetHi") && ($("#greetHi").textContent = `أهلاً، ${state.employee}`); });
  on("call:started", () => $("#mbNabd").classList.add("active"));
  on("call:ended", () => $("#mbNabd").classList.remove("active"));
  updateAppName();
  eggs.init({ alertBox, closeMenu, dockMenu });
}

// ---------------- settings applied ----------------
function applyPrefs() {
  const b = document.body;
  b.dataset.wall = prefs.wallpaper;
  if (prefs.wallpaper === "custom") { try { const u = localStorage.getItem("rs-wallimg"); if (u && !b.style.getPropertyValue("--wall-img")) b.style.setProperty("--wall-img", `url("${u}")`); } catch {} }
  document.documentElement.style.setProperty("--accent", (ACCENTS[prefs.accent] || ACCENTS.blue)[0]);
  document.documentElement.style.setProperty("--dock", prefs.dockSize + "px");
  $("#dim").style.opacity = ((1 - prefs.brightness) * 0.8).toFixed(3);
  sound.setVolume(prefs.volume);
  $("#mbDnd")?.classList.toggle("hidden", !prefs.dnd);
  b.classList.toggle("reduce-motion", !!prefs.reduceMotion);
  if (ccEl?.isConnected) renderCC();
}

// ---------------- menus ----------------
let menuEl = null, menuAnchor = null, menuOnClose = null;

export function popMenu(items, { x, y, anchor, onClose } = {}) {
  closeMenu();
  const el = h(`<div class="menu" role="menu"></div>`);
  items.filter(Boolean).forEach((it) => {
    if (it === "-") return el.append(h(`<div class="menu-sep"></div>`));
    if (it.header) return el.append(h(`<div class="menu-head">${esc(it.header)}</div>`));
    if (it.html) return el.append(h(`<div class="menu-html">${it.html}</div>`));
    const b = h(`<button class="menu-item ${it.disabled ? "disabled" : ""}" role="menuitem" ${it.disabled ? 'aria-disabled="true"' : ""}>
      <span class="mi-check">${it.checked ? "✓" : ""}</span>${it.icon ? `<span class="mi-icon">${it.icon}</span>` : ""}<span class="mi-label">${esc(it.label)}</span>${it.kbd ? `<span class="mi-kbd" dir="ltr">${esc(it.kbd)}</span>` : ""}</button>`);
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus where it was (Edit menu)
    b.addEventListener("pointerenter", () => { $$(".menu-item.hot", el).forEach((x) => x.classList.remove("hot")); b.classList.add("hot"); });
    b.onclick = () => {
      if (it.disabled) return;
      b.classList.add("blink");
      setTimeout(() => { closeMenu(); it.run?.(); }, 120);
    };
    el.append(b);
  });
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  document.body.append(el);
  const W = el.offsetWidth, H = el.offsetHeight;
  let left, top;
  if (anchor) { const r = anchor.getBoundingClientRect(); left = r.right - W; top = r.bottom + 4; }
  else { left = x - W; top = y; if (left < 6) left = x; }
  left = Math.max(6, Math.min(left, innerWidth - W - 6));
  if (top + H > innerHeight - 6) top = Math.max(6, (anchor ? innerHeight : y) - H - 6);
  el.style.left = left + "px"; el.style.top = top + "px";
  menuEl = el; menuAnchor = anchor || null; menuOnClose = onClose || null;
  return el;
}
export function closeMenu() {
  if (!menuEl) return;
  menuEl.remove(); menuEl = null;
  const f = menuOnClose; menuOnClose = null; menuAnchor = null;
  f?.();
}
addEventListener("pointerdown", (e) => {
  if (menuEl && !menuEl.contains(e.target) && !(menuAnchor && menuAnchor.contains(e.target))) closeMenu();
}, true);
addEventListener("blur", closeMenu);
addEventListener("resize", () => { closeMenu(); os.missionControl(false); });

function menuKeys(e) {
  if (!menuEl) return false;
  const items = $$(".menu-item:not(.disabled)", menuEl);
  let i = items.findIndex((x) => x.classList.contains("hot"));
  if (e.key === "Escape") { closeMenu(); menuBarActive = false; $$(".mb-menu.open").forEach((x) => x.classList.remove("open")); return true; }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    i = (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items.forEach((x) => x.classList.remove("hot")); items[i]?.classList.add("hot");
    return true;
  }
  if (e.key === "Enter" && i >= 0) { items[i].click(); return true; }
  if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && menuBarActive) {
    const tops = $$(".mb-menu"), cur = tops.findIndex((t) => t.classList.contains("open"));
    const next = tops[(cur + (e.key === "ArrowLeft" ? 1 : -1) + tops.length) % tops.length];
    openTop(next);
    return true;
  }
  return false;
}

// ---------------- menu bar ----------------
let menuBarActive = false;
const currentApp = () => (os.focused() ? os.appOf(os.focused()) : "finder");

function updateAppName() {
  const app = currentApp();
  const el = $("#mbApp");
  if (el) el.textContent = os.appName(app);
  const cp = callPhase?.();
  void cp;
}

function openTop(btn) {
  $$(".mb-menu.open").forEach((x) => x.classList.remove("open"));
  btn.classList.add("open");
  menuBarActive = true;
  sound.click();
  popMenu(menuFor(btn.dataset.menu), { anchor: btn, onClose: () => btn.classList.remove("open") });
  // first item hot only when opened from keyboard; the mouse sets its own
}

function menubar() {
  $$(".mb-menu").forEach((b) => {
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      if (b.classList.contains("open")) { closeMenu(); menuBarActive = false; return; }
      openTop(b);
    });
    b.addEventListener("pointerenter", () => { if (menuEl && menuBarActive && !b.classList.contains("open") && menuAnchor?.classList.contains("mb-menu")) openTop(b); });
  });
}

const fs = () => !!document.fullscreenElement;
export function toggleFullscreen() {
  if (fs()) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().then(() => navigator.keyboard?.lock?.().catch(() => {})).catch(() => {});
}

function hideApp(app) { os.windowsOf(app).forEach((id) => os.minimize(id)); }
function showAll() { os.allWindows().filter((w) => w.minimized).forEach((w) => os.restore(w.id)); }

function menuFor(key) {
  const app = currentApp(), name = os.appName(app), win = os.focused();
  const phase = callPhase();
  switch (key) {
    case "logo": return [
      { label: "حول مكتب رصين", run: about },
      "-",
      { label: "إعدادات النظام…", kbd: "⌥,", run: () => openSettings() },
      { label: "التطبيقات", kbd: "F4", run: launchpad },
      "-",
      { label: "فرض الإنهاء…", run: forceQuit },
      "-",
      { label: "النوم", run: sleepNow },
      { label: "إعادة التشغيل…", run: () => power("restart") },
      { label: "إيقاف التشغيل…", run: () => power("shutdown") },
      "-",
      { label: "قفل الشاشة", kbd: "⌥L", run: () => hooks.lock?.() },
      { label: `تسجيل خروج «${state.employee}»…`, run: () => power("logout") },
    ];
    case "app": return [
      { label: `حول ${name}`, run: () => aboutApp(app) },
      "-",
      { label: "الإعدادات…", kbd: "⌥,", run: () => openSettings() },
      "-",
      { label: `إخفاء ${name}`, kbd: "⌥H", disabled: !os.windowsOf(app).length, run: () => hideApp(app) },
      { label: "إخفاء الآخرين", run: () => os.runningApps().filter((a) => a !== app).forEach(hideApp) },
      { label: "إظهار الكل", run: showAll },
      "-",
      { label: `إنهاء ${name}`, kbd: "⌥Q", disabled: app === "finder" && !os.windowsOf("finder").length, run: () => os.quit(app) },
    ];
    case "file": {
      const extra = {
        finder: [{ label: "نافذة ملفات جديدة", kbd: "⌥N", run: () => openFinder("docs", true) }, { label: "ملاحظة جديدة", run: () => newNote() }],
        notes: [{ label: "ملاحظة جديدة", kbd: "⌥N", run: () => newNote() }, { label: "حذف الملاحظة", run: () => deleteNote() }],
        call: [
          { label: "رد على المكالمة", disabled: phase !== "ringing", run: callActions.answer },
          { label: "رفض المكالمة", disabled: phase !== "ringing", run: callActions.decline },
          { label: "إنهاء المكالمة", disabled: phase !== "live", run: callActions.hangUp },
        ],
        report: [{ label: "حفظ التقرير كملف…", disabled: !state.lastReport, run: saveReport }],
        mail: [{ label: "رسالة جديدة", disabled: true }],
      }[app] || [{ label: "ملاحظة جديدة", kbd: "⌥N", run: () => newNote() }];
      return [...extra, "-", { label: "فتح الملفات", run: () => openFinder("docs") }, "-", { label: "إغلاق النافذة", kbd: "⌥W", disabled: !win, run: () => os.close(win) }];
    }
    case "edit": return [
      { label: "تراجع", kbd: "⌘Z", run: () => document.execCommand("undo") },
      { label: "إعادة", kbd: "⇧⌘Z", run: () => document.execCommand("redo") },
      "-",
      { label: "قص", kbd: "⌘X", run: () => document.execCommand("cut") },
      { label: "نسخ", kbd: "⌘C", run: () => document.execCommand("copy") },
      { label: "لصق", kbd: "⌘V", run: paste },
      { label: "تحديد الكل", kbd: "⌘A", run: () => document.execCommand("selectAll") },
      "-",
      { label: "بحث", kbd: "⌘K", run: spotlight },
    ];
    case "view": return [
      { label: "ملء الشاشة", kbd: "⌥F", checked: fs(), run: toggleFullscreen },
      "-",
      { label: "Mission Control", kbd: "⌥↑", run: () => os.missionControl() },
      { label: "التطبيقات", kbd: "F4", run: launchpad },
      "-",
      { label: "إظهار الأدوات", checked: !document.body.classList.contains("no-widgets"), run: () => document.body.classList.toggle("no-widgets") },
      { label: "تكبير الـDock", checked: prefs.magnify, run: () => setPref("magnify", !prefs.magnify) },
    ];
    case "window": {
      const all = os.allWindows();
      return [
        { label: "تصغير", kbd: "⌥M", disabled: !win, run: () => os.minimize(win) },
        { label: "تكبير", disabled: !win, run: () => os.toggleMax(win) },
        { label: "ترتيب على اليسار", kbd: "⌥←", disabled: !win, run: () => os.tile(win, "left") },
        { label: "ترتيب على اليمين", kbd: "⌥→", disabled: !win, run: () => os.tile(win, "right") },
        "-",
        { label: "ترتيب نوافذ المكالمة", disabled: phase !== "live", run: callActions.arrange },
        { label: "إحضار الكل للأمام", run: () => { showAll(); all.slice().reverse().forEach((w) => os.focus(w.id)); } },
        ...(all.length ? ["-"] : []),
        ...all.map((w) => ({ label: w.title + (w.minimized ? " (مصغّرة)" : ""), checked: w.id === win, run: () => (w.minimized ? os.restore(w.id) : os.focus(w.id)) })),
      ];
    }
    case "help": return [
      { label: "كيف تلعب", run: () => openHelp() },
      { label: "اختصارات لوحة المفاتيح", run: () => openSettings("keyboard") },
      { label: "بطاقة النموذج", run: () => openItem(fileById("card")) },
    ];
  }
  return [];
}

async function paste() {
  try { const t = await navigator.clipboard.readText(); document.execCommand("insertText", false, t); }
  catch { os.notify({ app: "النظام", text: "المتصفح ما سمح باللصق من القائمة. استخدم ⌘V." }); }
}

function saveReport() {
  const r = state.lastReport;
  const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `report-${(r.customer?.first_name || "call")}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------- status items ----------------
let net = { ok: true, ms: null };
function statusItems() {
  $("#mbSearch").onclick = spotlight;
  $("#mbCC").onclick = () => controlCenter();
  $("#mbClock").onclick = () => notificationCenter();
  $("#mbNabd").onclick = () => os.launch("nabd");
  $("#mbDnd").onclick = () => setPref("dnd", false);
  $("#mbWifi").onclick = (e) => {
    const cfg = state.config || {};
    popMenu([
      { header: "الشبكة" },
      { html: `<div class="net-row"><i class="${net.ok ? "ok" : "bad"}"></i><div><b>خادم رصين</b><small>${net.ok ? `متصل${net.ms != null ? ` · ${toAr(net.ms)} م.ث` : ""}` : "غير متصل"}</small></div></div>` },
      { html: `<div class="net-row"><i class="${cfg.brain === "claude" ? "ok" : "off"}"></i><div><b>Claude</b><small>${cfg.brain === "claude" ? "العميل يتكلم من Claude" : "غير مفعّل · سيناريو محلي"}</small></div></div>` },
      { html: `<div class="net-row"><i class="${cfg.voice === "elevenlabs" ? "ok" : "off"}"></i><div><b>ElevenLabs</b><small>${cfg.voice === "elevenlabs" ? "صوت العميل" : "غير مفعّل · صوت المتصفح"}</small></div></div>` },
      "-",
      { label: "إعادة الفحص", run: ping },
      { label: "إعدادات الكلام…", run: () => openSettings("speech") },
    ], { anchor: e.currentTarget });
  };
  ping();
  setInterval(ping, 20_000);
  addEventListener("online", ping);
  addEventListener("offline", () => { net.ok = false; drawNet(); });

  const batt = $("#mbBatt");
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      const draw = () => {
        const p = Math.round(b.level * 100);
        batt.innerHTML = `<span class="batt-pct">${toAr(p)}٪</span><span class="batt ${b.charging ? "chg" : ""} ${p <= 20 ? "low" : ""}"><i style="width:${Math.max(6, p)}%"></i></span>`;
        batt.onclick = (e) => popMenu([
          { header: "البطارية" },
          { html: `<div class="net-row"><div><b>${toAr(p)}٪</b><small>${b.charging ? "يشحن · الشاحن موصول" : "على البطارية"}</small></div></div>` },
          "-",
          { label: "إعدادات الشاشة…", run: () => openSettings("display") },
        ], { anchor: e.currentTarget });
      };
      draw();
      b.addEventListener("levelchange", draw);
      b.addEventListener("chargingchange", draw);
    }).catch(() => batt.classList.add("hidden"));
  } else batt.classList.add("hidden");
}
async function ping() {
  const t0 = performance.now();
  try { await api("/api/health", undefined, { cache: "no-store" }); net = { ok: navigator.onLine !== false || true, ms: Math.round(performance.now() - t0) }; }
  catch { net = { ok: false, ms: null }; }
  drawNet();
}
function drawNet() { const w = $("#mbWifi"); if (w) { w.innerHTML = net.ok ? IC.wifi : IC.wifiOff; w.classList.toggle("bad", !net.ok); } }

// ---------------- Control Center ----------------
let ccEl = null;
function controlCenter(force) {
  if (ccEl && force !== true) { closePanel(ccEl); ccEl = null; return; }
  closeAllPanels();
  ccEl = h(`<div class="panel cc glass" id="cc"></div>`);
  $("#desktop").append(ccEl);
  renderCC();
  outside(ccEl, $("#mbCC"), () => { ccEl = null; });
}
function renderCC() {
  if (!ccEl) return;
  const cfg = state.config || {};
  ccEl.innerHTML = `
    <div class="cc-grid">
      <div class="cc-box cc-net">
        <button class="cc-row" data-cc="net"><i class="cc-dot ${net.ok ? "on" : ""}">${IC.server}</i><div><b>الخادم</b><small>${net.ok ? "متصل" : "غير متصل"}</small></div></button>
        <button class="cc-row" data-cc="brain"><i class="cc-dot ${cfg.brain === "claude" ? "on" : ""}">C</i><div><b>Claude</b><small>${cfg.brain === "claude" ? "مفعّل" : "محلي"}</small></div></button>
        <button class="cc-row" data-cc="voice"><i class="cc-dot ${cfg.voice === "elevenlabs" ? "on" : ""}">${IC.speaker}</i><div><b>ElevenLabs</b><small>${cfg.voice === "elevenlabs" ? "مفعّل" : "صوت المتصفح"}</small></div></button>
      </div>
      <button class="cc-box cc-tile ${prefs.dnd ? "on" : ""}" data-cc="dnd"><i class="cc-dot ${prefs.dnd ? "on" : ""}">${IC.moon}</i><div><b>عدم الإزعاج</b><small>${prefs.dnd ? "مفعّل" : "متوقف"}</small></div></button>
      <button class="cc-box cc-sq ${fs() ? "on" : ""}" data-cc="fs"><i>${IC.full}</i><span>ملء الشاشة</span></button>
      <button class="cc-box cc-sq ${prefs.sfx ? "on" : ""}" data-cc="sfx"><i>${IC.bell}</i><span>أصوات الواجهة</span></button>
      <div class="cc-box cc-wide"><b>الشاشة</b><label class="cc-slide"><i>${IC.sun}</i><input type="range" min="0.35" max="1" step="0.01" value="${prefs.brightness}" data-k="brightness"></label></div>
      <div class="cc-box cc-wide"><b>الصوت</b><label class="cc-slide"><i>${IC.speaker}</i><input type="range" min="0" max="1" step="0.01" value="${prefs.volume}" data-k="volume"></label></div>
      <button class="cc-box cc-sq cc-half" data-cc="mc"><i>${IC.mc}</i><span>Mission Control</span></button>
      <button class="cc-box cc-sq cc-half" data-cc="settings"><i>⚙︎</i><span>الإعدادات</span></button>
    </div>`;
  $$("[data-cc]", ccEl).forEach((b) => (b.onclick = () => {
    sound.click();
    const k = b.dataset.cc;
    if (k === "dnd") setPref("dnd", !prefs.dnd);
    if (k === "sfx") setPref("sfx", !prefs.sfx);
    if (k === "fs") { toggleFullscreen(); setTimeout(renderCC, 300); }
    if (k === "net") ping().then(renderCC);
    if (k === "brain" || k === "voice") { controlCenter(); openSettings("speech"); }
    if (k === "mc") { controlCenter(); os.missionControl(true); }
    if (k === "settings") { controlCenter(); openSettings(); }
  }));
  $$("input[type=range]", ccEl).forEach((r) => {
    r.style.setProperty("--v", ((r.value - r.min) / (r.max - r.min)) * 100 + "%");
    r.oninput = () => { r.style.setProperty("--v", ((r.value - r.min) / (r.max - r.min)) * 100 + "%"); setPref(r.dataset.k, +r.value); };
  });
}
document.addEventListener("fullscreenchange", () => { renderCC(); if (!fs()) navigator.keyboard?.unlock?.(); });

function outside(panel, trigger, onGone) {
  const fn = (e) => {
    if (!panel.isConnected) return removeEventListener("pointerdown", fn, true);
    if (panel.contains(e.target) || trigger?.contains(e.target) || menuEl?.contains(e.target)) return;
    closePanel(panel); onGone?.();
    removeEventListener("pointerdown", fn, true);
  };
  setTimeout(() => addEventListener("pointerdown", fn, true), 0);
}
function closePanel(p) { if (!p?.isConnected) return; if (p.id === "nc") document.body.classList.remove("nc-open"); p.classList.add("out"); setTimeout(() => p.remove(), 260); }
function closeAllPanels() { if (ccEl) { closePanel(ccEl); ccEl = null; } if (ncEl) { closePanel(ncEl); ncEl = null; } }

// ---------------- Notification Center ----------------
let ncEl = null;
function notificationCenter() {
  if (ncEl) { closePanel(ncEl); ncEl = null; return; }
  closeAllPanels();
  ncEl = h(`<div class="panel nc" id="nc"></div>`);
  document.body.classList.add("nc-open");
  $("#desktop").append(ncEl);
  renderNC();
  outside(ncEl, $("#mbClock"), () => { ncEl = null; });
}
function renderNC() {
  if (!ncEl) return;
  const d = new Date();
  const hist = os.history;
  const st = state.stats;
  const last = state.reports[0];
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "الآن" : m < 60 ? `قبل ${toAr(m)} د` : d.toLocaleTimeString("ar-SA", { hour: "numeric", minute: "2-digit" }); };
  ncEl.innerHTML = `
    <div class="nc-head"><b>الإشعارات</b>${hist.length ? `<button id="ncClear">مسح الكل</button>` : ""}</div>
    <div class="nc-list">${hist.length ? hist.slice(0, 12).map((x, i) => `
      <div class="notif glass nc-item" data-i="${i}"><div class="n-ic" style="background:${x.iconBg}">${x.icon || ""}</div>
      <div><div class="n-head"><b>${esc(x.app)}</b><span>${ago(x.at)}</span></div>${x.title ? `<div class="n-text"><b>${esc(x.title)}</b></div>` : ""}<div class="n-text">${esc(x.text)}</div></div></div>`).join("")
      : `<div class="nc-empty">لا توجد إشعارات</div>`}</div>
    <div class="nc-widgets">
      ${calendar(d)}
      <div class="widget glass nc-w"><div class="w-title">اليوم</div><div class="w-stats">
        <div><b>${n(st.calls)}</b><span>مكالمات</span></div><div><b>${n(st.saved)}</b><span>احتفظت بهم</span></div>
        <div><b>${st.finals.length ? pct(st.finals.reduce((a, b) => a + b, 0) / st.finals.length) : "—"}</b><span>متوسط الخطر</span></div></div></div>
      <button class="widget glass nc-w nc-last" ${last ? "" : "disabled"}><div class="w-title">آخر مكالمة</div>${last
        ? `<div class="nc-last-row"><b>${esc(last.customer?.name || "")}</b><span style="color:${riskColor(last.final)}">${pct(last.start)} ← ${pct(last.final)}</span></div><small>${last.outcome === "retained" ? "احتفظت به" : "غادر"} · اضغط للتقرير</small>`
        : `<small>ما فيه مكالمات للحين</small>`}</button>
    </div>`;
  $("#ncClear", ncEl)?.addEventListener("click", () => { os.history.length = 0; renderNC(); });
  $$(".nc-item", ncEl).forEach((el) => (el.onclick = () => { const x = hist[+el.dataset.i]; if (x?.onClick) { notificationCenter(); x.onClick(); } }));
  $(".nc-last", ncEl).onclick = () => { if (!last) return; notificationCenter(); showReport(last); openReport(); };
}
on("notifs", renderNC);

function calendar(d) {
  const y = d.getFullYear(), m = d.getMonth();
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const wd = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];
  let cells = wd.map((x) => `<span class="cal-wd">${x}</span>`).join("");
  for (let i = 0; i < first; i++) cells += `<span></span>`;
  for (let i = 1; i <= days; i++) cells += `<span class="${i === d.getDate() ? "today" : ""}">${toAr(i)}</span>`;
  const month = d.toLocaleDateString("ar-SA-u-ca-gregory", { month: "long", year: "numeric" });
  const hj = d.toLocaleDateString("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" });
  return `<div class="widget glass nc-w cal"><div class="cal-hd"><b>${month}</b><small>${hj}</small></div><div class="cal-grid">${cells}</div></div>`;
}

// ---------------- Spotlight ----------------
const norm = (s) => String(s).toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
const ACTIONS = () => [
  { label: "قفل الشاشة", kw: "lock قفل", run: () => hooks.lock?.(), icon: "🔒" },
  { label: "ملء الشاشة", kw: "fullscreen شاشه كامله", run: toggleFullscreen, icon: IC.full },
  { label: "Mission Control", kw: "نوافذ كل mission", run: () => os.missionControl(true), icon: IC.mc },
  { label: prefs.dnd ? "إيقاف عدم الإزعاج" : "تشغيل عدم الإزعاج", kw: "dnd ازعاج تركيز", run: () => setPref("dnd", !prefs.dnd), icon: IC.moon },
  { label: "ملاحظة جديدة", kw: "note ملاحظه", run: () => newNote(), icon: "✎" },
  { label: "تغيير الخلفية", kw: "wallpaper خلفيه", run: () => openSettings("wallpaper"), icon: "▦" },
  { label: "لون التمييز", kw: "accent لون", run: () => openSettings("appearance"), icon: "◐" },
  { label: "مستوى الصوت", kw: "volume صوت", run: () => openSettings("sound"), icon: IC.speaker },
  { label: "السطوع", kw: "brightness سطوع اضاءه", run: () => openSettings("display"), icon: IC.sun },
  { label: "اختصارات لوحة المفاتيح", kw: "keyboard shortcuts اختصار", run: () => openSettings("keyboard"), icon: "⌥" },
  { label: "كيف تلعب", kw: "help مساعده شرح", run: () => openHelp(), icon: "?" },
  { label: "النوم", kw: "sleep نوم", run: sleepNow, icon: IC.moon },
  { label: "إعادة التشغيل", kw: "restart تشغيل", run: () => power("restart"), icon: "↻" },
];
function spotItems() {
  const out = [];
  Object.values(os.apps).filter((a) => !a.hidden).forEach((a) => out.push({ group: "التطبيقات", label: a.name, kw: a.keywords || a.id, iconHtml: os.appIcon(a.id, "tiny"), run: () => os.launch(a.id), sub: "تطبيق" }));
  ACTIONS().forEach((a) => out.push({ group: "الإجراءات", ...a, iconHtml: `<span class="spot-glyph">${a.icon}</span>` }));
  allNotes().forEach((nt) => out.push({ group: "الملاحظات", label: titleOf(nt), kw: nt.text, iconHtml: `<span class="spot-glyph note">✎</span>`, run: () => openNotes(nt.id), sub: "ملاحظة" }));
  state.mail.forEach((m) => out.push({ group: "البريد", label: m.subject, kw: m.text + " " + m.from, iconHtml: `<span class="spot-glyph mail">✉</span>`, run: openMail, sub: m.from }));
  state.reports.forEach((r) => out.push({ group: "التقارير", label: `مكالمة ${r.customer?.name || ""}`, kw: r.scenario || "", iconHtml: `<span class="spot-glyph rep">▥</span>`, run: () => { showReport(r); openReport(); }, sub: `${r.outcome === "retained" ? "احتفظت به" : "غادر"} · ${pct(r.final)}` }));
  ["docs", "model"].forEach((p) => fsList(p).filter((f) => f.kind === "txt").forEach((f) => out.push({ group: "المستندات", label: f.name, kw: f.body(), iconHtml: `<span class="spot-glyph doc">${f.icon}</span>`, run: () => openItem(f), sub: "مستند" })));
  const seen = new Set();
  return out.filter((x) => { const k = x.group + x.label; if (seen.has(k)) return false; seen.add(k); return true; });
}
function calcResult(q) {
  const s = q.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[×x]/g, "*").replace(/÷/g, "/").replace(/٫/g, ".").replace(/,/g, "").replace(/\^/g, "**").replace(/−/g, "-");
  if (!/^[\d\s+\-*/().%]+$/.test(s) || !/\d\s*[+\-*/%]/.test(s)) return null;
  try { const v = Function(`"use strict";return (${s.replace(/(\d+(?:\.\d+)?)%/g, "($1/100)")})`)(); return isFinite(v) ? Number(v.toPrecision(12)) : null; } catch { return null; }
}

let spotEl = null;
export function spotlight() {
  if (spotEl) return closeSpot();
  closeMenu(); closeAllPanels(); closeLaunchpad();
  spotEl = h(`<div class="spot-wrap"><div class="spot glass"><div class="spot-bar"><i>${IC.search}</i><input placeholder="بحث Spotlight" autocomplete="off" spellcheck="false"></div><div class="spot-res"></div></div></div>`);
  document.body.append(spotEl);
  const inp = $("input", spotEl), res = $(".spot-res", spotEl);
  let rows = [], sel = 0;
  const draw = () => {
    const q = inp.value.trim();
    spotEl.classList.toggle("has", !!q);
    if (!q) { res.innerHTML = ""; rows = []; return; }
    const nq = norm(q);
    const calc = calcResult(q);
    rows = eggs.spotEggs(nq);
    if (calc != null) rows.push({ group: "الحاسبة", label: `${toAr(q)} = ${toAr(String(calc))}`, iconHtml: os.appIcon("calc", "tiny"), run: () => { navigator.clipboard?.writeText(String(calc)); os.notify({ app: "Spotlight", text: `نسخت الناتج ${toAr(String(calc))}` }); }, sub: "اضغط Enter لنسخ الناتج" });
    const scored = spotItems().map((x) => {
      const L = norm(x.label), K = norm(x.kw || "");
      const s = L.startsWith(nq) ? 4 : L.split(/\s+/).some((w) => w.startsWith(nq)) ? 3 : L.includes(nq) ? 2 : K.includes(nq) ? 1 : 0;
      return { ...x, s };
    }).filter((x) => x.s).sort((a, b) => b.s - a.s);
    const groups = {};
    scored.forEach((x) => (groups[x.group] ||= []).push(x));
    Object.values(groups).sort((a, b) => b[0].s - a[0].s).forEach((g) => rows.push(...g.slice(0, 4)));
    rows = rows.slice(0, 13);
    sel = 0;
    let lastG = null;
    res.innerHTML = rows.length ? rows.map((r, i) => {
      const head = r.group !== lastG ? `<div class="spot-g">${esc(r.group)}</div>` : "";
      lastG = r.group;
      return `${head}<button class="spot-row ${i === sel ? "sel" : ""}" data-i="${i}">${r.iconHtml}<span class="spot-l">${esc(r.label)}</span>${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</button>`;
    }).join("") : `<div class="spot-none">لا توجد نتائج لـ «${esc(q)}»</div>`;
    $$(".spot-row", res).forEach((b) => {
      b.onmouseenter = () => { sel = +b.dataset.i; mark(); };
      b.onclick = () => go(+b.dataset.i);
    });
  };
  const mark = () => $$(".spot-row", res).forEach((b) => b.classList.toggle("sel", +b.dataset.i === sel));
  const go = (i) => { const r = rows[i]; if (!r) return; closeSpot(); r.run(); };
  inp.addEventListener("input", draw);
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!rows.length) return; sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length; mark(); $(".spot-row.sel", res)?.scrollIntoView({ block: "nearest" }); }
    if (e.key === "Enter") { e.preventDefault(); go(sel); }
    if (e.key === "Escape") { e.preventDefault(); closeSpot(); }
    e.stopPropagation();
  });
  spotEl.addEventListener("pointerdown", (e) => { if (e.target === spotEl) closeSpot(); });
  setTimeout(() => inp.focus(), 20);
}
function closeSpot() { if (!spotEl) return; const s = spotEl; spotEl = null; s.classList.add("out"); setTimeout(() => s.remove(), 200); }

// ---------------- app switcher (⌥Tab) ----------------
let sw = null;
function switcher(dir) {
  const list = [...new Set([...os.mru.filter((a) => os.windowsOf(a).length), ...os.runningApps()])];
  if (!list.length) return;
  if (!sw) {
    sw = { list, i: list.length > 1 ? 1 : 0, el: h(`<div class="switcher glass"></div>`) };
    document.body.append(sw.el);
  } else sw.i = (sw.i + dir + sw.list.length) % sw.list.length;
  sw.el.innerHTML = `<div class="sw-row">${sw.list.map((a, i) => `<div class="sw-app ${i === sw.i ? "sel" : ""}" data-i="${i}">${os.appIcon(a)}</div>`).join("")}</div><div class="sw-name">${esc(os.appName(sw.list[sw.i]))}</div>`;
  $$(".sw-app", sw.el).forEach((x) => (x.onpointerenter = () => { sw.i = +x.dataset.i; switcher(0); }));
  $$(".sw-app", sw.el).forEach((x) => (x.onclick = () => commitSwitch()));
}
function commitSwitch() {
  if (!sw) return;
  const a = sw.list[sw.i];
  sw.el.remove(); sw = null;
  os.launch(a);
}

// ---------------- Launchpad ----------------
let lpEl = null;
export function launchpad() {
  if (lpEl) return closeLaunchpad();
  closeMenu(); closeAllPanels(); os.missionControl(false);
  const apps = Object.values(os.apps).filter((a) => !a.hidden && a.id !== "launchpad");
  lpEl = h(`<div class="launchpad"><label class="lp-search">${IC.search}<input placeholder="بحث"></label><div class="lp-grid">${apps.map((a) => `<button class="lp-app" data-app="${a.id}">${os.appIcon(a.id)}<span>${esc(a.name)}</span></button>`).join("")}</div></div>`);
  $("#desktop").append(lpEl);
  document.body.classList.add("lp-open");
  const inp = $("input", lpEl);
  inp.oninput = () => { const q = norm(inp.value.trim()); $$(".lp-app", lpEl).forEach((b) => b.classList.toggle("hidden", !!q && !norm(b.textContent).includes(q))); };
  inp.onkeydown = (e) => { if (e.key === "Enter") { const b = $$(".lp-app", lpEl).find((x) => !x.classList.contains("hidden")); b?.click(); } if (e.key === "Escape") closeLaunchpad(); e.stopPropagation(); };
  $$(".lp-app", lpEl).forEach((b) => (b.onclick = () => { const id = b.dataset.app; closeLaunchpad(); setTimeout(() => os.launch(id), 120); }));
  lpEl.addEventListener("pointerdown", (e) => { if (e.target === lpEl || e.target.classList.contains("lp-grid")) closeLaunchpad(); });
  setTimeout(() => inp.focus(), 50);
}
function closeLaunchpad() { if (!lpEl) return; const l = lpEl; lpEl = null; l.classList.add("out"); document.body.classList.remove("lp-open"); setTimeout(() => l.remove(), 300); }

// ---------------- keyboard ----------------
function keyboard() {
  addEventListener("keydown", (e) => {
    if (!desktopOn()) return;
    if (menuKeys(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    const c = e.code, alt = e.altKey && !e.metaKey && !e.ctrlKey;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if ((e.metaKey && c === "KeyK") || (e.altKey && c === "Space") || (e.ctrlKey && c === "Space")) { stop(); return spotlight(); }
    if (e.altKey && c === "Tab") { stop(); return switcher(e.shiftKey ? -1 : 1); }
    if (sw && c === "Escape") { stop(); sw.el.remove(); sw = null; return; }
    if (c === "Escape") {
      if (lpEl) { stop(); return closeLaunchpad(); }
      if (os.inMissionControl()) { stop(); return os.missionControl(false); }
      if (ccEl || ncEl) { stop(); return closeAllPanels(); }
    }
    if (c === "F3" || (alt && c === "ArrowUp")) { stop(); return os.missionControl(); }
    if (c === "F4") { stop(); return launchpad(); }
    if (!alt) return;
    const win = os.focused(), app = currentApp();
    const act = {
      KeyW: () => win && os.close(win),
      KeyM: () => win && os.minimize(win),
      KeyH: () => hideApp(app),
      KeyQ: () => app !== "finder" && os.quit(app),
      KeyN: () => (app === "finder" ? openFinder("docs", true) : newNote()),
      Comma: () => openSettings(),
      KeyL: () => hooks.lock?.(),
      KeyF: toggleFullscreen,
      ArrowLeft: () => win && os.tile(win, "left"),
      ArrowRight: () => win && os.tile(win, "right"),
    }[c];
    if (act) { stop(); act(); }
  }, true);
  addEventListener("keyup", (e) => { if (sw && (e.key === "Alt" || !e.altKey)) commitSwitch(); }, true);
}

// ---------------- desktop ----------------
function desktop() {
  const d = $("#desktop");
  // clicking the wallpaper hands focus to «الملفات»
  d.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".win, .dock, .menubar, .panel, .menu, .notif, .launchpad, .widget, .desk-icon")) return;
    if (os.inMissionControl()) return os.missionControl(false);
    os.blurAll();
    selectIcons([]);
    if (e.button === 0) rubberBand(e);
  });
  d.addEventListener("contextmenu", (e) => {
    if (e.target.closest("input, textarea, .selectable")) return; // keep the browser's own menu for text
    e.preventDefault();
    if (e.target.closest(".win, .menubar, .panel, .menu, .dock, .notif")) return;
    const ic = e.target.closest(".desk-icon");
    if (ic) {
      selectIcons([ic]);
      return popMenu([{ label: "فتح", run: () => openDeskIcon(ic.dataset.f) }, "-", { label: "إظهار في الملفات", run: () => openFinder("desktop") }], { x: e.clientX, y: e.clientY });
    }
    popMenu([
      { label: "ملاحظة جديدة", run: () => newNote() },
      { label: "فتح الملفات", run: () => openFinder("desktop") },
      "-",
      { label: "تغيير خلفية سطح المكتب…", run: () => openSettings("wallpaper") },
      { label: document.body.classList.contains("no-widgets") ? "إظهار الأدوات" : "إخفاء الأدوات", run: () => document.body.classList.toggle("no-widgets") },
      { label: "ترتيب الأيقونات", run: () => { setPref("iconPos", {}); drawIcons(); } },
      "-",
      { label: "Mission Control", run: () => os.missionControl(true) },
      { label: "إعدادات النظام…", run: () => openSettings() },
    ], { x: e.clientX, y: e.clientY });
  });
  $("#mcLabels").addEventListener("pointerdown", () => os.missionControl(false));
  // a click on a window while in Mission Control picks it
  $("#windows").addEventListener("pointerdown", (e) => {
    if (!os.inMissionControl()) return;
    const w = e.target.closest(".win");
    e.stopPropagation();
    os.missionControl(false);
    if (w) os.focus(w.dataset.id);
  }, true);
  $("#wToday").onclick = () => { if (state.lastReport) openReport(); else os.notify({ app: "التقارير", text: "خلّص أول مكالمة ويطلع تقريرها هنا." }); };
  $("#wQueue").onclick = () => os.launch("call");
  drawIcons();
  on("call:ended", drawIcons);
  on("notes", drawIcons);
}

const DESK = () => [
  { f: "dir:reports", name: "التقارير", icon: FOLDER_SVG, badge: state.reports.length },
  ...fsList("desktop").filter((x) => x.kind !== "dir"),
  { f: "trash", name: "سلة المهملات", icon: null, trash: true },
].map((x) => ({ ...x, f: x.f || x.id }));

function drawIcons() {
  const box = $("#deskIcons");
  if (!box) return;
  const pos = prefs.iconPos || {};
  const items = DESK().filter((x) => !x.trash);
  box.innerHTML = items.map((x, i) => {
    const p = pos[x.f] || { x: 18, y: 14 + i * 104 };
    return `<button class="desk-icon" data-f="${esc(x.f)}" style="left:${p.x}px;top:${p.y}px"><span class="di-glyph">${x.icon}${x.badge ? `<em>${toAr(x.badge)}</em>` : ""}</span><span class="di-name">${esc(x.name)}</span></button>`;
  }).join("");
  $$(".desk-icon", box).forEach((ic) => {
    ic.addEventListener("dblclick", () => openDeskIcon(ic.dataset.f));
    ic.addEventListener("keydown", (e) => { if (e.key === "Enter") openDeskIcon(ic.dataset.f); });
    dragIcon(ic);
  });
}
function openDeskIcon(f) {
  if (f === "dir:reports") return openFinder("reports");
  const it = fsList("desktop").find((x) => x.id === f);
  if (it) openItem(it);
}
function selectIcons(list) { $$(".desk-icon").forEach((x) => x.classList.toggle("sel", list.includes(x))); }
function dragIcon(ic) {
  let s = null;
  ic.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    os.blurAll();
    selectIcons([ic]);
    s = { x: e.clientX, y: e.clientY, l: ic.offsetLeft, t: ic.offsetTop, moved: false };
    ic.setPointerCapture(e.pointerId);
  });
  ic.addEventListener("pointermove", (e) => {
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.moved && Math.hypot(dx, dy) < 4) return;
    s.moved = true;
    ic.classList.add("dragging");
    ic.style.left = Math.max(0, s.l + dx) + "px"; ic.style.top = Math.max(0, s.t + dy) + "px";
  });
  ic.addEventListener("pointerup", () => {
    if (!s) return;
    if (s.moved) {
      ic.classList.remove("dragging");
      // snap to a 12px grid like "Snap to grid"
      const x = Math.round(ic.offsetLeft / 12) * 12, y = Math.round(ic.offsetTop / 12) * 12;
      ic.style.left = x + "px"; ic.style.top = y + "px";
      setPref("iconPos", { ...(prefs.iconPos || {}), [ic.dataset.f]: { x, y } });
    }
    s = null;
  });
}
function rubberBand(e) {
  const box = h(`<div class="rubber"></div>`);
  const sx = e.clientX, sy = e.clientY;
  let started = false;
  const move = (ev) => {
    const x = Math.min(sx, ev.clientX), y = Math.min(sy, ev.clientY), w = Math.abs(ev.clientX - sx), hh = Math.abs(ev.clientY - sy);
    if (!started && w + hh < 6) return;
    if (!started) { started = true; document.body.append(box); }
    Object.assign(box.style, { left: x + "px", top: y + "px", width: w + "px", height: hh + "px" });
    selectIcons($$(".desk-icon").filter((ic) => { const r = ic.getBoundingClientRect(); return r.left < x + w && r.right > x && r.top < y + hh && r.bottom > y; }));
  };
  const up = () => { box.remove(); removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
  addEventListener("pointermove", move);
  addEventListener("pointerup", up);
}

// ---------------- hot corner ----------------
function hotCorner() {
  let t = null;
  addEventListener("pointermove", (e) => {
    if (!prefs.hotCorner || !desktopOn() || os.isPhone()) return;
    const inCorner = e.clientX <= 2 && e.clientY <= 2;
    if (inCorner && !t) t = setTimeout(() => { t = null; os.missionControl(); }, 220);
    if (!inCorner && t) { clearTimeout(t); t = null; }
  });
}

// ---------------- dock menu ----------------
export function dockMenu(appId, btn) {
  if (appId === "trash") {
    return popMenu([{ label: "فتح", run: () => openFinder("trash") }, "-", { label: "إفراغ سلة المهملات", disabled: !trashedNotes().length, run: emptyTrash }], { anchor: btn });
  }
  const ids = os.windowsOf(appId);
  const all = os.allWindows().filter((w) => w.app === appId);
  popMenu([
    ...all.map((w) => ({ label: w.title, checked: w.id === os.focused(), run: () => (w.minimized ? os.restore(w.id) : os.focus(w.id)) })),
    ...(all.length ? ["-"] : []),
    { label: ids.length ? "إظهار" : "فتح", run: () => os.launch(appId) },
    ...(ids.length ? [{ label: "إخفاء", run: () => hideApp(appId) }, "-", { label: "إنهاء", run: () => os.quit(appId) }] : []),
  ], { anchor: btn });
}

// ---------------- about ----------------
function about() {
  const m = state.config?.model || {};
  os.open("about", {
    title: "", width: 300, height: 410, resizable: false,
    render(b) {
      b.innerHTML = `<div class="about">
        <svg viewBox="0 0 64 64" class="about-logo"><path d="M14 44 C 14 24, 26 14, 46 14" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="46" cy="44" r="6" fill="currentColor"/></svg>
        <h2>مكتب رصين</h2><p class="about-ver">الإصدار ١٫٠</p>
        <dl><dt>الشريحة</dt><dd>نبض · ${esc(m.name || "ANN")}</dd>
        <dt>النموذج</dt><dd>AUC ${m.auc ? toAr(m.auc) : "—"}</dd>
        <dt>الذاكرة</dt><dd>${navigator.deviceMemory ? toAr(navigator.deviceMemory) + " جيجابايت" : "—"}</dd>
        <dt>الشاشة</dt><dd>${toAr(`${screen.width} × ${screen.height}`)}</dd>
        <dt>العملاء</dt><dd>${n(state.config?.pool || 0)} في قائمة الخطر</dd></dl>
        <button class="set-btn" id="aboutMore">مزيد من المعلومات…</button>
        <small>بنك رصين · مركز الاحتفاظ بالعملاء</small></div>`;
      $("#aboutMore", b).onclick = () => openSettings("about");
    },
  });
}
const APP_ABOUT = {
  call: "الجوال اللي تستقبل فيه العملاء المعرّضين للمغادرة.", crm: "بيانات العميل كما هي في ملفه، والحقول اللي تزعجه.",
  nabd: "حاسوب نبض: الشبكة العصبية اللي تقرأ المكالمة وتحسب مؤشر المحاكاة مباشرة.", mail: "رسائل مشرف الفريق.",
  report: "تقارير المكالمات بعد ما تنتهي.", finder: "ملفات المكتب: النموذج والتقارير والملاحظات.", notes: "ملاحظاتك، محفوظة في هذا المتصفح.",
  calc: "حاسبة بسيطة. تشتغل بلوحة المفاتيح بعد.", settings: "كل إعدادات المكتب.", viewer: "عارض المستندات النصية.", help: "شرح طريقة اللعب.",
  terminal: "طرفية مزيّفة فيها أسرار. اكتب help.",
};
function aboutApp(app) {
  alertBox({ iconHtml: os.appIcon(app), title: os.appName(app), text: APP_ABOUT[app] || "", buttons: [{ label: "حسناً", primary: true }] });
}

// ---------------- alerts, force quit ----------------
export function alertBox({ iconHtml, title, text, buttons = [{ label: "حسناً", primary: true }], countdown }) {
  const wrap = h(`<div class="alert-wrap"><div class="alert glass">${iconHtml ? `<div class="alert-ic">${iconHtml}</div>` : ""}<h4>${esc(title)}</h4><p>${esc(text)}</p><div class="alert-btns">${buttons.map((b, i) => `<button class="${b.primary ? "primary" : ""}" data-i="${i}">${esc(b.label)}</button>`).join("")}</div></div></div>`);
  document.body.append(wrap);
  sound.boop();
  let timer;
  const close = (i) => { clearInterval(timer); wrap.classList.add("out"); setTimeout(() => wrap.remove(), 200); buttons[i]?.run?.(); };
  $$(".alert-btns button", wrap).forEach((b) => (b.onclick = () => close(+b.dataset.i)));
  const keyFn = (e) => {
    if (!wrap.isConnected) return removeEventListener("keydown", keyFn, true);
    if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); removeEventListener("keydown", keyFn, true); close(buttons.findIndex((b) => b.primary)); }
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); removeEventListener("keydown", keyFn, true); close(buttons.findIndex((b) => !b.primary)); }
  };
  addEventListener("keydown", keyFn, true);
  if (countdown) {
    let left = countdown.secs;
    const p = $("p", wrap);
    const tick = () => { p.textContent = countdown.text(left); if (left-- <= 0) close(buttons.findIndex((b) => b.primary)); };
    tick();
    timer = setInterval(tick, 1000);
  }
  setTimeout(() => $(".alert-btns .primary", wrap)?.focus(), 30);
  return wrap;
}

function forceQuit() {
  os.open("forcequit", {
    title: "فرض إنهاء التطبيقات", width: 380, height: 360, resizable: false,
    render(b) {
      let sel = null;
      const draw = () => {
        const apps = os.runningApps().filter((a) => a !== "forcequit");
        b.innerHTML = `<div class="fq"><p>إذا تطبيق ما يستجيب، اختره واضغط «فرض الإنهاء».</p><div class="fq-list">${apps.length ? apps.map((a) => `<button data-a="${a}" class="${a === sel ? "sel" : ""}">${os.appIcon(a, "tiny")}<span>${esc(os.appName(a))}</span></button>`).join("") : `<div class="nc-empty">لا توجد تطبيقات مفتوحة</div>`}</div>
          <div class="alert-btns"><button class="primary" id="fqGo" ${sel ? "" : "disabled"}>فرض الإنهاء</button></div></div>`;
        $$(".fq-list button", b).forEach((x) => (x.onclick = () => { sel = x.dataset.a; draw(); }));
        $("#fqGo", b).onclick = () => {
          if (sel === "call" && callPhase() === "live") return alertBox({ iconHtml: os.appIcon("call"), title: "فيه مكالمة جارية", text: "أنهِ المكالمة أول من الزر الأحمر، بعدها تقدر تقفل الجوال." });
          os.quit(sel); sel = null; setTimeout(draw, 350);
        };
      };
      draw();
    },
  });
}

// ---------------- sleep and power ----------------
export function sleepNow() {
  closeMenu(); closeAllPanels();
  const s = h(`<div id="sleepScr"></div>`);
  document.body.append(s);
  sound.stopRing?.();
  const wake = () => {
    removeEventListener("keydown", wake, true);
    s.classList.add("out");
    setTimeout(() => { s.remove(); hooks.lock?.(true); }, 500);
  };
  setTimeout(() => { s.addEventListener("pointerdown", wake); addEventListener("keydown", wake, true); }, 800);
}

function power(kind) {
  const live = callPhase() === "live";
  const T = {
    restart: { title: "هل تريد إعادة التشغيل الآن؟", btn: "إعادة التشغيل", msg: (s) => `سيعاد تشغيل المكتب تلقائياً بعد ${toAr(s)} ثانية.` },
    shutdown: { title: "هل تريد إيقاف التشغيل الآن؟", btn: "إيقاف التشغيل", msg: (s) => `سيتوقف المكتب تلقائياً بعد ${toAr(s)} ثانية.` },
    logout: { title: `تسجيل خروج «${state.employee}»؟`, btn: "تسجيل الخروج", msg: (s) => `سيتم تسجيل خروجك تلقائياً بعد ${toAr(s)} ثانية. المكالمات والإحصائيات تنمسح.` },
  }[kind];
  alertBox({
    iconHtml: `<svg viewBox="0 0 64 64" class="alert-logo"><path d="M14 44 C 14 24, 26 14, 46 14" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="46" cy="44" r="6" fill="currentColor"/></svg>`,
    title: T.title, text: "",
    countdown: { secs: 60, text: (s) => (live ? "فيه مكالمة جارية وبتنقطع. " : "") + T.msg(s) },
    buttons: [{ label: "إلغاء" }, { label: T.btn, primary: true, run: () => doPower(kind) }],
  });
}
function doPower(kind) {
  const s = h(`<div id="powerScr"></div>`);
  document.body.append(s);
  if (kind === "logout") { try { localStorage.removeItem("rs-emp"); } catch {} }
  if (kind === "shutdown") {
    setTimeout(() => {
      s.innerHTML = `<button class="power-btn" aria-label="تشغيل"><svg viewBox="0 0 24 24"><path d="M12 3v8M7 6.3a7 7 0 1010 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><small>اضغط للتشغيل</small>`;
      $(".power-btn", s).onclick = () => location.reload();
    }, 1200);
    return;
  }
  setTimeout(() => location.reload(), 1300);
}
void emit; void sleep;
