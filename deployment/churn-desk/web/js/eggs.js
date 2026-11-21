// Easter eggs and small jokes hidden around the desk.
import { $, $$, h, esc, toAr, sleep } from "./util.js";
import * as os from "./os.js";
import * as sound from "./sound.js";
import { state, on } from "./state.js";
import { prefs, setPref } from "./prefs.js";
import { callPhase } from "./apps/call.js";

let hooks = {};
const LOGO = `<svg viewBox="0 0 64 64"><path d="M14 44 C 14 24, 26 14, 46 14" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="46" cy="44" r="6" fill="currentColor"/></svg>`;
const deskOn = () => !$("#desktop").classList.contains("hidden") && !$("#sleepScr") && !$("#powerScr");
const inCall = () => ["live", "ringing", "connecting"].includes(callPhase());
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const busy = () => !!$(".egg-layer");

export function init(h_) {
  hooks = h_;
  os.registerApp("egg", bossMode, { name: "جداول", hidden: true, icon: "▦", iconClass: "ic-sheet" });
  konami();
  logoSpin();
  rageClicks();
  shakeCursor();
  screensaver();
  coworkers();
  versionTaps();
  if (prefs.devMode) addTerminalToDock();
  setTimeout(timeJoke, 9000);
}

// ---------------- big effects ----------------
export function confetti(ms = 3200) {
  const c = h(`<canvas class="egg-confetti"></canvas>`);
  document.body.append(c);
  const x = c.getContext("2d"), W = (c.width = innerWidth), H = (c.height = innerHeight);
  const colors = ["#ff453a", "#ff9f0a", "#ffd60a", "#30d158", "#0a84ff", "#bf5af2", "#ffffff"];
  const ps = Array.from({ length: 220 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 200, y: H + 10, vx: (Math.random() - 0.5) * 16, vy: -(12 + Math.random() * 14),
    r: 4 + Math.random() * 6, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, c: pick(colors),
  }));
  const t0 = performance.now();
  const step = (t) => {
    x.clearRect(0, 0, W, H);
    ps.forEach((p) => {
      p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); x.restore();
    });
    if (t - t0 < ms) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
  try { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => sound.pop(), i * 70)); } catch {}
}

export function party() {
  confetti();
  document.body.classList.add("egg-party");
  setTimeout(() => document.body.classList.remove("egg-party"), 4200);
  os.notify({ app: "رصين", icon: "🎉", iconBg: "linear-gradient(150deg,#ff9f0a,#ff375f)", title: "وضع الاحتفال", text: "الحمدلله المدير ما شاف شي." });
}

export function barrelRoll() {
  sound.boop();
  $("#desktop").animate([{ transform: "rotate(0)" }, { transform: "rotate(360deg)" }], { duration: 1500, easing: "cubic-bezier(.6,0,.3,1)" });
}

// Every window and icon falls off the screen, then everything comes back.
export async function crumble() {
  const els = [...$$(".win:not(.minimized)"), ...$$(".dock-app"), ...$$(".desk-icon"), ...$$(".widget"), $(".menubar")].filter(Boolean);
  sound.trash();
  const anims = els.map((el, i) => el.animate(
    [{ transform: "none" }, { transform: `translateY(${innerHeight + 200}px) rotate(${(Math.random() - 0.5) * 120}deg)` }],
    { duration: 1100 + Math.random() * 500, delay: i * 35, easing: "cubic-bezier(.5,0,.9,.4)", fill: "forwards" },
  ));
  await sleep(2300);
  hooks.alertBox?.({ iconHtml: `<span class="egg-big">😅</span>`, title: "امزح معك", text: "ما انحذف شي. بس لا تكتبها مرة ثانية على جهاز حقيقي.", buttons: [{ label: "رجّع كل شي", primary: true, run: () => anims.forEach((a) => { a.reverse(); a.finished.then(() => a.cancel()); }) }] });
}

// Green rain of Arabic letters. Any key or click ends it.
export function matrix() {
  if (busy()) return;
  const c = h(`<canvas class="egg-layer egg-matrix"></canvas>`);
  document.body.append(c);
  const x = c.getContext("2d"), W = (c.width = innerWidth), H = (c.height = innerHeight), fs = 18;
  const cols = Array.from({ length: Math.ceil(W / fs) }, () => Math.random() * -H / fs);
  const chars = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي٠١٢٣٤٥٦٧٨٩";
  let on = true;
  const step = () => {
    if (!on) return;
    x.fillStyle = "rgba(0,0,0,.08)"; x.fillRect(0, 0, W, H);
    x.font = `${fs}px monospace`;
    cols.forEach((y, i) => {
      x.fillStyle = Math.random() < 0.05 ? "#d6ffd6" : "#2bff6a";
      x.fillText(pick(chars), i * fs, y * fs);
      cols[i] = y * fs > H && Math.random() > 0.975 ? 0 : y + 1;
    });
    requestAnimationFrame(step);
  };
  step();
  const stop = (e) => { e?.preventDefault?.(); e?.stopImmediatePropagation?.(); on = false; c.classList.add("out"); setTimeout(() => c.remove(), 400); removeEventListener("keydown", stop, true); };
  setTimeout(() => { addEventListener("keydown", stop, true); c.addEventListener("pointerdown", stop); }, 400);
}

// ---------------- boss key ----------------
export function bossMode() {
  os.allWindows().filter((w) => !w.minimized && w.id !== "egg:boss").forEach((w) => os.minimize(w.id));
  const rows = ["الإيرادات", "المصاريف التشغيلية", "تكلفة القهوة", "اجتماعات كان ممكن تكون إيميل", "صافي الربح", "مؤشر الاحتفاظ", "الأقلام الضائعة", "ساعات العمل الفعلي"];
  const q = ["الربع ١", "الربع ٢", "الربع ٣", "الربع ٤"];
  os.open("egg:boss", {
    title: "التقرير الربعي_نهائي_نهائي_٢.xlsx", app: "egg", width: 760, height: 430,
    render(b) {
      b.innerHTML = `<div class="egg-sheet"><table><tr><th></th>${q.map((x) => `<th>${x}</th>`).join("")}</tr>${rows.map((r) => `<tr><td>${r}</td>${q.map(() => `<td>${toAr((Math.random() * 900 + 100).toFixed(1))}</td>`).join("")}</tr>`).join("")}</table>
        <p class="egg-sheet-note">آخر تعديل: الآن · اشتغلت عليه طول اليوم</p></div>`;
    },
  });
}

// ---------------- the "don't open" file ----------------
export function dontOpen() {
  const id = "egg:dont";
  if (os.isOpen(id)) return os.focus(id);
  let runs = 0;
  const el = os.open(id, {
    title: "لا تفتح.txt", app: "viewer", width: 420, height: 260, resizable: false,
    render(b) {
      b.innerHTML = `<article class="viewer egg-dont"><h3>قلنا لك لا تفتح.</h3><p>الحين بتحاول تقفلني؟ حاول.</p></article>`;
    },
  });
  const btn = $(".l-close", el);
  btn.addEventListener("pointerenter", () => {
    if (runs >= 4) return;
    runs++;
    const a = os.area(), w = el.offsetWidth;
    el.style.transition = "left .25s cubic-bezier(.3,1.4,.5,1), top .25s cubic-bezier(.3,1.4,.5,1)";
    el.style.left = 20 + Math.random() * (a.w - w - 40) + "px";
    el.style.top = 20 + Math.random() * (a.h - el.offsetHeight - 40) + "px";
    setTimeout(() => (el.style.transition = ""), 300);
    sound.boop();
    const p = $(".egg-dont p", el);
    p.textContent = ["قريب… بس لا.", "هههه بطيء.", "طيب طيب، آخر مرة.", "خلاص، تقدر تقفلني. استسلمت."][runs - 1];
  });
}

// ---------------- coffee ----------------
export function coffee() {
  os.notify({ app: "آلة القهوة", icon: "☕", iconBg: "linear-gradient(150deg,#c08a5b,#6b3f22)", title: "جاري التحضير", text: "قهوة سعودية بالهيل. دقيقة وتجهز." });
  setTimeout(() => os.notify({ app: "آلة القهوة", icon: "☕", iconBg: "linear-gradient(150deg,#c08a5b,#6b3f22)", title: "قهوتك جاهزة", text: "تقرّب العميل الجاي لك أكثر. (تأثيرها نفسي بس.)" }), 12000);
}
export function shawarma() {
  os.notify({ app: "توصيل", icon: "🌯", iconBg: "linear-gradient(150deg,#ffcf6b,#e07b1f)", title: "تم الطلب", text: "شاورما دجاج عربي، زيادة ثوم. الوصول خلال ٢٠ ثانية." });
  setTimeout(() => os.notify({ app: "توصيل", icon: "🛵", iconBg: "linear-gradient(150deg,#ffcf6b,#e07b1f)", title: "المندوب عند الباب", text: "للأسف الشاورما افتراضية. ريحتها بس وصلت." }), 20000);
}

// ---------------- Spotlight eggs ----------------
const EGGS = [
  { k: ["do a barrel roll", "barrel", "لف", "دوران"], label: "لف لفة كاملة", icon: "🌀", run: barrelRoll },
  { k: ["matrix", "ماتريكس", "المصفوفه"], label: "ادخل المصفوفة", icon: "🟩", run: matrix },
  { k: ["party", "حفله", "احتفال"], label: "حفلة", icon: "🎉", run: party },
  { k: ["coffee", "قهوه", "قهوة"], label: "سوّ لي قهوة", icon: "☕", run: coffee },
  { k: ["shawarma", "شاورما", "جوعان", "غداء"], label: "اطلب شاورما", icon: "🌯", run: shawarma },
  { k: ["boss", "المدير", "مدير"], label: "المدير جاي! (وضع الشغل)", icon: "💼", run: bossMode },
  { k: ["screensaver", "شاشه التوقف", "توقف"], label: "شاشة التوقف", icon: "🖥", run: () => startSaver() },
  { k: ["42", "معنى الحياه", "meaning of life"], label: "معنى الحياة والكون وكل شي = ٤٢", icon: "🌌", run: () => os.notify({ app: "Spotlight", text: "٤٢. وما عندي تفاصيل أكثر." }) },
  { k: ["rm -rf", "احذف كل شي", "حذف الكل"], label: "احذف كل شي", icon: "💣", run: crumble },
  { k: ["sudo", "صلاحيات"], label: "sudo", icon: "🔑", run: () => os.notify({ app: "النظام", text: `${state.employee} ليس في ملف sudoers. تم إبلاغ المدير.` }) },
  { k: ["كبسه", "kabsa"], label: "وصفة الكبسة", icon: "🍛", run: () => hooks.alertBox?.({ iconHtml: `<span class="egg-big">🍛</span>`, title: "كبسة على السريع", text: "رز، دجاج، بهارات كبسة، ليمون أسود، وصبر. المقادير الدقيقة عند أمك." }) },
];
export function spotEggs(nq) {
  if (!nq || nq.length < 2) return [];
  return EGGS.filter((e) => e.k.some((k) => k === nq || (nq.length >= 3 && (k.startsWith(nq) || nq.startsWith(k))))).map((e) => ({
    group: "أسرار", label: e.label, iconHtml: `<span class="spot-glyph egg">${e.icon}</span>`, run: e.run, sub: "سر",
  }));
}

// ---------------- Konami code ----------------
function konami() {
  const code = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
  let i = 0;
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea")) return;
    i = e.code === code[i] ? i + 1 : e.code === code[0] ? 1 : 0;
    if (i === code.length) { i = 0; party(); }
  }, true);
}

// ---------------- the logo gets dizzy ----------------
function logoSpin() {
  const b = $('.mb-menu[data-menu="logo"]');
  if (!b) return;
  let taps = [];
  b.addEventListener("pointerdown", () => {
    const t = Date.now();
    taps = taps.filter((x) => t - x < 1600).concat(t);
    if (taps.length >= 5) {
      taps = [];
      setTimeout(() => hooks.closeMenu?.(), 10);
      b.animate([{ transform: "rotate(0)" }, { transform: "rotate(1080deg)" }], { duration: 1200, easing: "cubic-bezier(.2,.8,.2,1)" });
      os.notify({ app: "رصين", icon: LOGO, iconBg: "#0c0c12", text: "دوّختني. خلاص." });
    }
  });
}

// ---------------- clicking the same Dock icon again and again ----------------
function rageClicks() {
  const hits = {};
  const LINES = {
    call: "الجوال شغّال. العملاء هم اللي ما يتصلون.", nabd: "أنا أشتغل. الضغط ما يسرّعني.", mail: "ما فيه بريد جديد. والله.",
    trash: "السلة تقول: أنا مو كيس ملاكمة.", calc: "١ + ١ = ٢. ارتحت؟", settings: "الإعدادات ما بتصلّح يومك.",
  };
  $("#dock").addEventListener("click", (e) => {
    const b = e.target.closest(".dock-app[data-app]");
    if (!b) return;
    const id = b.dataset.app, t = Date.now();
    hits[id] = (hits[id] || []).filter((x) => t - x < 2200).concat(t);
    if (hits[id].length === 6) {
      b.animate([{ transform: "rotate(0)" }, { transform: "rotate(-14deg)" }, { transform: "rotate(14deg)" }, { transform: "rotate(-10deg)" }, { transform: "rotate(0)" }], { duration: 420 });
      os.notify({ app: os.appName(id), icon: os.appIcon(id, "tiny"), text: LINES[id] || "خلاص فتحته! هدّ أعصابك." });
    }
  });
}

// ---------------- shake the mouse to find the cursor (like macOS) ----------------
function shakeCursor() {
  let last = null, dir = 0, flips = [], timer = null;
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    if (last != null) {
      const dx = e.clientX - last;
      if (Math.abs(dx) > 14) {
        const d = Math.sign(dx);
        if (d !== dir) { const t = performance.now(); flips = flips.filter((x) => t - x < 650).concat(t); dir = d; }
      }
    }
    last = e.clientX;
    if (flips.length >= 6) {
      document.body.classList.add("egg-bigcursor");
      clearTimeout(timer);
      timer = setTimeout(() => document.body.classList.remove("egg-bigcursor"), 900);
    }
  }, { passive: true });
}

// ---------------- screensaver ----------------
let saverEl = null, idleT = null;
function screensaver() {
  const reset = () => { clearTimeout(idleT); idleT = setTimeout(() => { if (deskOn() && !inCall() && !busy() && !document.hidden) startSaver(); }, 90_000); };
  ["pointermove", "pointerdown", "keydown", "wheel"].forEach((ev) => addEventListener(ev, reset, { passive: true, capture: true }));
  on("call:started", reset);
  reset();
}
export function startSaver() {
  if (saverEl || busy()) return;
  saverEl = h(`<div class="egg-layer egg-saver"><div class="egg-dvd">${LOGO}<b>رصين</b></div><small>حرّك الماوس للرجوع</small></div>`);
  document.body.append(saverEl);
  const box = $(".egg-dvd", saverEl);
  const hues = ["#ff453a", "#ff9f0a", "#ffd60a", "#30d158", "#64d2ff", "#bf5af2", "#ff375f"];
  let x = 80, y = 80, vx = 2.4, vy = 2, hue = 0, alive = true, corners = 0;
  const step = () => {
    if (!alive) return;
    const W = innerWidth - box.offsetWidth, H = innerHeight - box.offsetHeight;
    x += vx; y += vy;
    let hit = 0;
    if (x <= 0 || x >= W) { vx = -vx; x = Math.max(0, Math.min(W, x)); hit++; }
    if (y <= 0 || y >= H) { vy = -vy; y = Math.max(0, Math.min(H, y)); hit++; }
    if (hit) { hue = (hue + 1) % hues.length; box.style.color = hues[hue]; }
    if (hit === 2) { corners++; confetti(1800); }
    box.style.transform = `translate(${x}px, ${y}px)`;
    requestAnimationFrame(step);
  };
  box.style.color = hues[0];
  requestAnimationFrame(step);
  const t0 = Date.now();
  const stop = (e) => {
    if (Date.now() - t0 < 700) return;
    if (e.type === "keydown") { e.preventDefault(); e.stopImmediatePropagation(); }
    alive = false;
    ["pointermove", "pointerdown", "keydown"].forEach((ev) => removeEventListener(ev, stop, true));
    const s = saverEl; saverEl = null;
    s.classList.add("out"); setTimeout(() => s.remove(), 400);
    if (corners) os.notify({ app: "شاشة التوقف", text: `الشعار ضرب الزاوية ${toAr(corners)} مرة وأنت مو موجود. فاتك.` });
  };
  ["pointermove", "pointerdown", "keydown"].forEach((ev) => addEventListener(ev, stop, true));
}

// ---------------- coworkers who message you ----------------
const PEOPLE = {
  fahad: ["أبو فهد · المحاسبة", "ف", "linear-gradient(150deg,#7ad3ff,#2f7fe0)"],
  noura: ["نورة · الجودة", "ن", "linear-gradient(150deg,#ffb3d1,#e0457a)"],
  salman: ["سلمان · مشرف الفريق", "س", "linear-gradient(150deg,#ffe0a3,#f39a3d)"],
  it: ["الدعم الفني", "IT", "linear-gradient(150deg,#9aa3b5,#545c6e)"],
  guard: ["عم صالح · الأمن", "ص", "linear-gradient(150deg,#b5e6a1,#3f9a48)"],
  hr: ["الموارد البشرية", "HR", "linear-gradient(150deg,#d7b8ff,#7b4fd6)"],
};
const MSGS = [
  { p: "fahad", t: "مين أخذ شاحني من على مكتبي؟ أبو رأس أبيض.", a: [["مو أنا", "طيب. بس لو شفته قل لي."], ["أنا 😅", "رجّعه قبل الساعة ٣ وإلا بنتكلم."]] },
  { p: "it", t: "جربت تطفيه وتشغله؟", a: [["إيه", "غريب. جرب مرة ثانية."], ["لا", "جرب وارجع لي. تذكرتك رقم ٤٠٤."]] },
  { p: "noura", t: "تذكير: اجتماع الجودة بعد ٥ دقايق. كان ممكن يكون إيميل بس مشينا." },
  { p: "salman", t: "شغلك اليوم ممتاز. لا تتعود على المدح." },
  { p: "guard", t: "فيه سيارة بيضاء واقفة غلط بالمواقف. لك؟", a: [["مو لي", "طيب أكلم الباقين."], ["لي", "انزل حرّكها الله يرضى عليك."]] },
  { p: "hr", t: "نذكّركم أن الكيك في غرفة الاستراحة للجميع. مو لأبو فهد بس." },
  { p: "fahad", t: "لقيت الشاحن. كان في شنطتي. السموحة." },
  { p: "noura", t: "أحد حط تونة بالمايكرويف؟ الدور كله يشم." },
  { p: "it", t: "سيتم تحديث الأنظمة الساعة ٢ الفجر. لا أحد يكون صاحي." },
  { p: "salman", t: "اللي يحتفظ بأكثر عملاء اليوم عليه قهوة الفريق. أقصد له." },
];
let msgI = 0;
function coworkers() {
  const loop = () => setTimeout(() => {
    if (deskOn() && !inCall() && !busy() && !document.hidden) sendMsg();
    loop();
  }, (150 + Math.random() * 150) * 1000);
  setTimeout(() => { if (deskOn() && !inCall()) sendMsg(); loop(); }, 120_000);
}
export function sendMsg(m = MSGS[msgI++ % MSGS.length]) {
  const [name, ic, bg] = PEOPLE[m.p];
  os.notify({
    app: "الرسائل", icon: ic, iconBg: bg, title: name, text: m.t, ttl: 9000,
    actions: m.a?.map(([label, reply]) => ({ label, do: () => setTimeout(() => os.notify({ app: "الرسائل", icon: ic, iconBg: bg, title: name, text: reply }), 1400) })),
  });
}

// ---------------- time of day ----------------
function timeJoke() {
  const d = new Date(), hr = d.getHours(), day = d.getDay();
  let t = null;
  if (hr >= 23 || hr < 5) t = `الساعة ${toAr(hr % 12 || 12)} وأنت تداوم؟ حتى المدير نايم.`;
  else if (day === 5) t = "اليوم جمعة! وش جابك المكتب؟";
  else if (day === 4 && hr >= 13) t = "خميس العصر. الكل طلع بدري إلا أنت.";
  else if (day === 0 && hr < 10) t = "أحد الصبح. الله يعينك على الأسبوع.";
  if (t) os.notify({ app: "رصين", icon: LOGO, iconBg: "#0c0c12", text: t });
}

// ---------------- developer mode (tap the version 7 times) ----------------
function versionTaps() {
  let n = 0, t0 = 0;
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".about-ver, .set-ver")) return;
    if (Date.now() - t0 > 3000) n = 0;
    t0 = Date.now(); n++;
    if (prefs.devMode) { if (n === 1) os.notify({ app: "رصين", text: "أنت مطوّر من قبل. لا تبالغ." }); return; }
    if (n >= 3 && n < 7) os.notify({ app: "رصين", text: `باقي ${7 - n === 1 ? "ضغطة وحدة" : 7 - n === 2 ? "ضغطتين" : toAr(7 - n) + " ضغطات"} وتصير مطوّر.`, ttl: 1500 });
    if (n === 7) {
      setPref("devMode", true);
      addTerminalToDock();
      confetti(2200);
      os.notify({ app: "رصين", icon: LOGO, iconBg: "#0c0c12", title: "صرت مطوّر!", text: "انضاف «تيرمينال» للـDock. جرّب help." });
    }
  });
}
export function addTerminalToDock() {
  if ($('.dock-app[data-app="terminal"]')) return;
  const b = h(`<button class="dock-app" data-app="terminal" title="تيرمينال">${os.appIcon("terminal")}<em></em></button>`);
  $("#dockMinSep").before(b);
  b.addEventListener("click", () => os.launch("terminal"));
  b.addEventListener("contextmenu", (e) => { e.preventDefault(); hooks.dockMenu?.("terminal", b); });
  os.dockState("terminal");
}

export const TERM_ICON = `<span class="tty-ic">&gt;_</span>`;
