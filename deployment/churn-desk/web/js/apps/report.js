// «التقارير»: after-call report.
import { $, esc, n, pct, riskColor, signedPts, mmss, toAr } from "../util.js";
import * as os from "../os.js";
import { state, emit } from "../state.js";

let body = null;

export function openReport() {
  return os.open("report", {
    title: "تقرير المكالمة",
    width: 620, height: 700,
    render(b) { body = b; render(); },
    onClose: () => { body = null; },
  });
}

function render() {
  if (!body) return;
  const r = state.lastReport;
  if (!r) { body.innerHTML = `<div class="rep-empty">ما فيه تقارير للحين. خلّص أول مكالمة ويطلع تقريرها هنا.</div>`; return; }
  const won = r.outcome === "retained";
  const reason = {
    retained: "اقتنع العميل وقرر يكمل مع البنك.",
    hangup: "العميل قفل المكالمة وقرر يترك البنك.",
    employee_hung_up: won ? "أنهيت المكالمة والعميل في منطقة الأمان." : "أنهيت المكالمة قبل ما يقتنع العميل.",
  }[r.end_reason] || "";
  const sig = state.config.signals;
  const actual = r.actual.y === "yes"
    ? "في البيانات الحقيقية، هذا العميل وافق على العرض (y = yes)."
    : "في البيانات الحقيقية، هذا العميل رفض العرض (y = no).";
  body.innerHTML = `
  <div class="report">
    <div class="rep-hero">
      <div>
        <h2>${won ? "احتفظت بالعميل" : "خسرت العميل"}</h2>
        <p>${esc(r.customer.name)} · ${esc(r.scenario)} · ${esc(reason)}</p>
      </div>
      <div class="rep-badge ${won ? "is-win" : "is-lose"}">${won ? "✓" : "✕"}</div>
    </div>
    <div class="rep-nums">
      <div class="kpi"><b style="color:${riskColor(r.start)}">${pct(r.start)}</b><span>الخطر في البداية</span></div>
      <div class="kpi"><b style="color:${riskColor(r.final)}">${pct(r.final)}</b><span>الخطر في النهاية</span></div>
      <div class="kpi"><b>${n(r.turns)}</b><span>ردودك</span></div>
      <div class="kpi"><b class="num">${mmss(r.elapsed)}</b><span>مدة المكالمة</span></div>
    </div>
    <div class="section-t">مسار الخطر خلال المكالمة</div>
    ${chart(r.timeline)}
    <div class="section-t">أهم لحظتين</div>
    <div class="rep-moments">
      ${moment("good", "أفضل رد", r.best && r.best.delta <= -0.005 ? r.best : null, "ما فيه رد نزّل الخطر.")}
      ${moment("bad", "أسوأ رد", r.worst && r.worst.delta >= 0.005 ? r.worst : null, "ما فيه رد رفع الخطر. ممتاز.")}
    </div>
    <div class="section-t">متوسط أسلوبك</div>
    <div class="sigs">${sig.map((s) => `<div class="sig ${s.negative ? "neg" : ""}"><span>${s.label}</span><div class="bar"><i style="width:${Math.round((r.avg_signals[s.key] || 0) * 100)}%"></i></div><span class="v">${toAr((r.avg_signals[s.key] || 0).toFixed(1))}</span></div>`).join("")}</div>
    <div class="rep-truth">${actual} النموذج والمحادثة يقدّرون الخطر، لكن القرار الحقيقي كان عند العميل.</div>
    <div class="rep-actions">
      <button class="btn primary" id="repNext">العميل التالي</button>
      <button class="btn" id="repClose">إغلاق</button>
    </div>
  </div>`;
  $("#repNext", body).onclick = () => { os.close("report"); emit("call:next"); };
  $("#repClose", body).onclick = () => os.close("report");
}

function moment(kind, title, m, empty) {
  return `<div class="moment ${kind}"><b>${title}${m ? ` · ${signedPts(m.delta)} نقطة` : ""}</b>${m ? `<q>${esc(m.text)}</q>` : empty}</div>`;
}

function chart(tl) {
  const W = 560, H = 170, L = 46, R = 10, T = 10, B = 24;
  const pts = tl.map((t, i) => [L + (i * (W - L - R)) / Math.max(1, tl.length - 1), T + (1 - t.final) * (H - T - B)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const grid = [0, 0.25, 0.5, 0.75, 1].map((v) => {
    const y = T + (1 - v) * (H - T - B);
    return `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,${v === 0.5 ? 0.14 : 0.06})" ${v === 0.5 ? 'stroke-dasharray="4 4"' : ""}/>
            <text x="${L - 6}" y="${y + 4}" fill="#9aa0ae" font-size="12" text-anchor="end">${pct(v)}</text>`;
  }).join("");
  const dots = pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === pts.length - 1 ? 5 : 3.2}" fill="${riskColor(tl[i].final)}"><title>${esc(tl[i].label || "")}</title></circle>`).join("");
  return `<svg class="rep-chart" viewBox="0 0 ${W} ${H}" style="direction:ltr">
    <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b6b" stop-opacity=".28"/><stop offset="1" stop-color="#3ddc97" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    ${pts.length > 1 ? `<path d="${line} L${pts[pts.length - 1][0]},${H - B} L${pts[0][0]},${H - B} Z" fill="url(#rg)"/>` : ""}
    <path d="${line}" fill="none" stroke="#e8e6ff" stroke-width="2.2" stroke-linejoin="round" style="stroke-dasharray:2000;stroke-dashoffset:2000;animation:draw 1.6s var(--ease-out) forwards"/>
    ${dots}
  </svg>`;
}

export function show(report) {
  state.lastReport = report;
  if (os.isOpen("report")) render();
  openReport();
}
