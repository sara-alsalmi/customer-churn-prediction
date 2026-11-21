// System settings, kept in this browser.
import { emit } from "./state.js";

const KEY = "rs-prefs";
const DEF = {
  wallpaper: "night", accent: "blue", volume: 0.8, sfx: true, brightness: 1, dnd: false,
  dockSize: 52, magnify: true, speechRate: 1.02, hotCorner: true, notesSeeded: false,
};
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
export const prefs = { ...DEF, ...saved };

export function setPref(k, v) {
  prefs[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
  emit("prefs", k);
}
