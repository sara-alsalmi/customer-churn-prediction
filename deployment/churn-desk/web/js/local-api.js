// Hosted edition: real AE1 inference plus a local, explicitly simulated conversation.
// Conversation text remains in this browser. The AE1 base score never uses duration.
import { predictSubscription } from "./inference.js";

let bundle;
const sessions = new Map();
const clamp = (x, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const choose = (xs) => xs[Math.floor(Math.random() * xs.length)];
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));
const norm = (s) => String(s || "").replace(/[ً-ْـ]/g, "").replace(/[إأآا]/g, "ا")
  .replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/\s+/g, " ").trim().toLowerCase();
const has = (text, words) => words.reduce((n, w) => n + Number(text.includes(norm(w))), 0);
const rounded = (x, digits = 4) => Number(x.toFixed(digits));

async function data() {
  if (!bundle) bundle = Promise.all([
    fetch(new URL("../data/model.json", import.meta.url)).then((r) => { if (!r.ok) throw Error("Model unavailable"); return r.json(); }),
    fetch(new URL("../data/customers.json", import.meta.url)).then((r) => r.json()),
    fetch(new URL("../data/rules.json", import.meta.url)).then((r) => r.json()),
  ]).then(([model, customers, rules]) => ({ model, customers, rules }));
  return bundle;
}

function signals(text, customer, rules) {
  const t = norm(text), count = t.split(" ").length;
  const fix = has(t, rules.SCENARIOS[customer.scenario].fix_words);
  const digit = /[0-9٠-٩]/.test(text), s = {};
  s.respect = clamp(.2 + .25 * has(t, rules.GREET) + .2 * has(t, rules.POLITE), 0, 1);
  s.empathy = clamp(.3 * has(t, rules.EMPATHY), 0, 1);
  s.listening = clamp(.3 * has(t, rules.LISTEN) + (/[?؟]/.test(text) ? .3 : 0)
    + (t.includes(norm(customer.first_name)) ? .3 : 0), 0, 1);
  s.solution = clamp(.22 * has(t, rules.SOLUTION) + .4 * fix + (digit ? .15 : 0), 0, 1);
  s.pressure = clamp(.4 * has(t, rules.PRESSURE), 0, 1);
  s.rudeness = clamp(.45 * has(t, rules.RUDE) + (rules.SHORT_COLD.includes(t) ? .35 : 0), 0, 1);
  s.clarity = clamp(.25 + (count >= 6 && count <= 45 ? .35 : 0) + (digit ? .2 : 0)
    - (count > 70 ? .3 : 0) - (count < 3 ? .25 : 0), 0, 1);
  if (rules.SHORT_COLD.includes(t)) s.respect = Math.min(s.respect, .15);
  s._fix_hits = fix;
  return s;
}

function quality(s) {
  const positive = (1.2*s.empathy + .8*s.respect + .6*s.clarity + .9*s.listening + 1.2*s.solution)/4.7;
  return clamp(2*positive - .45 - s.pressure - 1.4*s.rudeness);
}
function engagement(s) { return clamp(.5 + .5*(.5*s.interest + .3*s.trust + .2*s.mood), 0, 1); }
function score(s, elapsed = 0, sig = null) {
  const engaged = engagement(s), q = sig ? quality(sig) : 0;
  const shift = -.7*q - 3*(engaged - .34);
  const base = clamp(s.base, .02, .985);
  return { ann: rounded(s.base), final: rounded(sigmoid(logit(base) + shift)), tone_shift: rounded(shift, 3),
    duration_feature: Math.floor(Math.max(elapsed, 60 + 940*engaged**1.15)), duration_used_by_model: false,
    score_type: "simulation based on non-subscription score", engagement: rounded(engaged, 3),
    mood: rounded(s.mood, 3), trust: rounded(s.trust, 3), interest: rounded(s.interest, 3) };
}
function apply(s, sig) {
  const q = quality(sig);
  s.mood = clamp(s.mood + .28*q + .06*sig.respect - .25*sig.rudeness);
  s.trust = clamp(s.trust + .18*sig.empathy + .13*sig.listening + .08*sig.respect - .3*sig.pressure - .3*sig.rudeness - .03);
  if ((sig._fix_hits > 0 || sig.solution >= .6) && s.trust > -.35) s.fixed = true;
  s.interest = clamp(s.interest + .3*sig.solution*(s.fixed ? 1.25 : .45) + .06*sig.clarity
    - .2*sig.pressure - .15*sig.rudeness - .03);
}
function fill(line, c, row) {
  const gendered = { tired: ["تعبان", "تعبانة"], متصل: ["متصل", "متصلة"], مقتنع: ["مقتنع", "مقتنعة"],
    متردد: ["متردد", "مترددة"], ميّال: ["ميّال", "ميّالة"] };
  return line.replace(/\{([^}]+)\}/g, (_, key) => key === "campaign" ? row.campaign : gendered[key]?.[c.gender === "f" ? 1 : 0] || "");
}
function hint(s, sig, r) {
  if (!sig) return `رحّب بالعميل باسمه، ثم اسمع سبب اتصاله: ${s.customer.scenario_title}.`;
  if (sig.rudeness >= .4) return "الأسلوب صار حاد. خفّف النبرة واعتذر قبل أي شيء.";
  if (sig.pressure >= .4) return "لا تضغط عليه للقرار. اعطه مساحة واسأله وش يناسبه.";
  if (s.trust < 0 && sig.empathy < .3) return "أظهر إنك فاهم مشكلته قبل ما تعرض شيء.";
  if (!s.fixed) return r.SCENARIOS[s.customer.scenario].fix;
  return s.interest < .4 ? "الحل وصله. وضّح التفاصيل وبدون مبالغة." : `أكّد له الخطوة الجاية يا ${s.customer.first_name}.`;
}
function reply(s, sig, r) {
  let text, end = null;
  const count = s.turns.filter((t) => t.role === "employee").length;
  if (s.mood <= -.9 || (sig.rudeness >= .8 && s.mood < -.5)) { text = choose(r.LOSE); end = "hangup"; }
  else if (s.fixed && s.trust >= .3 && s.interest >= .35 && s.mood >= 0) { text = choose(r.WIN); end = "retained"; }
  else if (count >= 16) { end = engagement(s) > .62 ? "retained" : "hangup"; text = choose(end === "retained" ? r.WIN : r.LOSE); }
  else if (sig.rudeness >= .4) text = choose(r.ANGRY);
  else if (sig.pressure >= .4) text = choose(r.PRESSURED);
  else {
    const parts = [];
    if (sig.empathy >= .3 || sig.respect >= .6) parts.push(choose(r.SOFTEN));
    if (sig.listening >= .3 && !s.asked) { parts.push(r.ASKED[s.customer.scenario]); s.asked = true; }
    if (sig.solution >= .4) parts.push(s.trust > -.2 ? choose(r.INTERESTED) : "وش يضمن لي؟ وضّح لي الشروط.");
    text = parts.length ? parts.slice(0, 2).join(" ") : choose(sig.clarity < .35 ? r.VAGUE : r.NEUTRAL);
  }
  return [fill(text, s.customer, s.row), end];
}

export async function localApi(path, body) {
  const {model, customers, rules} = await data();
  if (path === "/api/config") return { brain: "offline", voice: "browser", pool: customers.length,
    model: { name: model.meta.name, kind: "keras", auc: rounded(model.meta.test_auc), features: model.meta.features,
      dataset: model.meta.dataset, target: model.meta.target, duration_used: false },
    signals: rules.SIGNALS.map((key) => ({ key, label: rules.SIGNAL_AR[key], negative: ["pressure", "rudeness"].includes(key) })) };
  if (path === "/api/health") return { ok: true };
  if (path === "/api/session") {
    const record = choose(customers), customer = structuredClone(record.customer);
    const s = { id: crypto.randomUUID().slice(0, 12), customer, row: record.row, actual: record.actual,
      base: 1 - predictSubscription(record.row, model), mood: -.45, trust: -.25, interest: -.3,
      turns: [], timeline: [], fixed: false, ended: false, end_reason: null };
    const opening = fill(choose(rules.OPEN[customer.scenario]), customer, s.row);
    s.turns.push({role: "customer", text: opening});
    const sc = score(s); s.timeline.push({ t: 0, ...sc, label: "بداية المكالمة" });
    sessions.set(s.id, s);
    // Keep only recent browser sessions, while reports already live in the UI state.
    if (sessions.size > 50) sessions.delete(sessions.keys().next().value);
    return {session_id: s.id, customer, opening, score: sc, hint: hint(s, null, rules), model_row: s.row};
  }
  const match = path.match(/^\/api\/session\/([^/]+)\/(turn|end)$/);
  if (!match) throw Error("Unknown local route");
  const s = sessions.get(match[1]); if (!s) throw Error("No such call");
  if (match[2] === "turn") {
    if (s.ended) throw Error("Call ended");
    const text = String(body?.text || "").trim().slice(0, 1200); if (!text) throw Error("Empty reply");
    s.turns.push({role: "employee", text});
    const before = s.timeline.at(-1).final, sig = signals(text, s.customer, rules);
    apply(s, sig);
    const [textReply, end] = reply(s, sig, rules);
    s.turns.push({role: "customer", text: textReply});
    if (end) { s.ended = true; s.end_reason = end; s.mood = s.trust = s.interest = end === "retained" ? 1 : -1; }
    const sc = score(s, body.elapsed, sig), visible = Object.fromEntries(rules.SIGNALS.map((k) => [k, rounded(sig[k], 3)]));
    s.timeline.push({t: body.elapsed, ...sc, label: text.slice(0, 60), signals: visible, quality: quality(sig)});
    return {reply: textReply, score: sc, delta: rounded(sc.final - before), signals: visible, quality: quality(sig),
      hint: hint(s, sig, rules), ended: s.ended, end_reason: s.end_reason, source: "offline"};
  }
  s.ended = true; s.end_reason ||= "employee_hung_up";
  const tl = s.timeline, steps = tl.slice(1).map((t, i) => ({delta: rounded(t.final - tl[i].final), text: t.label}));
  const sigs = tl.filter((t) => t.signals), final = tl.at(-1).final;
  const won = s.end_reason === "retained" || (s.end_reason === "employee_hung_up" && final < .5);
  return {outcome: won ? "retained" : "churned", end_reason: s.end_reason, final, start: tl[0].final, timeline: tl,
    best: [...steps].sort((a,b) => a.delta - b.delta)[0] || null,
    worst: [...steps].sort((a,b) => b.delta - a.delta)[0] || null,
    avg_signals: Object.fromEntries(rules.SIGNALS.map((k) => [k, sigs.length ? sigs.reduce((n,t) => n+t.signals[k], 0)/sigs.length : 0])),
    turns: s.turns.filter((t) => t.role === "employee").length, elapsed: Math.round(body.elapsed || 0),
    actual: s.actual, scenario: s.customer.scenario_title, transcript: s.turns};
}
