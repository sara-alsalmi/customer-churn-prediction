// «الملاحظات»: notes saved in this browser.
import { $, $$, esc, h } from "../util.js";
import * as os from "../os.js";
import * as sound from "../sound.js";
import { emit, on } from "../state.js";

const KEY = "rs-notes";
const SEED = [
  { text: "نصائح المناوبة\n\n- ابدأ باسم العميل والترحيب.\n- اعتذر عن المشكلة قبل أي عرض.\n- اسأله وش اللي مضايقه بالضبط.\n- اعرض حل واضح بالأرقام.\n- لا تضغط عليه يقرر الحين." },
  { text: "أشياء ترفع الخطر\n\nالردود القصيرة مثل «طيب» و«تمام».\nتجاهل سبب اتصاله.\nكثرة الوعود بدون تفاصيل." },
];

let notes = null;
try { notes = JSON.parse(localStorage.getItem(KEY)); } catch {}
if (!Array.isArray(notes)) {
  const t = Date.now();
  notes = SEED.map((n, i) => ({ id: "seed" + i, text: n.text, updated: t - i * 3600_000, deleted: false }));
}
let current = null, query = "", body = null;

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch {}
  emit("notes");
}
const uid = () => Math.random().toString(36).slice(2, 10);
export const titleOf = (n) => (n.text.trim().split("\n")[0] || "ملاحظة جديدة").slice(0, 60);
const preview = (n) => n.text.trim().split("\n").slice(1).join(" ").trim().slice(0, 80) || "لا يوجد نص إضافي";
export const allNotes = () => notes.filter((n) => !n.deleted).sort((a, b) => b.updated - a.updated);
export const trashedNotes = () => notes.filter((n) => n.deleted).sort((a, b) => b.updated - a.updated);
const when = (t) => {
  const d = new Date(t), now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString("ar-SA", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("ar-SA-u-ca-gregory", { day: "numeric", month: "short" });
};

export function newNote(text = "") {
  const n = { id: uid(), text, updated: Date.now(), deleted: false };
  notes.push(n);
  save();
  openNotes(n.id);
  setTimeout(() => $("#noteEd", body)?.focus(), 80);
  return n;
}
export function deleteNote(id = current) {
  const n = notes.find((x) => x.id === id);
  if (!n) return;
  n.deleted = true; n.updated = Date.now();
  sound.trash();
  save();
  if (current === id) current = allNotes()[0]?.id || null;
  render();
}
export function restoreNote(id) { const n = notes.find((x) => x.id === id); if (n) { n.deleted = false; save(); render(); } }
export function emptyTrash() { notes = notes.filter((n) => !n.deleted); sound.trash(); save(); }

export function openNotes(id) {
  if (id) current = id;
  if (!current || !notes.find((n) => n.id === current && !n.deleted)) current = allNotes()[0]?.id || null;
  if (os.isOpen("notes")) { render(); os.focus("notes"); return os.get("notes"); }
  return os.open("notes", {
    title: "الملاحظات",
    width: 680, height: 480, minW: 460,
    pos: (a, w) => ({ x: a.w - w - 300, y: 60 }),
    render(b, win) {
      body = b;
      $(".win-tools", win).innerHTML = `
        <label class="tb-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input id="noteQ" placeholder="بحث"></label>
        <button class="tb-btn" id="noteDel" title="حذف"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button>
        <button class="tb-btn" id="noteNew" title="ملاحظة جديدة"><svg viewBox="0 0 24 24"><path d="M14 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M18 3l3 3-8 8H10v-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button>`;
      $("#noteNew", win).onclick = () => newNote();
      $("#noteDel", win).onclick = () => deleteNote();
      $("#noteQ", win).oninput = (e) => { query = e.target.value.trim(); renderList(); };
      b.innerHTML = `<div class="notes"><aside class="notes-list" id="noteList"></aside><div class="notes-ed"><div class="notes-date" id="noteDate"></div><textarea id="noteEd" class="selectable" placeholder="اكتب ملاحظتك…"></textarea></div></div>`;
      $("#noteEd", b).addEventListener("input", (e) => {
        let n = notes.find((x) => x.id === current);
        if (!n) { n = { id: uid(), text: "", updated: Date.now(), deleted: false }; notes.push(n); current = n.id; }
        n.text = e.target.value; n.updated = Date.now();
        save();
        renderList();
      });
      render();
    },
    onClose: () => { body = null; },
  });
}

function render() {
  if (!body) return;
  renderList();
  const n = notes.find((x) => x.id === current);
  const ed = $("#noteEd", body);
  if (ed.value !== (n?.text || "")) ed.value = n?.text || "";
  $("#noteDate", body).textContent = n ? new Date(n.updated).toLocaleString("ar-SA-u-ca-gregory", { dateStyle: "long", timeStyle: "short" }) : "";
}

function renderList() {
  if (!body) return;
  const q = query.toLowerCase();
  const list = allNotes().filter((n) => !q || n.text.toLowerCase().includes(q));
  $("#noteList", body).innerHTML = list.length ? list.map((n) => `
    <button class="note-row ${n.id === current ? "sel" : ""}" data-id="${n.id}">
      <b>${esc(titleOf(n))}</b>
      <span><em>${esc(when(n.updated))}</em> ${esc(preview(n))}</span>
    </button>`).join("") : `<div class="notes-empty">${q ? "لا توجد نتائج" : "لا توجد ملاحظات"}</div>`;
  $$(".note-row", body).forEach((r) => (r.onclick = () => { current = r.dataset.id; render(); }));
}

on("notes", () => { if (body) renderList(); });
void h;
