// «الملفات»: a Finder over this desk's real data (model, reports, notes, trash).
import { dontOpen } from "../eggs.js";
import { $, $$, esc, h, n, pct, toAr } from "../util.js";
import * as os from "../os.js";
import * as sound from "../sound.js";
import { state, on } from "../state.js";
import { allNotes, trashedNotes, openNotes, titleOf, restoreNote, deleteNote, emptyTrash } from "./notes.js";
import { show as showReport, openReport } from "./report.js";

export const FOLDER_SVG = `<svg viewBox="0 0 64 52"><path d="M4 10a5 5 0 015-5h15l6 6h25a5 5 0 015 5v4H4z" fill="#5fb0f5"/><rect x="4" y="15" width="56" height="34" rx="5" fill="url(#fg)"/><defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ccaff"/><stop offset="1" stop-color="#4f9ff0"/></linearGradient></defs></svg>`;
const DOC_SVG = (c = "#e9ebf2", tag = "") => `<svg viewBox="0 0 48 60"><path d="M6 2h26l12 12v40a4 4 0 01-4 4H6a4 4 0 01-4-4V6a4 4 0 014-4z" fill="${c}"/><path d="M32 2v10a2 2 0 002 2h10" fill="#c3c7d3"/><path d="M10 24h26M10 31h26M10 38h18" stroke="#a7acba" stroke-width="2.4" stroke-linecap="round"/>${tag ? `<text x="24" y="54" text-anchor="middle" font-size="9" font-weight="700" fill="#6b7080" font-family="IBM Plex Mono">${tag}</text>` : ""}</svg>`;
const REPORT_SVG = (won) => `<svg viewBox="0 0 48 60"><path d="M6 2h26l12 12v40a4 4 0 01-4 4H6a4 4 0 01-4-4V6a4 4 0 014-4z" fill="#f4f5f9"/><path d="M32 2v10a2 2 0 002 2h10" fill="#c3c7d3"/><path d="M10 46V36M18 46V28M26 46V33M34 46V24" stroke="${won ? "#22b765" : "#e5483d"}" stroke-width="4" stroke-linecap="round"/></svg>`;
const TRASH_SVG = (full) => `<svg viewBox="0 0 48 56"><path d="M8 14h32l-3 38a3 3 0 01-3 3H14a3 3 0 01-3-3z" fill="rgba(220,225,235,.85)"/><rect x="5" y="9" width="38" height="6" rx="3" fill="#e9ecf3"/>${full ? `<path d="M14 8l6-5 8 4 6-3" stroke="#f3f4f8" stroke-width="3" fill="none"/>` : ""}<path d="M18 22v26M24 22v26M30 22v26" stroke="#aab0bf" stroke-width="2"/></svg>`;

// ---------- the files ----------
function modelCard() {
  const m = state.config?.model || {};
  return `بطاقة النموذج

الاسم: ${m.name || "ANN"}
النوع: ${m.kind || "—"}
البيانات: ${m.dataset || "UCI Bank Marketing"}
دقة التمييز (AUC) على بيانات الاختبار: ${m.auc ?? "—"}
عدد الخصائص: ${(m.features || []).length}

الهدف
يتنبأ النموذج بدرجة رفض الاشتراك في وديعة. لا تقيس البيانات مغادرة البنك فعلياً. كل عميل في المكالمات صف حقيقي من البيانات.

كيف يتغير الرقم أثناء المكالمة
مدة المكالمة مستبعدة من نموذج AE1. مخرج الشبكة ثابت، وردودك تغيّر مؤشر المحاكاة فقط.

العملاء في قائمة الخطر الآن: ${state.config?.pool ?? "—"}`;
}
function featuresTxt() {
  const f = state.config?.model?.features || [];
  return `خصائص النموذج (${f.length})\n\n` + f.map((x, i) => `${i + 1}. ${x}`).join("\n");
}
const DATA_TXT = `عن البيانات

UCI Bank Marketing: حملات تسويق هاتفية لبنك برتغالي. النسخة bank-additional-full، بعد تنظيف الفريق.
المتغير الهدف y: هل اشترك العميل في الوديعة؟
y = no يعني عدم الاشتراك، وليس مغادرة مثبتة. سيناريو الاحتفاظ بالعملاء محاكاة تعليمية.

المصدر: archive.ics.uci.edu/dataset/222/bank+marketing`;
const GUIDE_TXT = `دليل المناوبة

١. رد على المكالمة واقرأ سبب الاتصال.
٢. افتح ملف العميل وشوف الحقول المعلّمة.
٣. رحّب باسمه واعتذر عن المشكلة.
٤. اسأل قبل ما تعرض.
٥. اعرض حل واضح بالأرقام.
٦. لا تضغط عليه يقرر الحين.

هدفك تنزّل مؤشر المحاكاة تحت ٥٠٪.`;

export const PLACES = [
  { id: "desktop", name: "سطح المكتب", icon: "▭" },
  { id: "docs", name: "المستندات", icon: "▤" },
  { id: "reports", name: "التقارير", icon: "▥" },
  { id: "model", name: "النموذج", icon: "◎" },
  { id: "apps", name: "التطبيقات", icon: "▦" },
  { id: "trash", name: "سلة المهملات", icon: "⌫" },
];

const txt = (id, name, body, tag = "TXT") => ({ id, name, kind: "txt", icon: DOC_SVG("#eef0f6", tag), body, size: body().length });
const FILES = {
  card: txt("card", "بطاقة النموذج.txt", modelCard),
  feats: txt("feats", "خصائص النموذج.txt", featuresTxt),
  data: txt("data", "عن البيانات.txt", () => DATA_TXT),
  guide: txt("guide", "دليل المناوبة.txt", () => GUIDE_TXT),
  dont: { id: "dont", name: "لا تفتح.txt", kind: "egg", icon: DOC_SVG("#ffd9d6", "!!"), size: 13 },
};

export function list(place) {
  switch (place) {
    case "desktop": return [folder("reports"), FILES.card, FILES.guide, FILES.dont];
    case "docs": return [FILES.guide, FILES.card, ...allNotes().map(noteFile)];
    case "reports": return state.reports.map(reportFile);
    case "model": return [FILES.card, FILES.feats, FILES.data];
    case "apps": return Object.values(os.apps).filter((a) => !a.hidden).map((a) => ({ id: "app:" + a.id, name: a.name, kind: "app", iconHtml: os.appIcon(a.id, "file-app"), app: a.id }));
    case "trash": return trashedNotes().map((nt) => ({ ...noteFile(nt), trashed: true }));
  }
  return [];
}
function folder(id) { const p = PLACES.find((x) => x.id === id); return { id: "dir:" + id, name: p.name, kind: "dir", icon: FOLDER_SVG, place: id }; }
function noteFile(nt) { return { id: "note:" + nt.id, name: titleOf(nt) + ".txt", kind: "note", icon: DOC_SVG("#fff5c7", "NOTE"), note: nt.id, date: nt.updated, size: nt.text.length }; }
function reportFile(r, i) {
  const won = r.outcome === "retained";
  return { id: "rep:" + i, name: `مكالمة ${r.customer?.name || ""}.report`, kind: "report", icon: REPORT_SVG(won), rep: r, date: r.at, sub: `${won ? "احتفظت به" : "غادر"} · ${pct(r.final)}` };
}

export function openItem(f, from) {
  sound.click();
  if (f.kind === "dir") return from ? go(from, f.place) : openFinder(f.place);
  if (f.kind === "app") return os.launch(f.app);
  if (f.kind === "note") return f.trashed ? os.notify({ app: "الملفات", text: "الملاحظة في سلة المهملات. أرجعها أولاً." }) : openNotes(f.note);
  if (f.kind === "report") { showReport(f.rep); return openReport(); }
  if (f.kind === "txt") return openText(f.name, f.body());
  if (f.kind === "egg") return dontOpen();
}
export const fileById = (id) => Object.values(FILES).find((f) => f.id === id);

// ---------- text viewer ----------
let viewers = 0;
export function openText(name, text) {
  const id = "viewer:" + name;
  if (os.isOpen(id)) return os.focus(id);
  viewers++;
  os.open(id, {
    title: name, app: "viewer", width: 520, height: 520,
    pos: (a, w, hh) => ({ x: (a.w - w) / 2 - viewers * 10, y: 50 + (viewers % 5) * 20 }),
    render(b) { b.innerHTML = `<article class="viewer selectable">${esc(text)}</article>`; },
  });
}

// ---------- the window ----------
const finders = new Map(); // window id -> {place, back, fwd, view, sel, q}
let seq = 0;

export function openFinder(place = "docs", fresh = false) {
  if (!fresh) {
    const ex = os.windowsOf("finder")[0];
    if (ex) { go(ex, place); os.launch("finder"); return; }
  }
  const id = "finder:" + ++seq;
  const st = { place, back: [], fwd: [], view: "icons", sel: null, q: "" };
  finders.set(id, st);
  os.open(id, {
    title: PLACES.find((p) => p.id === place).name, app: "finder",
    width: 760, height: 470, minW: 520, minH: 300,
    render(b, win) {
      $(".win-tools", win).innerHTML = `
        <div class="tb-nav"><button class="tb-btn" data-nav="back" title="رجوع"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="tb-btn" data-nav="fwd" title="تقدّم"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
        <div class="tb-seg"><button data-view="icons" title="أيقونات"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="13" y="4" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="4" y="13" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="13" y="13" width="7" height="7" rx="1.5" fill="currentColor"/></svg></button><button data-view="list" title="قائمة"><svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
        <label class="tb-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input placeholder="بحث" class="fq"></label>`;
      $$("[data-nav]", win).forEach((x) => (x.onclick = () => nav(id, x.dataset.nav)));
      $$("[data-view]", win).forEach((x) => (x.onclick = () => { st.view = x.dataset.view; render(id); }));
      $(".fq", win).oninput = (e) => { st.q = e.target.value.trim(); render(id); };
      b.innerHTML = `<div class="finder"><aside class="f-side"><h6>المفضلة</h6>${PLACES.slice(0, 5).map(side).join("")}<h6>المواقع</h6>${side(PLACES[5])}</aside>
        <section class="f-main"><div class="f-items" tabindex="0"></div><footer class="f-foot"></footer></section></div>`;
      $$(".f-side button", b).forEach((x) => (x.onclick = () => go(id, x.dataset.place)));
      const items = $(".f-items", b);
      items.addEventListener("click", (e) => { if (e.target === items) { st.sel = null; render(id); } });
      items.addEventListener("keydown", (e) => {
        const L = visible(st);
        let i = L.findIndex((f) => f.id === st.sel);
        if (e.key === "Enter" && i >= 0) return openItem(L[i], id);
        if ((e.key === "Backspace" || e.key === "Delete") && i >= 0) return remove(id, L[i]);
        const step = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: st.view === "list" ? 1 : 4, ArrowUp: st.view === "list" ? -1 : -4 }[e.key];
        if (step) { e.preventDefault(); i = Math.max(0, Math.min(L.length - 1, (i < 0 ? -step : i) + step)); st.sel = L[i]?.id; render(id); }
      });
      items.addEventListener("contextmenu", (e) => {
        e.preventDefault(); e.stopPropagation();
        const it = e.target.closest("[data-f]");
        const f = it && visible(st).find((x) => x.id === it.dataset.f);
        if (f) { st.sel = f.id; render(id); }
        os.emitContext?.(e, f ? fileMenu(id, f) : placeMenu(id));
      });
      render(id);
    },
    onClose: () => finders.delete(id),
  });
}
const side = (p) => `<button data-place="${p.id}"><i>${p.icon}</i>${esc(p.name)}</button>`;
const visible = (st) => list(st.place).filter((f) => !st.q || f.name.includes(st.q));

function fileMenu(id, f) {
  const items = [{ label: "فتح", run: () => openItem(f, id) }];
  if (f.kind === "note" && !f.trashed) items.push("-", { label: "نقل إلى سلة المهملات", kbd: "⌫", run: () => remove(id, f) });
  if (f.trashed) items.push("-", { label: "إرجاع", run: () => restoreNote(f.note) });
  if (f.kind === "txt") items.push("-", { label: "نسخ النص", run: () => navigator.clipboard?.writeText(f.body()) });
  return items;
}
function placeMenu(id) {
  const st = finders.get(id);
  const items = [
    { label: "عرض كأيقونات", checked: st.view === "icons", run: () => { st.view = "icons"; render(id); } },
    { label: "عرض كقائمة", checked: st.view === "list", run: () => { st.view = "list"; render(id); } },
  ];
  if (st.place === "docs") items.unshift({ label: "ملاحظة جديدة", run: () => import("./notes.js").then((m) => m.newNote()) }, "-");
  if (st.place === "trash") items.push("-", { label: "إفراغ سلة المهملات", disabled: !trashedNotes().length, run: emptyTrash });
  return items;
}

function remove(id, f) {
  if (f.kind === "note" && !f.trashed) { deleteNote(f.note); render(id); }
}

export function go(id, place) {
  const st = finders.get(id);
  if (!st || st.place === place) return;
  st.back.push(st.place); st.fwd = []; st.place = place; st.sel = null;
  render(id);
}
function nav(id, dir) {
  const st = finders.get(id);
  const from = dir === "back" ? st.back : st.fwd, to = dir === "back" ? st.fwd : st.back;
  if (!from.length) return;
  to.push(st.place); st.place = from.pop(); st.sel = null;
  render(id);
}

function render(id) {
  const st = finders.get(id), win = os.get(id);
  if (!st || !win) return;
  const p = PLACES.find((x) => x.id === st.place);
  os.setTitle(id, p.name);
  $$(".f-side button", win).forEach((b) => b.classList.toggle("sel", b.dataset.place === st.place));
  $$("[data-view]", win).forEach((b) => b.classList.toggle("on", b.dataset.view === st.view));
  $("[data-nav=back]", win).disabled = !st.back.length;
  $("[data-nav=fwd]", win).disabled = !st.fwd.length;
  const L = visible(st);
  const box = $(".f-items", win);
  box.className = "f-items " + st.view;
  const icon = (f) => f.iconHtml || f.icon;
  const date = (f) => (f.date ? new Date(f.date).toLocaleString("ar-SA-u-ca-gregory", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
  const kind = (f) => ({ dir: "مجلد", txt: "نص", note: "ملاحظة", report: "تقرير مكالمة", app: "تطبيق" }[f.kind]);
  box.innerHTML = !L.length
    ? `<div class="f-empty">${st.place === "reports" ? "ما فيه تقارير للحين. كل مكالمة تخلصها ينحفظ تقريرها هنا." : st.place === "trash" ? "سلة المهملات فارغة" : "لا توجد عناصر"}</div>`
    : st.view === "icons"
      ? L.map((f) => `<button class="f-ic ${f.id === st.sel ? "sel" : ""}" data-f="${esc(f.id)}"><span class="f-glyph">${icon(f)}</span><span class="f-name">${esc(f.name)}</span>${f.sub ? `<small>${esc(f.sub)}</small>` : ""}</button>`).join("")
      : `<div class="f-row f-hd"><span>الاسم</span><span>التاريخ</span><span>النوع</span></div>` + L.map((f) => `<button class="f-row ${f.id === st.sel ? "sel" : ""}" data-f="${esc(f.id)}"><span><i class="f-mini">${icon(f)}</i>${esc(f.name)}</span><span>${esc(date(f))}</span><span>${kind(f)}</span></button>`).join("");
  $$("[data-f]", box).forEach((el) => {
    const f = L.find((x) => x.id === el.dataset.f);
    el.onclick = () => { st.sel = f.id; render(id); $(".f-items", win).focus(); };
    el.ondblclick = () => openItem(f, id);
  });
  $(".f-foot", win).innerHTML = `${toAr(L.length)} عنصر${st.place === "trash" && L.length ? ` · <button class="f-empty-trash">إفراغ</button>` : ""}`;
  $(".f-empty-trash", win)?.addEventListener("click", emptyTrash);
}

const refresh = () => finders.forEach((_, id) => render(id));
on("notes", refresh);
on("call:ended", refresh);
export { TRASH_SVG };
void h; void n;
