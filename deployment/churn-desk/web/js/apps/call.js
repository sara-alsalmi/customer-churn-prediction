// «المكالمات»: the softphone. Rings, connects, carries the conversation.
import { $, h, esc, api, mmss, signedPts, sleep, pct, isMove, riskColor, riskWord, riskClass, tween } from "../util.js";
import * as os from "../os.js";
import * as sound from "../sound.js";
import * as voice from "../voice.js";
import * as nabd from "./nabd.js";
import { openCrm } from "./crm.js";
import { show as showReport } from "./report.js";
import { addMail } from "./mail.js";
import { state, emit, on } from "../state.js";

let body = null;
let phase = "idle"; // idle | ringing | connecting | live | ended
let ringNote = null;
let timerInt = null;
let listener = null;
let busy = false;
let speakingGen = 0;
let pending = null;   // the next caller's session, loaded while the phone rings
let shownRisk = null; // number drawn on the call's risk bar

const ICON = {
  mic: `<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`,
  send: `<svg viewBox="0 0 24 24"><path d="M20 12L5 5l2.5 7L5 19z" fill="currentColor" transform="rotate(180 12 12)"/></svg>`,
  phone: `<svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.4 15.4 0 006.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 013 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" fill="currentColor"/></svg>`,
};

const elapsed = () => (state.call ? (performance.now() - state.call.startedAt) / 1000 : 0);

export function openCall() {
  return os.open("call", {
    title: "المكالمات",
    width: 540, height: 680,
    render(b) { body = b; render(); },
    onClose: () => {
      if (phase === "live") { os.notify({ app: "المكالمات", icon: ICON.phone, iconBg: "#138a46", text: "فيه مكالمة جارية. أنهِها أول من الزر الأحمر." }); return false; }
      body = null;
    },
  });
}

function render() {
  if (!body) return;
  if (phase === "live" || (phase === "ended" && state.call)) return renderLive();
  const txt = {
    idle: ["لا توجد مكالمات", "خلك جاهز. نظام التنبؤ يحوّل لك العملاء اللي مؤشر المحاكاةم عالي."],
    ringing: ["مكالمة واردة", "عميل محوّل من نظام التنبؤ بالمغادرة. رد عليه من الإشعار أو من هنا."],
    connecting: ["جاري التحويل…", "نبض يسحب ملف العميل ويشغّل النموذج."],
    ended: ["انتهت المكالمة", ""],
  }[phase];
  if (phase === "ringing") return renderRinging();
  body.innerHTML = `
    <div class="call-idle">
      <div>
        <div class="orb big-orb ${phase === "connecting" ? "thinking" : ""}"></div>
        <h3>${txt[0]}</h3><p>${txt[1]}</p>
      </div>
    </div>`;
}

// Incoming call screen with caller ID, like a real phone.
function renderRinging() {
  const s = pending?.data;
  const c = s?.customer;
  body.innerHTML = `
    <div class="call-idle ringing">
      <div>
        <div class="ring-av ${c ? "" : "loading"}">
          ${c ? `<div class="avatar big ${c.gender === "f" ? "f" : ""}">${esc(c.initials)}</div>` : `<div class="orb big-orb thinking"></div>`}
        </div>
        <div class="ring-kicker">مكالمة واردة · محوّلة من نظام التنبؤ</div>
        <h3>${c ? esc(c.name) : "جاري التعرّف على المتصل…"}</h3>
        ${c ? `<p class="ring-why">${esc(c.scenario_title)}</p>
        <div class="ring-risk"><span class="chip ${riskClass(s.score.final)}"><i></i>مؤشر المحاكاة ${pct(s.score.final)}</span></div>` : ""}
        <div class="ring-actions">
          <button class="ring-btn decline" id="cDecline"><span>${ICON.phone}</span>رفض</button>
          <button class="ring-btn answer" id="cAnswer"><span>${ICON.phone}</span>رد</button>
        </div>
      </div>
    </div>`;
  $("#cAnswer", body).onclick = answer;
  $("#cDecline", body).onclick = decline;
}

function renderLive() {
  const c = state.call.customer;
  body.innerHTML = `
    <div class="call">
      <div class="call-head">
        <div class="avatar ${c.gender === "f" ? "f" : ""}" id="cAv">${esc(c.initials)}</div>
        <div class="call-who"><b>${esc(c.name)}</b><span>${esc(c.scenario_title)}</span></div>
        <div class="call-meta">
          <span class="chip"><i class="live-dot"></i><span id="cState">متصل</span></span>
          <span class="call-timer" id="cTimer">${mmss(0)}</span>
        </div>
      </div>
      <div class="riskbar" title="مؤشر المغادرة التجريبي حسب النموذج">
        <span class="rb-label">مؤشر المحاكاة</span>
        <div class="rb-track"><i id="rbFill"></i><b id="rbMark"></b></div>
        <span class="rb-num" id="rbNum">—</span>
        <span class="rb-delta" id="rbDelta"></span>
      </div>
      <div class="transcript" id="cLog"></div>
      <div class="coach" id="cCoach">
        <div class="orb"></div>
        <div><b>نبض يقترح</b><span id="cCoachText">${esc(state.call.hint || "")}</span></div>
      </div>
      <div class="composer">
        <div class="listen-bar" id="cListen"><div class="bars"><i></i><i></i><i></i><i></i><i></i></div><span>أسمعك… اضغط المايك مرة ثانية لما تخلص</span></div>
        <button class="mic" id="cMic" title="تكلّم (أو اضغط مسافة مطوّلاً)">${ICON.mic}</button>
        <textarea class="say" id="cSay" rows="1" placeholder="تكلّم أو اكتب ردّك…"></textarea>
        <button class="send" id="cSend" title="إرسال">${ICON.send}</button>
        <button class="hang" id="cHang" title="إنهاء المكالمة">${ICON.phone}</button>
      </div>
    </div>`;
  const log = $("#cLog", body);
  for (const m of state.call.messages) log.appendChild(bubble(m));
  log.scrollTop = log.scrollHeight;
  const say = $("#cSay", body);
  say.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendText(); }
  });
  say.addEventListener("input", () => { say.style.height = "auto"; say.style.height = Math.min(120, say.scrollHeight) + "px"; });
  $("#cSend", body).onclick = sendText;
  $("#cHang", body).onclick = () => hangUp();
  const mic = $("#cMic", body);
  mic.onclick = toggleMic;
  if (!voice.canListen()) { mic.disabled = true; mic.title = "المتصفح ما يدعم التعرّف على الصوت. استخدم Chrome أو اكتب."; }
  setEnabled(phase === "live" && !busy);
  if (phase === "ended") { $("#cState", body).textContent = "انتهت"; setEnabled(false); }
  tickTimer();
  const last = state.timeline[state.timeline.length - 1];
  shownRisk = null;
  if (last) updateRisk(last.final, null);
}

// The slim risk bar under the call header: same number as Nabd's gauge.
function updateRisk(p, delta) {
  if (!body) return;
  const fill = $("#rbFill", body), num = $("#rbNum", body), d = $("#rbDelta", body);
  if (!fill) return;
  fill.style.width = `${Math.round(p * 100)}%`;
  fill.style.background = `linear-gradient(90deg, #3ddc97, ${riskColor(Math.min(p, 0.5))}, ${riskColor(p)})`;
  const from = shownRisk ?? p;
  tween(from, p, 900, (v) => { num.textContent = pct(v); num.style.color = riskColor(v); });
  shownRisk = p;
  num.title = riskWord(p);
  if (isMove(delta)) {
    d.className = `rb-delta show ${delta < 0 ? "down" : "up"}`;
    d.textContent = `${delta < 0 ? "▼" : "▲"} ${signedPts(delta)}`;
  } else d.className = "rb-delta";
}

function coach(text) {
  if (!body || !text) return;
  const c = $("#cCoach", body);
  $("#cCoachText", body).textContent = text;
  c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash");
}

function bubble(m) {
  const el = h(`<div class="msg ${m.role === "employee" ? "emp" : "cust"}">
      <span class="who">${m.role === "employee" ? esc(state.employee) : esc(state.call.customer.first_name)}</span>${esc(m.text)}
      ${m.delta != null ? deltaChip(m.delta) : ""}</div>`);
  return el;
}
const deltaChip = (d) => isMove(d)
  ? `<span class="delta ${d < 0 ? "down" : "up"}" title="${d < 0 ? "هذا الرد نزّل مؤشر المحاكاة" : "هذا الرد رفع مؤشر المحاكاة"}">${d < 0 ? "▼" : "▲"} ${signedPts(d)} نقطة</span>`
  : `<span class="delta flat" title="هذا الرد ما غيّر شيء">= بدون تغيير</span>`;

function push(m) {
  state.call.messages.push(m);
  if (!body) return null;
  const log = $("#cLog", body);
  if (!log) return null;
  const el = bubble(m);
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

function typing(on) {
  if (!body) return;
  const log = $("#cLog", body);
  if (!log) return;
  $(".typing", log)?.remove();
  if (on) { log.appendChild(h(`<div class="typing"><i></i><i></i><i></i></div>`)); log.scrollTop = log.scrollHeight; }
}

function setEnabled(on) {
  if (!body) return;
  ["#cSay", "#cSend", "#cMic"].forEach((s) => { const e = $(s, body); if (e && !(s === "#cMic" && !voice.canListen())) e.disabled = !on; });
}

function tickTimer() {
  const t = body && $("#cTimer", body);
  if (t) t.textContent = mmss(elapsed());
}

// ---------------- ringing ----------------
export function incoming() {
  if (phase === "live" || phase === "ringing" || phase === "connecting") return;
  phase = "ringing";
  if (!pending) {
    const p = { data: null };
    p.promise = api("/api/session", {}).then((d) => { p.data = d; return d; });
    p.promise.catch(() => {});
    pending = p;
  }
  const q = $("#wQueue .q-row");
  q?.classList.add("ringing");
  $("#qText").textContent = "عميل على الخط";
  sound.ring();
  os.bounce("call");
  if (os.isOpen("call")) render(); else openCall();
  const me = pending;
  const showNote = (d) => {
    if (phase !== "ringing" || pending !== me) return;
    const c = d?.customer;
    if (c) $("#qText").textContent = `${c.name} · خطر ${pct(d.score.final)}`;
    ringNote?.dismiss();
    ringNote = os.notify({
      app: "المكالمات", icon: ICON.phone, iconBg: "#138a46", ring: true, ttl: 0,
      title: c ? c.name : "مكالمة واردة",
      text: c ? `${c.scenario_title} · مؤشر المحاكاة ${pct(d.score.final)}` : "عميل محوّل من نظام التنبؤ بالمغادرة",
      actions: [{ label: "رفض", kind: "no", do: decline }, { label: "رد", kind: "ok", do: answer }],
    });
    if (os.isOpen("call")) render();
  };
  if (me.data) showNote(me.data);
  else me.promise.then(showNote, () => showNote(null));
}

function decline() {
  sound.stopRing();
  ringNote?.dismiss();
  phase = "idle";
  $("#wQueue .q-row")?.classList.remove("ringing");
  $("#qText").textContent = pending?.data ? `${pending.data.customer.first_name} بيعاود الاتصال…` : "العميل بيعاود الاتصال…";
  render();
  addMail({ from: "سلمان · مشرف الفريق", subject: "لا ترفض المكالمات", text: "العملاء اللي يحوّلهم النظام لك هم الأكثر عرضة للمغادرة. كل مكالمة مرفوضة احتمال تكون عميل خسرناه. بيرجع يتصل بعد شوي." });
  setTimeout(incoming, 5000);
}

async function answer() {
  if (phase !== "ringing") return;
  sound.stopRing();
  sound.unlock();
  ringNote?.dismiss();
  phase = "connecting";
  $("#wQueue .q-row")?.classList.remove("ringing");
  $("#qText").textContent = "مكالمة جارية";
  openCall();
  render();
  let s;
  try {
    s = await (pending?.promise || api("/api/session", {}));
  } catch (e) {
    pending = null;
    phase = "idle"; render();
    os.notify({ app: "النظام", text: "تعذّر الاتصال بالخادم. تأكد إنه شغّال وحاول مرة ثانية." });
    return;
  }
  pending = null;
  sound.connect();
  state.call = {
    id: s.session_id, customer: s.customer, opening: s.opening, score: s.score, hint: s.hint, row: s.model_row,
    startedAt: performance.now(), messages: [],
  };
  state.timeline = [{ ...s.score }];
  phase = "live";
  busy = true;
  render();
  timerInt = setInterval(tickTimer, 500);

  // Bring up the CRM and the dot's computer beside the call.
  openCrm();
  nabd.openNabd();
  arrange();
  os.focus("call");
  emit("call:started");
  nabd.startCall();

  await sleep(500);
  await customerSays(s.opening);
  busy = false;
  setEnabled(true);
  $("#cSay", body)?.focus();
}

function arrange() {
  if (os.isPhone()) return;
  const a = os.area();
  const g = 14, side = 16;
  const nW = 410, cW = 370;
  let callW = a.w - nW - cW - 2 * side - 2 * g;
  const H = a.h - 12;
  if (callW >= 440) {
    os.place("nabd", { x: side, y: 8, w: nW, h: H });
    os.place("crm", { x: a.w - side - cW, y: 8, w: cW, h: H });
    os.place("call", { x: side + nW + g, y: 8, w: Math.min(callW, 640), h: H });
    if (callW > 640) os.place("call", { x: side + nW + g + (callW - 640) / 2, y: 8, w: 640, h: H });
  } else {
    os.place("nabd", { x: side, y: 8, w: 400, h: H });
    os.place("crm", { x: a.w - side - 360, y: 28, w: 360, h: H - 20 });
    os.place("call", { x: (a.w - 520) / 2, y: 18, w: 520, h: H - 20 });
  }
}

// Shows the customer's line, then speaks it. Resolves once the line is on screen;
// the returned .spoken promise resolves when the voice ends (the employee may cut in).
async function customerSays(text) {
  typing(true);
  await sleep(350 + Math.min(900, text.length * 8));
  typing(false);
  push({ role: "customer", text });
  const gen = ++speakingGen;
  const av = body && $("#cAv", body);
  const spoken = voice.speak(text, state.call.customer.gender, (l) => {
    if (gen !== speakingGen) return;
    av?.style.setProperty("--lvl", l.toFixed(3));
    nabd.orbLevel(l * 0.6);
  });
  return { spoken };
}

// ---------------- talking ----------------
async function toggleMic() {
  sound.unlock();
  if (listener) return stopMic(true);
  if (phase !== "live" || busy) return;
  voice.stopSpeaking(); // the employee can cut in
  const say = $("#cSay", body);
  const mic = $("#cMic", body);
  mic.classList.add("on");
  $("#cListen", body).classList.add("show");
  say.placeholder = "أسمعك…";
  try {
    listener = voice.createListener({ onInterim: (t) => { if (say && t !== "…") say.value = t; } });
  } catch (e) {
    console.warn(e);
    stopMicUi();
    os.notify({ app: "المايك", text: "ما قدرت أشغّل المايك. اسمح بالوصول للمايك من المتصفح أو اكتب ردّك." });
  }
}

function stopMicUi() {
  if (!body) return;
  $("#cMic", body)?.classList.remove("on");
  $("#cListen", body)?.classList.remove("show");
  const say = $("#cSay", body);
  if (say) say.placeholder = "تكلّم أو اكتب ردّك…";
}

async function stopMic(send) {
  const l = listener;
  listener = null;
  stopMicUi();
  if (!l) return;
  if (!send) return l.cancel();
  const say = $("#cSay", body);
  if (say) say.placeholder = "أحوّل كلامك لنص…";
  const text = (await l.stop()) || say?.value || "";
  if (say) { say.value = text; say.placeholder = "تكلّم أو اكتب ردّك…"; }
  if (text.trim()) sendText();
}

async function sendText() {
  if (busy || phase !== "live") return;
  if (listener) return stopMic(true);
  const say = $("#cSay", body);
  const text = say.value.trim();
  if (!text) { say.focus(); return; }
  voice.stopSpeaking();
  say.value = ""; say.style.height = "";
  busy = true;
  setEnabled(false);
  const msg = { role: "employee", text };
  const el = push(msg);
  nabd.thinking(true);
  typing(true);
  let r;
  try {
    r = await api(`/api/session/${state.call.id}/turn`, { text, elapsed: elapsed() });
  } catch (e) {
    typing(false); nabd.thinking(false); busy = false; setEnabled(true);
    os.notify({ app: "النظام", text: "انقطع الاتصال بالخادم. أعد إرسال ردّك." });
    return;
  }
  nabd.thinking(false);
  msg.delta = r.delta;
  if (el && r.delta != null) { el.insertAdjacentHTML("beforeend", deltaChip(r.delta)); $(".delta", el)?.classList.add("pop"); }
  state.timeline.push({ ...r.score, signals: r.signals });
  state.call.hint = r.hint;
  nabd.update({ score: r.score, delta: r.delta, signals: r.signals, hint: r.hint });
  updateRisk(r.score.final, r.delta);
  coach(r.hint);
  nabd.logTurn(text, r);
  emit("call:score");
  typing(false);
  const said = await customerSays(r.reply);
  busy = false;
  if (r.ended) { await said.spoken; return finish(r.end_reason); }
  setEnabled(true);
  $("#cSay", body)?.focus();
}

// ---------------- ending ----------------
async function hangUp() {
  if (phase !== "live") return;
  voice.stopSpeaking();
  if (listener) await stopMic(false);
  finish("employee_hung_up");
}

async function finish(reason) {
  if (phase !== "live") return;
  phase = "ended";
  clearInterval(timerInt);
  sound.hangup();
  setEnabled(false);
  if (body) {
    $("#cState", body).textContent = "انتهت";
    $("#cLog", body)?.appendChild(h(`<div class="sys-line">— انتهت المكالمة · ${mmss(elapsed())} —</div>`));
  }
  let rep;
  try {
    rep = await api(`/api/session/${state.call.id}/end`, { elapsed: elapsed() });
  } catch { rep = null; }
  if (!rep) return;
  if (body) $("#cCoach", body)?.classList.add("done");
  rep.customer = state.call.customer;
  const won = rep.outcome === "retained";
  won ? sound.win() : sound.lose();
  const st = state.stats;
  st.calls++; if (won) st.saved++; st.finals.push(rep.final);
  emit("stats");
  rep.at = Date.now();
  state.reports.unshift(rep);
  emit("call:ended", rep);
  $("#qText").textContent = "لا يوجد متصلون الآن";
  addMail(won
    ? { from: "سلمان · مشرف الفريق", subject: `أحسنت مع ${rep.customer.first_name}`, text: `نزّلت مؤشر المحاكاة من ${pct(rep.start)} إلى ${pct(rep.final)}. هذا بالضبط اللي نبيه. التقرير الكامل عندك.` }
    : { from: "سلمان · مشرف الفريق", subject: `بخصوص ${rep.customer.first_name}`, text: `خسرنا العميل هالمرة (${pct(rep.final)}). شوف في التقرير أي رد رفع الخطر، وجرّب تبدأ بالاعتذار والسؤال قبل العرض.` });
  await sleep(1100);
  showReport(rep);
}

on("call:next", () => {
  phase = "idle";
  state.call = null;
  state.timeline = [];
  render();
  setTimeout(incoming, 2200);
});

// Hold Space to talk (when not typing).
let spaceDown = false;
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || spaceDown || e.repeat || phase !== "live") return;
  if (document.activeElement?.matches("textarea, input")) return;
  e.preventDefault();
  spaceDown = true;
  if (!listener) toggleMic();
});
addEventListener("keyup", (e) => {
  if (e.code !== "Space" || !spaceDown) return;
  spaceDown = false;
  if (listener) stopMic(true);
});

// Used by the menu bar.
export const callPhase = () => phase;
export const callActions = { answer: () => answer(), decline: () => decline(), hangUp: () => hangUp(), arrange: () => arrange() };
