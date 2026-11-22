import { localApi } from "./local-api.js";
import { remoteVoiceRequest } from "./voice-service-client.js";
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const AR = new Intl.NumberFormat("ar-SA", { useGrouping: true });
export const n = (x) => AR.format(x);
export const pct = (p) => `${AR.format(Math.round(p * 100))}٪`;
// Western digits -> Arabic-Indic, "." -> "٫". For text people read (not the terminal).
export const toAr = (s) => String(s).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]).replace(/(\d|[٠-٩])\.(?=[٠-٩])/g, "$1٫");
// Change in churn risk, in percentage points. Below half a point counts as no change.
export const isMove = (d) => d != null && Math.abs(d) >= 0.005;
export const signedPts = (d) => {
  const v = Math.round(d * 1000) / 10;
  return toAr(`${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`);
};

export function clock(d = new Date()) {
  return d.toLocaleTimeString("ar-SA", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?[صم]$/, "");
}
export function dateLine(d = new Date()) {
  const g = d.toLocaleDateString("ar-SA-u-ca-gregory", { weekday: "long", day: "numeric", month: "long" });
  const hj = d.toLocaleDateString("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" });
  return `${g} · ${hj}`;
}
export const mmss = (s) => {
  s = Math.max(0, Math.floor(s));
  return toAr(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
};

// green -> amber -> red
export function riskColor(p) {
  const stops = [[0, [61, 220, 151]], [0.5, [245, 184, 74]], [1, [255, 107, 107]]];
  p = Math.min(1, Math.max(0, p));
  let i = p <= 0.5 ? 0 : 1;
  const [a, ca] = stops[i], [b, cb] = stops[i + 1];
  const t = (p - a) / (b - a);
  const c = ca.map((v, k) => Math.round(v + (cb[k] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
export const riskWord = (p) => (p >= 0.75 ? "خطر عالٍ" : p >= 0.5 ? "خطر متوسط" : p >= 0.3 ? "خطر منخفض" : "آمن");
export const riskClass = (p) => (p >= 0.75 ? "risk" : p >= 0.4 ? "warn" : "safe");

// Smoothly count a number on an element.
export function tween(from, to, ms, onStep) {
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  return new Promise((res) => {
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      onStep(from + (to - from) * ease(t));
      t < 1 ? requestAnimationFrame(step) : res();
    };
    requestAnimationFrame(step);
  });
}

export async function api(path, body, opts = {}) {
  if (window.CHURN_DESK_LOCAL && ["/api/tts","/api/stt"].includes(path)) return remoteVoiceRequest(path,body);
  if (window.CHURN_DESK_LOCAL) return localApi(path, body);
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body instanceof FormData || body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    ...opts,
  });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.headers.get("content-type")?.includes("json") ? r.json() : r;
}
