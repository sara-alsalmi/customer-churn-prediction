// Small synthesized sounds; no audio files needed.
import { prefs } from "./prefs.js";

let ctx, masterNode;
const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
// Every sound goes through one volume knob (Control Center / Settings).
export function master() {
  if (!masterNode) { masterNode = ac().createGain(); masterNode.gain.value = prefs.volume; masterNode.connect(ac().destination); }
  return masterNode;
}
export function setVolume(v) { try { master().gain.value = v; } catch {} }
const fx = () => prefs.sfx;

export function unlock() {
  try { ac().resume(); } catch {}
}

function tone(freq, start, dur, gain = 0.08, type = "sine") {
  const c = ac();
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(master());
  o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05);
}

let ringTimer = null;
export function ring() {
  stopRing();
  const once = () => {
    // soft marimba-like double chime
    [0, 0.18, 0.36].forEach((t, i) => { tone([988, 1319, 1175][i], t, 0.5, 0.07, "sine"); tone([494, 659, 587][i], t, 0.6, 0.04, "triangle"); });
    [0.9, 1.08, 1.26].forEach((t, i) => { tone([988, 1319, 1568][i], t, 0.5, 0.07, "sine"); });
  };
  try { once(); } catch {}
  ringTimer = setInterval(() => { try { once(); } catch {} }, 2600);
}
export function stopRing() { clearInterval(ringTimer); ringTimer = null; }

export function pop() { if (!fx()) return; try { tone(880, 0, 0.12, 0.05); tone(1320, 0.05, 0.16, 0.04); } catch {} }
export function connect() { try { tone(660, 0, 0.12, 0.06); tone(990, 0.12, 0.2, 0.06); } catch {} }
export function hangup() { try { tone(480, 0, 0.18, 0.07, "triangle"); tone(360, 0.2, 0.3, 0.07, "triangle"); } catch {} }
export function win() { if (!fx()) return; try { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.5, 0.05)); } catch {} }
export function lose() { if (!fx()) return; try { [392, 330, 262].forEach((f, i) => tone(f, i * 0.14, 0.5, 0.05, "triangle")); } catch {} }

export const audioCtx = ac;
export function click() { if (!fx()) return; try { tone(1800, 0, 0.03, 0.025, "square"); } catch {} }
export function trash() { if (!fx()) return; try { tone(300, 0, 0.12, 0.05, "triangle"); tone(180, 0.08, 0.2, 0.05, "triangle"); } catch {} }
export function shot() { if (!fx()) return; try { tone(2200, 0, 0.05, 0.03); tone(1400, 0.06, 0.08, 0.03); } catch {} }
export function boop() { if (!fx()) return; try { tone(520, 0, 0.14, 0.05, "triangle"); } catch {} }
