// «ملف العميل»: the CRM record of the caller (a real dataset row).
import { $, esc, n, pct, riskClass } from "../util.js";
import * as os from "../os.js";
import { state, on } from "../state.js";

let body = null;

export function openCrm() {
  return os.open("crm", {
    title: "ملف العميل",
    width: 380, height: 680,
    pos: (a, w) => ({ x: a.w - w - 18, y: 12 }),
    render(b) { body = b; render(); },
    onClose: () => { body = null; },
  });
}

function render() {
  if (!body) return;
  const c = state.call?.customer || state.lastReport?.customer;
  if (!c) {
    body.innerHTML = `<div class="crm-empty">يفتح ملف العميل تلقائياً أول ما ترد على المكالمة.</div>`;
    return;
  }
  const last = state.timeline[state.timeline.length - 1];
  const p = last?.final ?? state.call?.score?.final ?? 0.9;
  const row = state.call?.row || {};
  body.innerHTML = `
    <div class="crm">
      <div class="crm-head">
        <div class="avatar ${c.gender === "f" ? "f" : ""}">${esc(c.initials)}</div>
        <div>
          <h2>${esc(c.name)}</h2>
          <div class="crm-tags">
            <span class="chip ${riskClass(p)}" id="crmRisk"><i></i>مؤشر المحاكاة ${pct(p)}</span>
            <span class="chip">سجل رقم ${n(c.row_index)}</span>
          </div>
        </div>
      </div>
      <div class="crm-why"><b>تنبيه قبل الرد · ${esc(c.scenario_title)}</b>${esc(c.brief)}</div>
      <div class="section-t">البيانات</div>
      <div class="fields">
        ${c.profile.map((f, i) => `<div class="field ${f.flag ? "flag" : ""}" style="animation-delay:${i * 35}ms"><span>${esc(f.label)}</span><b>${esc(f.value)}</b></div>`).join("")}
      </div>
      <div class="section-t">ما يدخل للنموذج</div>
      <div class="feat-list" id="featList">${feats(row, last?.duration_feature ?? state.call?.score?.duration_feature)}</div>
      <div class="feat-note">هذه قيم العميل الحقيقية. النموذج يتنبأ بالاشتراك في وديعة ولا يستخدم مدة المكالمة. تغيّر المؤشر أثناء الحديث هو محاكاة تدريبية.</div>
    </div>`;
}

function feats(row, dur) {
  return Object.entries(row).map(([k, v]) =>
    k === "duration"
      ? `<span class="k">${k}</span> = <span class="live">${dur ?? v}s ← live</span>`
      : `<span class="k">${k}</span> = ${esc(v)}`).join("<br>");
}

on("call:started", render);
on("call:score", () => {
  if (!body) return;
  const last = state.timeline[state.timeline.length - 1];
  const r = $("#crmRisk", body);
  if (r && last) { r.className = `chip ${riskClass(last.final)}`; r.innerHTML = `<i></i>مؤشر المحاكاة ${pct(last.final)}`; }
  const f = $("#featList", body);
  if (f && last) f.innerHTML = feats(state.call?.row || {}, last.duration_feature);
});
