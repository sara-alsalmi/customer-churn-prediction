// «تيرمينال»: a pretend shell full of jokes. Type help.
import { $, esc, sleep, toAr } from "../util.js";
import * as os from "../os.js";
import * as sound from "../sound.js";
import { state } from "../state.js";
import { list as fsList, openItem } from "./finder.js";
import * as eggs from "../eggs.js";

let body = null, out = null, inp = null, hist = [], hi = 0, running = false;
const started = Date.now();
const user = () => "employee";

const FORTUNES = [
  "اللي ما يعرف الصقر يشويه.",
  "العميل الزعلان اللي يتكلم أحسن من العميل اللي يسكت ويمشي.",
  "الصبر مفتاح الفرج. والقهوة مفتاح الصبر.",
  "من راقب الناس مات هماً. ومن راقب نبض احتفظ بالعميل.",
  "اسمع أكثر مما تتكلم. عندك أذنين وفم واحد لسبب.",
  "الاجتماع اللي ما له جدول أعمال، جدوله القهوة.",
  "لا تعرض الخصم قبل ما تفهم المشكلة.",
  "الدوام ينتهي الساعة ٤. الشغل ما ينتهي أبداً.",
  "كل عميل احتفظت فيه، ابتسامة في وجه المدير.",
  "إذا ضاقت عليك، سوّ لنفسك قهوة واكتب coffee.",
];

const CMDS = {
  help: () => [
    "الأوامر المتاحة:",
    "  help        هذي القائمة",
    "  ls [-a]     الملفات على سطح المكتب",
    "  cat <ملف>   اعرض ملف",
    "  open <app>  افتح تطبيق (call, nabd, notes, calc …)",
    "  whoami · date · uptime · pwd · history · clear · exit",
    "  fortune     حكمة اليوم",
    "  camelsay    الجمل يقول كلامك",
    "  neofetch    معلومات الجهاز",
    "  coffee      سوّ قهوة",
    "  churn       احتمال إنك تترك الدوام",
    "  ping boss   شوف المدير وين",
    "  matrix · hack · party · boss · screensaver",
    "  sudo …      جرّب",
    "",
    "وفيه أوامر ثانية مخفية. دوّر عليها.",
  ],
  ls: (a) => {
    const files = fsList("desktop").map((f) => f.name);
    return a.includes("-a") ? [".", "..", ".رواتب_الموظفين.xlsx", ".سر_الكبسة.txt", ...files] : files;
  },
  cat: (a) => {
    const name = a.join(" ");
    if (!name) return ["cat: اكتب اسم الملف"];
    if (name.includes("رواتب")) return ["cat: .رواتب_الموظفين.xlsx: Permission denied", "حلوة المحاولة. تم إبلاغ الموارد البشرية."];
    if (name.includes("الكبسه") || name.includes("الكبسة")) return ["السر: الليمون الأسود. ولا تقول لأحد."];
    const f = fsList("desktop").find((x) => x.name === name || x.name.startsWith(name));
    if (!f) return [`cat: ${name}: No such file or directory`];
    if (f.kind === "txt") return f.body().split("\n");
    openItem(f);
    return [`فتحت «${f.name}».`];
  },
  open: (a) => {
    const q = a.join(" ").toLowerCase();
    const app = Object.values(os.apps).find((x) => x.id === q || x.name === q || (x.keywords || "").toLowerCase().split(/\s+/).includes(q));
    if (!app) return [`open: ما لقيت تطبيق اسمه «${q}»`];
    setTimeout(() => os.launch(app.id), 200);
    return [`فتح ${app.name}…`];
  },
  whoami: () => [`${state.employee} · موظف خدمة العملاء · مركز الاحتفاظ`, "(مو root، للأسف)"],
  date: () => [new Date().toLocaleString("ar-SA", { dateStyle: "full", timeStyle: "short" })],
  uptime: () => [`المكتب شغّال من ${toAr(Math.max(1, Math.round((Date.now() - started) / 60000)))} دقيقة.`, "وأنت شغّال من الفجر تقريباً."],
  pwd: () => ["/Users/employee/Desktop/مركز_الاحتفاظ"],
  history: () => hist.map((c, i) => `${String(i + 1).padStart(4)}  ${c}`),
  echo: (a) => [a.join(" ")],
  fortune: () => [FORTUNES[Math.floor(Math.random() * FORTUNES.length)]],
  camelsay: (a) => camel(a.join(" ") || "السلام عليكم"),
  neofetch: () => neofetch(),
  churn: () => {
    const hr = new Date().getHours();
    const p = hr >= 15 ? 97 : hr >= 12 ? 64 : 23;
    return [`نبض يحلّل ${state.employee}…`, `احتمال إنك تترك الدوام الحين: ${toAr(p)}٪`, p > 90 ? "السبب الأول: قربت الساعة ٤." : p > 50 ? "السبب الأول: الغداء تأخر." : "السبب الأول: لسى ما شربت قهوة."];
  },
  ping: async (a) => {
    const who = a[0] || "";
    if (!/boss|المدير|مدير/.test(who)) return [`ping: ${who || "?"}: اكتب ping boss`];
    for (let i = 0; i < 3; i++) { print(`Request timeout for icmp_seq ${i}`); await sleep(650); }
    return ["المدير في اجتماع. ثاني اجتماع اليوم. ثالث بالأصح."];
  },
  coffee: async () => {
    for (let i = 0; i <= 10; i++) {
      replaceLast(`[${"█".repeat(i)}${"░".repeat(10 - i)}] ${toAr(i * 10)}٪ ☕`, i === 0);
      await sleep(220);
    }
    eggs.coffee();
    return ["القهوة في الطريق. شوف الإشعارات."];
  },
  hack: async () => {
    const lines = ["الاتصال بـ mainframe.rasin.sa …", "تجاوز الجدار الناري …", "فك تشفير ٢٥٦ بت …", "تحميل rootkit.exe …", "الوصول إلى قاعدة البيانات …", "تنزيل الملفات السرية …"];
    for (const l of lines) { print(l); await hexBurst(); }
    return ["", "✔ تم الاختراق بنجاح:", "  آلة القهوة في الدور الثالث.", "  غيّرت إعدادها إلى «قهوة سعودية بالهيل». العفو."];
  },
  matrix: () => { setTimeout(eggs.matrix, 200); return ["Wake up, Neo…"]; },
  party: () => { eggs.party(); return ["🎉"]; },
  boss: () => { setTimeout(eggs.bossMode, 150); return ["تم. اشتغل بجدية."]; },
  screensaver: () => { setTimeout(() => eggs.startSaver(), 300); return []; },
  "barrel-roll": () => { eggs.barrelRoll(); return []; },
  rm: (a) => {
    if (a.includes("-rf") && (a.includes("/") || a.includes("*"))) { setTimeout(eggs.crumble, 500); return ["جاري حذف كل شي … 💥"]; }
    return [`rm: ${a.join(" ") || "؟"}: ما أحذف شي هنا. جرّب السلة.`];
  },
  sudo: (a) => {
    if (a[0] === "make" && a.includes("sandwich")) return ["تفضل: 🥪"];
    setTimeout(() => os.notify({ app: "سلمان · مشرف الفريق", icon: "س", iconBg: "linear-gradient(150deg,#ffe0a3,#f39a3d)", text: "وصلني إنك تحاول تاخذ صلاحيات. 👀" }), 1500);
    return [`${state.employee} is not in the sudoers file. This incident will be reported.`, "(وفعلاً بيوصل للمدير.)"];
  },
  make: (a) => (a.includes("sandwich") ? ["What? Make it yourself."] : ["make: *** لا يوجد هدف. ***"]),
  exit: () => { setTimeout(() => os.close("terminal"), 150); return ["logout"]; },
  vim: () => ["فتحت vim. الحين كيف تطلع؟", "(اكتب :q … أمزح، هذي مو vim.)"],
  hello: () => ["هلا والله!"],
  "مرحبا": () => ["هلا فيك! اكتب help."],
  "السلام": () => ["وعليكم السلام ورحمة الله."],
  ai: () => ["أنا مو ذكاء اصطناعي. أنا تيرمينال. نبض هو الذكي."],
  "42": () => ["الجواب صحيح. بس وش كان السؤال؟"],
};
CMDS.clear = () => { out.innerHTML = ""; return []; };
CMDS["?"] = CMDS.help;

export function openTerminal() {
  if (os.isOpen("terminal")) return os.focus("terminal");
  os.open("terminal", {
    title: `${user()} — zsh — 80×24`, width: 640, height: 400, minW: 360, minH: 220,
    render(b) {
      body = b;
      b.innerHTML = `<div class="tty" dir="ltr"><div class="tty-out"></div><div class="tty-line"><span class="tty-ps">${ps()}</span><input class="tty-in" spellcheck="false" autocomplete="off" aria-label="أمر"></div></div>`;
      out = $(".tty-out", b); inp = $(".tty-in", b);
      print(`Last login: ${new Date().toLocaleString("en-GB")} on ttys001`);
      print("أهلاً في تيرمينال. اكتب help تشوف الأوامر.");
      $(".tty", b).addEventListener("pointerup", () => { if (!getSelection().toString()) inp.focus(); });
      inp.addEventListener("keydown", key);
      setTimeout(() => inp.focus(), 60);
    },
    onClose: () => { body = out = inp = null; },
  });
}

const ps = () => `<b>${user()}@rasin</b> <i>~</i> %`;
function print(t, cls = "") {
  if (!out) return;
  const d = document.createElement("div");
  d.className = "tty-l " + cls;
  d.dir = "auto";
  d.textContent = t;
  out.append(d);
  out.parentElement.scrollTop = 1e9;
}
function replaceLast(t, fresh) { if (fresh || !out?.lastChild) print(t); else out.lastChild.textContent = t; }
async function hexBurst() {
  for (let i = 0; i < 4; i++) { print(Array.from({ length: 6 }, () => Math.random().toString(16).slice(2, 10)).join(" "), "dim"); await sleep(70); }
}

async function key(e) {
  e.stopPropagation();
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    if (!hist.length) return;
    hi = Math.max(0, Math.min(hist.length, hi + (e.key === "ArrowUp" ? -1 : 1)));
    inp.value = hist[hi] || "";
    return;
  }
  if (e.key === "Tab") {
    e.preventDefault();
    const m = Object.keys(CMDS).filter((c) => c.startsWith(inp.value.trim()));
    if (m.length === 1) inp.value = m[0] + " "; else if (m.length) print(m.join("   "), "dim");
    return;
  }
  if (e.key === "l" && e.ctrlKey) { e.preventDefault(); out.innerHTML = ""; return; }
  if (e.key !== "Enter" || running) return;
  e.preventDefault();
  const line = inp.value.trim();
  inp.value = "";
  const echo = document.createElement("div");
  echo.className = "tty-l";
  echo.innerHTML = `<span class="tty-ps">${ps()}</span> ${esc(line)}`;
  out.append(echo);
  if (!line) return;
  hist.push(line); hi = hist.length;
  const nl = line.toLowerCase();
  const [cmd, ...args] = nl === "do a barrel roll" ? ["barrel-roll"] : line.split(/\s+/);
  const fn = CMDS[cmd.toLowerCase()];
  running = true;
  try {
    const res = fn ? await fn(args) : notFound(cmd);
    (res || []).forEach((l) => print(l));
  } catch (err) { print(String(err), "err"); }
  running = false;
  sound.click();
  if (out) out.parentElement.scrollTop = 1e9;
}
function notFound(cmd) {
  const near = Object.keys(CMDS).find((c) => c.length > 2 && (c.startsWith(cmd.slice(0, 2)) || cmd.startsWith(c)));
  return [`zsh: command not found: ${cmd}`, ...(near ? [`قصدك «${near}»؟`] : [])];
}

function camel(text) {
  const t = text.slice(0, 40);
  const line = "─".repeat(t.length + 2);
  return [
    ` ┌${line}┐`, ` │ ${t} │`, ` └${line}┘`,
    "        \\",
    "         \\    //",
    "          \\  _oo\\",
    "            (__/ \\  _  _",
    "               \\  \\/ \\/ \\",
    "               (         )\\",
    "                \\_______/  \\",
    "                 [[] [[]",
    "                 [[] [[]",
  ];
}
function neofetch() {
  const m = state.config?.model || {};
  const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
  const info = [
    `${user()}@rasin`, "----------------",
    "OS: RasinOS 1.0 (Office Edition)", "Host: Rasin Bank, Retention Desk", `Uptime: ${mins} min`,
    "Shell: zsh (fake)", `Model: ${m.name || "ANN"}, AUC ${m.auc ?? "?"}`, `CPU: ${navigator.hardwareConcurrency || "?"} cores + coffee`,
    `Memory: ${navigator.deviceMemory ? navigator.deviceMemory + " GB" : "?"} (half of it is customer names)`, `Calls today: ${state.stats.calls}`, "Mood: great until the phone rings",
  ];
  const art = ["        ▄▄▄▄▄▄▄", "     ▄█▀▀      ", "    ██         ", "   ██          ", "   ██      ▄█▄ ", "   ██      ▀█▀ ", "               ", "               "];
  return info.map((l, i) => (art[i] || "               ").padEnd(16) + "  " + l);
}
