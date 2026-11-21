// «إعدادات النظام»: every switch here really changes the desk.
import { $, $$, esc, n, toAr } from "../util.js";
import * as os from "../os.js";
import * as sound from "../sound.js";
import { state, emit, on } from "../state.js";
import { prefs, setPref } from "../prefs.js";

export const WALLPAPERS = [
  ["night", "ليل"], ["dawn", "فجر"], ["dunes", "كثبان"], ["sea", "بحر"], ["oasis", "واحة"], ["graphite", "جرافيت"],
];
export const ACCENTS = {
  blue: ["#0a84ff", "أزرق"], purple: ["#bf5af2", "بنفسجي"], red: ["#ff453a", "أحمر"], orange: ["#ff9f0a", "برتقالي"],
  yellow: ["#ffd60a", "أصفر"], green: ["#30d158", "أخضر"], graphite: ["#98989d", "جرافيت"],
};
const SECTIONS = [
  ["user", "الحساب", "#8e8e93", "ح"],
  ["appearance", "المظهر", "#0a84ff", "◐"],
  ["wallpaper", "خلفية الشاشة", "#30b0c7", "▦"],
  ["dock", "سطح المكتب والـDock", "#5e5ce6", "▭"],
  ["display", "الشاشة", "#0a84ff", "☀"],
  ["sound", "الصوت", "#ff375f", "♪"],
  ["notifications", "الإشعارات", "#ff453a", "●"],
  ["speech", "الكلام", "#bf5af2", "◉"],
  ["keyboard", "لوحة المفاتيح", "#8e8e93", "⌥"],
  ["about", "حول", "#636366", "ⓘ"],
];

let body = null, section = "appearance";

export function openSettings(sec) {
  if (sec) section = sec;
  if (os.isOpen("settings")) { render(); os.focus("settings"); return; }
  os.open("settings", {
    title: "إعدادات النظام", width: 720, height: 540, minW: 560, minH: 380,
    render(b) { body = b; render(); },
    onClose: () => { body = null; },
  });
}

const toggle = (k, label, note = "") => `<div class="set-row"><div><b>${label}</b>${note ? `<small>${note}</small>` : ""}</div><button class="switch ${prefs[k] ? "on" : ""}" data-toggle="${k}" role="switch" aria-checked="${!!prefs[k]}"><i></i></button></div>`;
const slider = (k, label, min, max, step, fmt) => `<div class="set-row"><div><b>${label}</b></div><div class="set-slider"><input type="range" min="${min}" max="${max}" step="${step}" value="${prefs[k]}" data-range="${k}"><output>${fmt(prefs[k])}</output></div></div>`;
const info = (k, v) => `<div class="set-row"><div><b>${k}</b></div><span class="set-val">${v}</span></div>`;

function pane() {
  const cfg = state.config || {}, m = cfg.model || {};
  switch (section) {
    case "user": return `
      <div class="set-hero"><div class="set-av">${esc((state.employee || "؟")[0])}</div><div><h3>${esc(state.employee)}</h3><p>موظف خدمة العملاء · مركز الاحتفاظ</p></div></div>
      <div class="set-group"><div class="set-row"><div><b>الاسم</b></div><input class="set-input" id="setName" value="${esc(state.employee)}" maxlength="24"></div>
      ${info("المكالمات اليوم", n(state.stats.calls))}${info("احتفظت بهم", n(state.stats.saved))}</div>`;
    case "appearance": return `
      <div class="set-group"><div class="set-row"><div><b>المظهر</b><small>المكتب داكن دائماً، مثل غرفة مراقبة.</small></div><span class="set-val">داكن</span></div>
      <div class="set-row"><div><b>لون التمييز</b></div><div class="swatches">${Object.entries(ACCENTS).map(([k, [c, l]]) => `<button class="sw ${prefs.accent === k ? "on" : ""}" style="--c:${c}" data-accent="${k}" title="${l}"></button>`).join("")}</div></div>
      ${toggle("reduceMotion", "تقليل الحركة", "يلغي حركة التصغير إلى الـDock.")}</div>`;
    case "wallpaper": return `
      <div class="wall-grid">${WALLPAPERS.map(([k, l]) => `<button class="wall-pick ${prefs.wallpaper === k ? "on" : ""}" data-wall="${k}"><span class="wp wp-${k}"></span><em>${l}</em></button>`).join("")}
      <label class="wall-pick ${prefs.wallpaper === "custom" ? "on" : ""}"><span class="wp wp-add">+</span><em>صورة من جهازك</em><input type="file" accept="image/*" id="wallFile" hidden></label></div>`;
    case "dock": return `
      <div class="set-group">${slider("dockSize", "حجم الـDock", 40, 72, 1, (v) => toAr(v))}
      ${toggle("magnify", "التكبير عند المرور")}
      ${toggle("hotCorner", "الزاوية النشطة", "حرّك المؤشر للزاوية العلوية اليسرى لفتح Mission Control.")}</div>`;
    case "display": return `<div class="set-group">${slider("brightness", "السطوع", 0.35, 1, 0.01, (v) => toAr(Math.round(v * 100)) + "٪")}
      ${info("الدقة", toAr(`${screen.width} × ${screen.height}`))}${info("كثافة البكسل", toAr(devicePixelRatio) + "x")}</div>`;
    case "sound": return `<div class="set-group">${slider("volume", "مستوى الصوت", 0, 1, 0.01, (v) => toAr(Math.round(v * 100)) + "٪")}
      ${toggle("sfx", "أصوات الواجهة", "الإشعارات والنتائج. الرنين وصوت العميل يبقون.")}
      <div class="set-row"><div><b>جرّب</b></div><button class="set-btn" id="setTest">تشغيل</button></div></div>`;
    case "notifications": return `<div class="set-group">${toggle("dnd", "عدم الإزعاج", "تختفي الإشعارات وتنحفظ في مركز الإشعارات. المكالمات ترن عادي.")}
      <div class="set-row"><div><b>الإشعارات المحفوظة</b></div><span class="set-val">${n(os.history.length)}</span></div></div>`;
    case "speech": return `<div class="set-group">${info("صوت العميل", cfg.voice === "elevenlabs" ? "ElevenLabs" : "صوت المتصفح")}
      ${info("عقل العميل", cfg.brain === "claude" ? "Claude" : "سيناريو بدون اتصال")}
      ${slider("speechRate", "سرعة كلام العميل", 0.8, 1.3, 0.01, (v) => toAr(v.toFixed(2)) + "x")}
      ${info("التعرّف على كلامك", "webkitSpeechRecognition" in window || "SpeechRecognition" in window ? "متاح (ar-SA)" : "غير متاح في هذا المتصفح")}</div>`;
    case "keyboard": return `<div class="set-group keys-list">${[
      ["⌘K  أو  ⌥Space", "Spotlight"], ["⌥Tab", "التبديل بين التطبيقات"], ["⌥W", "إغلاق النافذة"], ["⌥M", "تصغير"], ["⌥H", "إخفاء التطبيق"],
      ["⌥Q", "إنهاء التطبيق"], ["⌥N", "جديد"], ["⌥,", "الإعدادات"], ["⌥↑  أو  F3", "Mission Control"], ["F4", "التطبيقات"], ["⌥F", "ملء الشاشة"],
      ["⌥L", "قفل الشاشة"], ["⌥←  ⌥→", "ترتيب النافذة يسار أو يمين"], ["مسافة مطوّلاً", "الكلام أثناء المكالمة"],
    ].map(([k, l]) => `<div class="set-row"><div><b>${l}</b></div><kbd dir="ltr">${k}</kbd></div>`).join("")}</div>
      <p class="set-note">المتصفح يحجز ⌘W و⌘Q و⌘M، لذلك نستخدم ⌥ (Option).</p>`;
    case "about": return `
      <div class="set-hero"><svg viewBox="0 0 64 64" class="set-logo"><path d="M14 44 C 14 24, 26 14, 46 14" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="46" cy="44" r="6" fill="currentColor"/></svg><div><h3>مكتب رصين</h3><p class="set-ver">الإصدار ١٫٠</p></div></div>
      <div class="set-group">${info("النموذج", esc(m.name || "ANN"))}${info("نوع النموذج", esc(m.kind || "—"))}${info("AUC", m.auc ? toAr(m.auc) : "—")}
      ${info("الخصائص", n((m.features || []).length))}${info("البيانات", esc(m.dataset || "UCI Bank Marketing"))}${info("عملاء في قائمة الخطر", n(cfg.pool || 0))}
      ${info("الذاكرة", navigator.deviceMemory ? toAr(navigator.deviceMemory) + " جيجابايت" : "—")}${info("المعالج", navigator.hardwareConcurrency ? toAr(navigator.hardwareConcurrency) + " أنوية" : "—")}</div>`;
  }
  return "";
}

function render() {
  if (!body) return;
  const scroll = $(".set-pane", body)?.scrollTop || 0;
  body.innerHTML = `<div class="settings">
    <aside class="set-side"><div class="set-me"><div class="set-av sm">${esc((state.employee || "؟")[0])}</div><div><b>${esc(state.employee)}</b><small>الحساب</small></div></div>
      ${SECTIONS.slice(1).map(([k, l, c, g]) => `<button data-sec="${k}" class="${k === section ? "sel" : ""}"><i style="background:${c}">${g}</i>${l}</button>`).join("")}</aside>
    <section class="set-pane"><h2>${SECTIONS.find((s) => s[0] === section)[1]}</h2>${pane()}</section></div>`;
  $(".set-pane", body).scrollTop = scroll;
  $(".set-me", body).onclick = () => { section = "user"; render(); };
  $$("[data-sec]", body).forEach((b) => (b.onclick = () => { section = b.dataset.sec; sound.click(); render(); }));
  $$("[data-toggle]", body).forEach((b) => (b.onclick = () => { setPref(b.dataset.toggle, !prefs[b.dataset.toggle]); render(); }));
  $$("[data-range]", body).forEach((r) => {
    const k = r.dataset.range;
    r.oninput = () => { setPref(k, +r.value); r.nextElementSibling.textContent = r.closest(".set-row").querySelector("output").textContent = fmtFor(k, +r.value); };
  });
  $$("[data-accent]", body).forEach((b) => (b.onclick = () => { setPref("accent", b.dataset.accent); render(); }));
  $$("[data-wall]", body).forEach((b) => (b.onclick = () => { setPref("wallpaper", b.dataset.wall); render(); }));
  $("#wallFile", body)?.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { setWallImage(r.result); setPref("wallpaper", "custom"); render(); };
    r.readAsDataURL(f);
  });
  $("#setTest", body)?.addEventListener("click", () => { sound.unlock(); sound.win(); });
  $("#setName", body)?.addEventListener("change", (e) => {
    const v = e.target.value.trim();
    if (!v) return;
    state.employee = v;
    try { localStorage.setItem("rs-emp", v); } catch {}
    emit("employee");
    render();
  });
}
const fmtFor = (k, v) => k === "dockSize" ? toAr(v) : k === "speechRate" ? toAr(v.toFixed(2)) + "x" : toAr(Math.round(v * 100)) + "٪";

export function setWallImage(url) {
  document.body.style.setProperty("--wall-img", `url("${url}")`);
  try { localStorage.setItem("rs-wallimg", url); } catch { os.notify({ app: "الإعدادات", text: "الصورة كبيرة للحفظ. بتبقى خلفية لين تحدّث الصفحة." }); }
}

on("prefs", (k) => { if (body && (k === "dnd" || k === "volume" || k === "brightness") && !document.activeElement?.matches("input[type=range]")) render(); });
