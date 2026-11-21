// «حاسوب نبض»: the model's own computer, shown like an agent's live screen.
import { $, $$, h, esc, n, pct, riskColor, riskWord, signedPts, tween, toAr, isMove } from "../util.js";
import * as os from "../os.js";
import { state, on } from "../state.js";

let shown = 0.5;     // number currently drawn on the gauge
let body = null;
const ARC = 289;     // length of the half-circle path below

const ICONS = {
  gauge: `<svg viewBox="0 0 24 24"><path d="M4 16a8 8 0 1116 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 16l4-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  term: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 9l3 3-3 3M12 15h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  files: `<svg viewBox="0 0 24 24"><path d="M4 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`,
};

export function openNabd() {
  return os.open("nabd", {
    title: "حاسوب نبض",
    width: 430, height: 680,
    pos: (a, w) => ({ x: 18, y: 12 }),
    render(b) {
      body = b;
      b.innerHTML = `
      <div class="nabd">
        <div class="nabd-top">
          <div class="orb" id="nOrb"></div>
          <div><b>نبض</b><span id="nTask">ينتظر مكالمة</span></div>
          <span class="chip nabd-status" id="nStatus"><i></i>جاهز</span>
        </div>
        <div class="tiles" role="tablist">
          <button class="tile on" data-pane="gauge">${ICONS.gauge}المؤشر</button>
          <button class="tile" data-pane="term">${ICONS.term}الطرفية</button>
          <button class="tile" data-pane="files">${ICONS.files}الملفات</button>
        </div>
        <div class="screenframe">
          <div class="pane on" data-pane="gauge">
            <div class="idle-panel">
              <div class="orb big-orb"></div>
              <b>ينتظر مكالمة</b>
              <p>أول ما ترد على عميل، بقرأ كل رد منك وأحدّث مؤشر المحاكاة هنا مباشرة.</p>
              <div class="idle-meta"><span class="chip">${esc(state.config?.model?.name || "")}</span>${state.config?.model?.auc ? `<span class="chip">AUC ${toAr(state.config.model.auc)}</span>` : ""}</div>
            </div>
            <div class="live-panel">
            <div class="gauge-wrap">
              <div class="gauge">
                <svg viewBox="0 0 220 128">
                  <defs><linearGradient id="gGrad" x1="0" x2="1"><stop offset="0" stop-color="#3ddc97"/><stop offset=".5" stop-color="#f5b84a"/><stop offset="1" stop-color="#ff6b6b"/></linearGradient></defs>
                  <path class="g-track" d="M18 118 A92 92 0 0 1 202 118" fill="none" stroke-width="14" stroke-linecap="round"/>
                  <path class="g-val" id="gVal" d="M18 118 A92 92 0 0 1 202 118" fill="none" stroke="url(#gGrad)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${ARC}" stroke-dashoffset="${ARC}"/>
                </svg>
                <div class="g-num"><b id="gNum">—</b><span id="gWord">مؤشر المغادرة التجريبي</span></div>
              </div>
              <div class="g-delta" id="gDelta"></div>
            </div>
            <div class="whisper" id="whisper"><div class="orb"></div><div id="hintText">لما تبدأ المكالمة، بقرأ كل رد وأقول لك وش يقرّب العميل ووش يبعّده.</div></div>
            <div class="kpis">
              <div class="kpi"><b id="kAnn">—</b><span>درجة رفض العرض</span></div>
              <div class="kpi"><b id="kTone">—</b><span>أثر المحاكاة</span></div>
              <div class="kpi"><b id="kDur">—</b><span>مدة متوقعة</span></div>
            </div>
            <div class="section-t">مسار الخطر</div>
            <svg class="spark" id="spark" viewBox="0 0 300 74" preserveAspectRatio="none"></svg>
            <div class="section-t">إشارات آخر رد</div>
            <div class="sigs" id="sigs"></div>
            </div>
          </div>
          <div class="pane" data-pane="term"><div class="term" id="term"></div></div>
          <div class="pane" data-pane="files"><div class="files" id="files"></div></div>
        </div>
      </div>`;
      $$(".tile", b).forEach((t) => (t.onclick = () => tab(t.dataset.pane)));
      renderSignals(null);
      renderFiles();
      termBoot();
      setIdle(!state.call && !state.timeline.length);
      if (state.call) { setTask(); redrawFromTimeline(); }
    },
    onClose: () => { body = null; },
  });
}

function setIdle(on) {
  if (!body) return;
  $(".nabd", body).classList.toggle("idle", on);
}

function tab(name) {
  if (!body) return;
  $$(".tile", body).forEach((t) => t.classList.toggle("on", t.dataset.pane === name));
  $$(".pane", body).forEach((p) => p.classList.toggle("on", p.dataset.pane === name));
}

function setTask() {
  if (!body) return;
  $("#nTask", body).textContent = state.call ? `يحلّل مكالمة ${state.call.customer.name}` : "ينتظر مكالمة";
}

export function status(text, kind = "") {
  if (!body) return;
  const s = $("#nStatus", body);
  s.className = `chip nabd-status ${kind}`;
  s.innerHTML = `<i></i>${esc(text)}`;
}

export function thinking(on) {
  document.getElementById("mbNabd")?.classList.toggle("active", on);
  if (!body) return;
  $("#nOrb", body).classList.toggle("thinking", on);
  status(on ? "يحلّل الرد" : state.call ? "يراقب المكالمة" : "جاهز", on ? "warn" : state.call ? "safe" : "");
}

export function orbLevel(l) {
  if (!body) return;
  $("#nOrb", body).style.setProperty("--lvl", l);
}

function tint(p) {
  if (!body) return;
  const c = riskColor(p);
  const o = $("#nOrb", body);
  o.style.setProperty("--c2", c);
  o.style.setProperty("--c3", `color-mix(in srgb, ${c} 60%, #3b2f8f)`);
}

export function update({ score, delta, signals, hint }) {
  if (!body) return;
  const p = score.final;
  const g = $("#gVal", body);
  g.style.strokeDashoffset = ARC * (1 - p);
  const num = $("#gNum", body);
  tween(shown, p, 1100, (v) => { num.textContent = pct(v); num.style.color = riskColor(v); });
  shown = p;
  $("#gWord", body).textContent = `${riskWord(p)} · مؤشر المغادرة التجريبي`;
  const d = $("#gDelta", body);
  if (isMove(delta)) {
    d.className = `g-delta show ${delta < 0 ? "down" : "up"}`;
    d.textContent = `${delta < 0 ? "▼" : "▲"} ${signedPts(delta)} نقطة`;
  } else if (delta != null) {
    d.className = "g-delta show flat";
    d.textContent = "بدون تغيير";
  } else d.className = "g-delta";
  $("#kAnn", body).textContent = pct(score.ann);
  const ts = Math.abs(score.tone_shift);
  $("#kTone", body).textContent = ts < 0.005 ? toAr("0") : (score.tone_shift < 0 ? "−" : "+") + toAr(ts.toFixed(2));
  $("#kDur", body).textContent = `${toAr((score.duration_feature / 60).toFixed(1))} دقيقة`;
  tint(p);
  renderSignals(signals);
  if (hint) {
    const w = $("#whisper", body);
    $("#hintText", body).textContent = hint;
    w.classList.remove("flash"); void w.offsetWidth; w.classList.add("flash");
  }
  drawSpark();
}

function drawSpark() {
  if (!body) return;
  const pts = state.timeline.map((t) => t.final);
  const svg = $("#spark", body);
  if (pts.length < 2) { svg.innerHTML = ""; return; }
  const W = 300, H = 74, pad = 6;
  // high risk at the top
  const xy = pts.map((p, i) => [pad + (i * (W - 2 * pad)) / (pts.length - 1), pad + (1 - p) * (H - 2 * pad)]);
  const yy = xy.map(([, y]) => y);
  const line = xy.map(([x], i) => `${i ? "L" : "M"}${x.toFixed(1)},${yy[i].toFixed(1)}`).join(" ");
  const last = xy.length - 1;
  svg.innerHTML = `
    <defs><linearGradient id="spG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b6b" stop-opacity=".35"/><stop offset="1" stop-color="#3ddc97" stop-opacity="0"/></linearGradient></defs>
    <line x1="0" x2="${W}" y1="${pad + 0.5 * (H - 2 * pad)}" y2="${pad + 0.5 * (H - 2 * pad)}" stroke="rgba(255,255,255,.1)" stroke-dasharray="3 4"/>
    <path d="${line} L${xy[last][0]},${H} L${xy[0][0]},${H} Z" fill="url(#spG)"/>
    <path d="${line}" fill="none" stroke="#e8e6ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" style="stroke-dasharray:1000;stroke-dashoffset:1000;animation:draw 1.2s var(--ease-out) forwards"/>
    <circle cx="${xy[last][0]}" cy="${yy[last]}" r="4" fill="${riskColor(pts[last])}"/>`;
}
const st = document.createElement("style");
st.textContent = "@keyframes draw{to{stroke-dashoffset:0}}";
document.head.appendChild(st);

function renderSignals(sig) {
  if (!body) return;
  const box = $("#sigs", body);
  const list = state.config?.signals || [];
  if (!box.children.length) {
    box.innerHTML = list.map((s) => `<div class="sig ${s.negative ? "neg" : ""}" data-k="${s.key}"><span>${s.label}</span><div class="bar"><i></i></div><span class="v">—</span></div>`).join("");
  }
  list.forEach((s) => {
    const row = $(`.sig[data-k="${s.key}"]`, box);
    const v = sig ? sig[s.key] : 0;
    $("i", row).style.width = `${Math.round(v * 100)}%`;
    $(".v", row).textContent = sig ? toAr(v.toFixed(1)) : "—";
  });
}

function renderFiles() {
  if (!body) return;
  const m = state.config?.model || {};
  const c = state.config || {};
  $("#files", body).innerHTML = `
    <div class="runtime">
      <span class="chip ${c.brain === "claude" ? "safe" : ""}"><i></i>العميل: ${c.brain === "claude" ? "Claude" : "سيناريو محلي"}</span>
      <span class="chip ${c.voice === "elevenlabs" ? "safe" : ""}"><i></i>الصوت: ${c.voice === "elevenlabs" ? "ElevenLabs" : "صوت المتصفح"}</span>
    </div>`
  + `
    <div class="file"><div class="fi">ANN</div><div><b>weights/AE1_Learned_Features/model.${m.kind === "keras" ? "keras" : "joblib"}</b><span>${esc(m.name || "")}${m.auc ? ` · AUC ${m.auc}` : ""}</span></div></div>
    <div class="file"><div class="fi">JSON</div><div><b>weights/AE1_Learned_Features/meta.json</b><span>${n((m.features || []).length)} خاصية · ${esc(m.dataset || "")}</span></div></div>
    <div class="file"><div class="fi">CSV</div><div><b>data/bank_clean.csv</b><span>عملاء حقيقيون من بيانات UCI Bank Marketing</span></div></div>
    <div class="feat-list" style="margin-top:6px">${(m.features || []).map((f) => `<span class="k">${f}</span>`).join(" · ")}</div>
    <div class="feat-note">نموذج AE1 الحقيقي متصل. مخرج الشبكة لرفض العرض؛ مؤشر المحادثة محاكاة، وليس احتمال مغادرة مقاساً.</div>`;
}

// ---------- terminal ----------
const termLines = [];
function termBoot() {
  if (!body) return;
  const t = $("#term", body);
  t.innerHTML = termLines.join("") + `<span class="cursor"></span>`;
  if (!termLines.length) {
    log(`<span class="c"># nabd · churn watcher</span>`);
    log(`<span class="p">$</span> nabd load ${esc(state.config?.model?.kind === "keras" ? "model.keras" : "model.joblib")}`);
    log(`  model: <span class="k">${esc(state.config?.model?.name || "")}</span>`);
    log(`  brain: <span class="k">${esc(state.config?.brain)}</span>   voice: <span class="k">${esc(state.config?.voice)}</span>`);
  }
}
export function log(html) {
  termLines.push(`<div class="ln">${html}</div>`);
  if (termLines.length > 400) termLines.splice(0, 100);
  if (!body) return;
  const t = $("#term", body);
  t.innerHTML = termLines.join("") + `<span class="cursor"></span>`;
  const pane = t.parentElement;
  pane.scrollTop = pane.scrollHeight;
}

export function startCall() {
  shown = 0.5;
  setIdle(false);
  setTask();
  thinking(false);
  const c = state.call;
  log(`<span class="p">$</span> nabd watch --call ${esc(c.id)}`);
  log(`  customer row #${c.customer.row_index} · scenario <span class="w">${esc(c.customer.scenario)}</span>`);
  log(`  features ${esc(Object.entries(c.row).map(([k, v]) => `${k}=${v}`).join(" "))}`);
  log(`  ae1.predict(customer_features) → non_subscription=<span class="r">${c.score.ann.toFixed(3)}</span>`);
  update({ score: c.score, delta: null, signals: null, hint: c.hint });
}

export function logTurn(text, r) {
  const s = r.signals;
  log(`<span class="p">›</span> heard: "<bdi dir="rtl">${esc(text.slice(0, 120))}</bdi>"`);
  log(`  signals ${Object.entries(s).map(([k, v]) => `${k}=<span class="${(k === "pressure" || k === "rudeness") ? (v > .3 ? "r" : "c") : (v > .5 ? "g" : "c")}">${v.toFixed(2)}</span>`).join(" ")}`);
  log(`  state   mood=${r.score.mood.toFixed(2)} trust=${r.score.trust.toFixed(2)} interest=${r.score.interest.toFixed(2)} → engagement=${r.score.engagement.toFixed(2)}`);
  log(`  ae1.predict(customer_features) → non_subscription=${r.score.ann.toFixed(3)}`);
  log(`  tone shift ${r.score.tone_shift.toFixed(2)} → final=<span class="${r.score.final > 0.5 ? "r" : "g"}">${r.score.final.toFixed(3)}</span>${r.delta != null ? `  (${r.delta < 0 ? "▼" : "▲"}${Math.abs(r.delta * 100).toFixed(1)})` : ""}  <span class="c">[${r.source}]</span>`);
  if (r.ended) log(`  <span class="${r.end_reason === "retained" ? "g" : "r"}">call ended: ${r.end_reason}</span>`);
}

function redrawFromTimeline() {
  const last = state.timeline[state.timeline.length - 1];
  if (last) update({ score: last, delta: null, signals: last.signals || null, hint: state.call?.hint });
}

on("call:ended", () => { setTask(); thinking(false); status("انتهت المكالمة"); });
on("call:next", () => setTimeout(() => { setTask(); setIdle(true); status("جاهز"); }, 0));
