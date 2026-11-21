import { $, sleep, clock, dateLine, api, n, pct } from "./util.js";
import * as os from "./os.js";
import * as sound from "./sound.js";
import * as voice from "./voice.js";
import { state, on } from "./state.js";
import { openCall, incoming } from "./apps/call.js";
import { openCrm } from "./apps/crm.js";
import { openNabd } from "./apps/nabd.js";
import { openMail, addMail } from "./apps/mail.js";
import { openReport } from "./apps/report.js";
import { openHelp } from "./apps/help.js";
import { openFinder, TRASH_SVG } from "./apps/finder.js";
import { openNotes, trashedNotes } from "./apps/notes.js";
import { openCalc } from "./apps/calc.js";
import { openSettings } from "./apps/settings.js";
import * as mac from "./mac.js";
import { openTerminal } from "./apps/terminal.js";
import { TERM_ICON } from "./eggs.js";

const show = (id) => { const e = $(id); e.classList.remove("hidden", "fade-out"); e.classList.add("fade-in"); };
const hide = async (id) => { const e = $(id); e.classList.add("fade-out"); await sleep(650); e.classList.add("hidden"); e.classList.remove("fade-in"); };

async function boot() {
  const cfgP = api("/api/config").catch(() => null);
  lockClock();
  await sleep(2200);
  state.config = await cfgP;
  if (!state.config) {
    $(".boot-bar").outerHTML = `<div style="color:#8b91a0;font-size:14px;text-align:center">الخادم غير متاح.<br>شغّله ثم حدّث الصفحة.</div>`;
    return;
  }
  voice.setMode(state.config.voice);
  await hide("#boot");
  show("#lock");
  const saved = (() => { try { return localStorage.getItem("rs-emp") || ""; } catch { return ""; } })();
  const inp = $("#empName");
  inp.value = saved;
  updateAvatar();
  inp.addEventListener("input", updateAvatar);
  setTimeout(() => inp.focus(), 600);
  lockStory();
}

// Lock-screen notifications that set the scene before you log in.
async function lockStory() {
  const pool = state.config.pool;
  const items = [
    { app: "نظام التنبؤ بالمغادرة", time: "٨:٠٢ ص", icon: "◔", bg: "linear-gradient(150deg,#ff8a7a,#e0453a)",
      title: `${n(pool)} عميل في قائمة الخطر`, text: "سجلات من مجموعة الاختبار بدرجة رفض عرض مرتفعة. حالات الاتصال تدريبية." },
    { app: "سلمان · مشرف الفريق", time: "٨:١٥ ص", icon: "س", bg: "linear-gradient(150deg,#ffe0a3,#f39a3d)",
      title: "مناوبة الاحتفاظ", text: "اسمع قبل ما تعرض، ولا تضغط على أحد. كل عميل نحتفظ فيه يفرق." },
    { app: "نبض", time: "الآن", icon: `<i class="orb-mini"></i>`, bg: "radial-gradient(circle at 50% 40%,#1b1a2e,#08080f)",
      title: "جاهز أراقب مكالماتك", text: "بقرأ كل رد منك وأقول لك مباشرة إذا العميل يقرب أو يبعد." },
  ];
  const box = $("#lockNotifs");
  box.innerHTML = "";
  for (const it of items) {
    await sleep(700);
    box.insertAdjacentHTML("beforeend", `
      <div class="lock-notif glass">
        <div class="n-ic" style="background:${it.bg}">${it.icon}</div>
        <div>
          <div class="n-head"><b>${it.app}</b><span>${it.time}</span></div>
          <div class="n-text"><b>${it.title}</b></div>
          <div class="n-text">${it.text}</div>
        </div>
      </div>`);
    sound.pop();
  }
}

function updateAvatar() {
  const v = $("#empName").value.trim();
  $(".lock-avatar span").textContent = v ? v[0] : "؟";
}

function lockClock() {
  const t = () => { $("#lockTime").textContent = clock(); $("#lockDate").textContent = dateLine(); };
  t();
  setInterval(t, 10_000);
}

let desktopReady = false;

// Lock the screen; logging back in returns to the same desk.
async function lockScreen(instant) {
  if (!$("#lock").classList.contains("hidden")) return;
  mac.closeMenu();
  if (instant) $("#desktop").classList.add("hidden"); else await hide("#desktop");
  $(".lock-avatar").style.transform = "";
  $(".lock-hint").textContent = "الشاشة مقفلة. اضغط Enter للرجوع.";
  show("#lock");
  $("#empName").value = state.employee;
  updateAvatar();
  setTimeout(() => $("#empName").focus(), 300);
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  sound.unlock();
  const name = $("#empName").value.trim();
  if (!name) { const c = $(".lock-card"); c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake"); return; }
  state.employee = name;
  try { localStorage.setItem("rs-emp", name); } catch {}
  $(".lock-avatar").style.transform = "scale(1.15)";
  await hide("#lock");
  if (desktopReady) { show("#desktop"); return; }
  desktopReady = true;
  enterDesktop();
});

async function enterDesktop() {
  show("#desktop");
  const hr = new Date().getHours();
  $("#greetHi").textContent = `${hr < 12 ? "صباح الخير" : "مساء الخير"}، ${state.employee}`;
  os.startClock();
  const doc = `<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" fill="currentColor" opacity=".9"/></svg>`;
  os.registerApp("finder", () => openFinder("docs"), { name: "الملفات", keywords: "finder files ملفات" });
  os.registerApp("launchpad", mac.launchpad, { name: "التطبيقات", keywords: "launchpad apps", dockClick: mac.launchpad, hidden: true });
  os.registerApp("call", openCall, { name: "المكالمات", keywords: "phone call جوال اتصال" });
  os.registerApp("crm", openCrm, { name: "ملف العميل", keywords: "crm customer عميل" });
  os.registerApp("nabd", openNabd, { name: "نبض", keywords: "nabd ann model نموذج" });
  os.registerApp("mail", openMail, { name: "البريد", keywords: "mail بريد رسائل" });
  os.registerApp("report", openReport, { name: "التقارير", keywords: "report تقرير" });
  os.registerApp("notes", () => openNotes(), { name: "الملاحظات", keywords: "notes ملاحظه" });
  os.registerApp("calc", openCalc, { name: "الحاسبة", keywords: "calculator حاسبه حساب" });
  os.registerApp("settings", () => openSettings(), { name: "إعدادات النظام", keywords: "settings preferences اعدادات" });
  os.registerApp("terminal", openTerminal, { name: "تيرمينال", keywords: "terminal تيرمينال طرفيه shell zsh bash", icon: TERM_ICON, iconClass: "ic-term" });
  os.registerApp("trash", () => openFinder("trash"), { name: "سلة المهملات", hidden: true, dockClick: () => openFinder("trash") });
  os.registerApp("help", openHelp, { name: "مساعدة", hidden: true, icon: "?", iconClass: "ic-help" });
  os.registerApp("viewer", () => openFinder("docs"), { name: "عارض المستندات", hidden: true, icon: doc, iconClass: "ic-viewer" });
  os.registerApp("about", () => {}, { name: "حول مكتب رصين", hidden: true, icon: `<svg viewBox="0 0 64 64"><path d="M14 44 C 14 24, 26 14, 46 14" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="46" cy="44" r="6" fill="currentColor"/></svg>`, iconClass: "ic-about" });
  os.registerApp("forcequit", () => {}, { name: "فرض الإنهاء", hidden: true, icon: "!", iconClass: "ic-help" });
  os.initDock(mac.dockMenu);
  mac.init({ lock: lockScreen });
  const trash = () => { $("#dockTrash .ic").innerHTML = TRASH_SVG(trashedNotes().length > 0); };
  trash();
  on("notes", trash);
  stats();

  addMail({
    from: "سلمان · مشرف الفريق",
    subject: "مناوبة اليوم: الاحتفاظ بالعملاء",
    text: `هلا ${state.employee}. اليوم بتوصلك مكالمات من عملاء نظام التنبؤ يقول إنهم على وشك يتركون البنك. «نبض» بيقرأ كل رد منك ويحدّث مؤشر المحاكاة مباشرة. هدفك تنزّل الرقم تحت ٥٠٪ وتخلي العميل يكمل معنا. ابدأ بالترحيب، اسمع قبل ما تعرض، ولا تضغط عليه.`,
  });
  await sleep(1200);
  os.notify({
    app: "البريد", icon: "س", iconBg: "linear-gradient(150deg,#ffe0a3,#f39a3d)", title: "سلمان · مشرف الفريق",
    text: "مناوبة اليوم: الاحتفاظ بالعملاء. أول مكالمة بعد لحظات.", onClick: openMail,
  });
  await sleep(1400);
  openNabd();
  await sleep(2600);
  incoming();
}

function stats() {
  const s = state.stats;
  $("#stCalls").textContent = n(s.calls);
  $("#stSaved").textContent = n(s.saved);
  $("#stAvg").textContent = s.finals.length ? pct(s.finals.reduce((a, b) => a + b, 0) / s.finals.length) : "—";
}
on("stats", stats);

boot();
