// Customer voice (speaking) and employee voice (listening).
// Live: ElevenLabs through the server. Offline: the browser's own speech engines.
import { api } from "./util.js";
import { audioCtx, master } from "./sound.js";
import { prefs } from "./prefs.js";

let mode = "browser";
export function setMode(m) { mode = m; }

function announce(provider, status="playing") {
  window.dispatchEvent(new CustomEvent("voice-status",{detail:{provider,status}}));
}

let current = null; // {stop}
export function stopSpeaking() { current?.stop(); current = null; }

export async function speak(text, gender, onLevel = () => {}) {
  stopSpeaking();
  if (mode === "elevenlabs") {
    try { return await speakEleven(text, gender, onLevel); } catch (e) {
      console.warn("ElevenLabs playback failed; using browser voice", e);
      announce("browser","fallback");
    }
  }
  return speakBrowser(text, gender, onLevel);
}

async function speakEleven(text, gender, onLevel) {
  const r = await api("/api/tts", { text, gender });
  const url = URL.createObjectURL(await r.blob());
  const audio = new Audio(url);
  const ctx = audioCtx();
  const src = ctx.createMediaElementSource(audio);
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  src.connect(an); an.connect(master());
  const buf = new Uint8Array(an.frequencyBinCount);
  let raf;
  const loop = () => {
    an.getByteTimeDomainData(buf);
    let s = 0;
    for (const v of buf) s += Math.abs(v - 128);
    onLevel(Math.min(1, (s / buf.length) / 22));
    raf = requestAnimationFrame(loop);
  };
  return new Promise((res,reject) => {
    const cleanup = () => {cancelAnimationFrame(raf);src.disconnect();an.disconnect();onLevel(0);URL.revokeObjectURL(url);};
    const done = () => {cleanup();res();};
    current = { stop: () => { audio.pause(); done(); } };
    audio.onended = () => {announce("elevenlabs","completed");done();};
    audio.onerror = () => {cleanup();reject(Error("Unable to decode ElevenLabs audio"));};
    audio.play().then(() => {announce("elevenlabs");loop();}).catch((error) => {cleanup();reject(error);});
  });
}

let voices = [];
function loadVoices() { voices = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("ar")); }
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
const MALE = /majed|maged|tarik|hamed|naayf|shakir|fahed|male/i;
const FEMALE = /laila|mariam|zariyah|hoda|salma|amina|female|zeina/i;

function pickVoice(gender) {
  if (!voices.length) loadVoices();
  const sa = voices.filter((v) => /sa/i.test(v.lang));
  const pool = sa.length ? sa : voices;
  const want = gender === "f" ? FEMALE : MALE;
  return pool.find((v) => want.test(v.name)) || pool[0] || null;
}

function speakBrowser(text, gender, onLevel) {
  if (!("speechSynthesis" in window)) return new Promise((r) => setTimeout(r, Math.min(6000, 60 * text.length)));
  return new Promise((res) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(gender);
    if (v) u.voice = v;
    u.lang = v?.lang || "ar-SA";
    u.rate = prefs.speechRate;
    u.volume = prefs.volume;
    u.pitch = gender === "f" ? 1.12 : 0.95;
    let raf, t0 = performance.now(), last = 0;
    const loop = (t) => {
      // speech engines give no audio stream; make a natural-looking level from word timing
      const since = (t - last) / 1000;
      const base = 0.35 + 0.25 * Math.sin((t - t0) / 90) * Math.sin((t - t0) / 230);
      onLevel(Math.max(0, base * Math.exp(-since * 2.2) + 0.08));
      raf = requestAnimationFrame(loop);
    };
    u.onboundary = () => { last = performance.now(); };
    u.onstart = () => { last = performance.now(); raf = requestAnimationFrame(loop); };
    const done = () => { cancelAnimationFrame(raf); onLevel(0); res(); };
    u.onend = done; u.onerror = done;
    current = { stop: () => { speechSynthesis.cancel(); done(); } };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    // safety: some engines never fire onend
    setTimeout(done, 1500 + text.length * 120);
  });
}

// ---------------- listening ----------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = () => (mode === "elevenlabs" ? !!navigator.mediaDevices?.getUserMedia : !!SR);

export function createListener({ onInterim = () => {}, onLevel = () => {} } = {}) {
  return mode === "elevenlabs" ? elevenListener(onInterim, onLevel) : browserListener(onInterim);
}

function browserListener(onInterim) {
  const rec = new SR();
  rec.lang = "ar-SA";
  rec.interimResults = true;
  rec.continuous = true;
  let finalText = "", live = "", stopped = false, resolveStop;
  rec.onresult = (e) => {
    live = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript + " ";
      else live += r[0].transcript;
    }
    onInterim((finalText + live).trim());
  };
  rec.onend = () => {
    if (!stopped) { try { rec.start(); return; } catch {} } // keep going until the user stops
    resolveStop?.((finalText + live).trim());
  };
  rec.onerror = (e) => { if (e.error === "not-allowed") { stopped = true; resolveStop?.(""); } };
  rec.start();
  return {
    stop: () => new Promise((res) => { stopped = true; resolveStop = res; try { rec.stop(); } catch { res((finalText + live).trim()); } }),
    cancel: () => { stopped = true; try { rec.abort(); } catch {} },
  };
}

function elevenListener(onInterim, onLevel) {
  let rec, stream, raf, stopTimer, stopped, chunks = [];
  const ready = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then((s) => {
    stream = s;
    const ctx = audioCtx();
    const an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(s).connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    const loop = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m += Math.abs(v - 128); onLevel(Math.min(1, m / buf.length / 18)); raf = requestAnimationFrame(loop); };
    loop();
    rec = new MediaRecorder(s);
    stopped = new Promise((resolve) => {rec.onstop = resolve;});
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start();
    stopTimer = setTimeout(() => {if(rec.state!=="inactive") rec.stop();stream?.getTracks().forEach((t)=>t.stop());},30000);
    onInterim("…");
  });
  const cleanup = () => { clearTimeout(stopTimer);cancelAnimationFrame(raf); onLevel(0); stream?.getTracks().forEach((t) => t.stop()); };
  return {
    stop: async () => {
      try {await ready;} catch {cleanup();return "";}
      if(rec.state!=="inactive") rec.stop();
      await stopped;
      cleanup();
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      const fd = new FormData();
      fd.append("file", blob, "speech." + (blob.type.includes("mp4") ? "mp4" : "webm"));
      try { return (await api("/api/stt", fd)).text || ""; } catch (e) { console.warn(e); return ""; }
    },
    cancel: async () => { try { await ready; rec.stop(); } catch {} cleanup(); },
  };
}
