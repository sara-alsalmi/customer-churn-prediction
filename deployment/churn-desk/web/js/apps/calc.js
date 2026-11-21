// «الحاسبة»: a working calculator, keyboard too.
import { $, $$, toAr } from "../util.js";
import * as os from "../os.js";
import * as sound from "../sound.js";

let cur = "0", acc = null, op = null, fresh = true, body = null, err = false, zeroErr = "خطأ";

const KEYS = [
  ["ac", "AC", "fn"], ["neg", "±", "fn"], ["pct", "%", "fn"], ["÷", "÷", "op"],
  ["7", "7"], ["8", "8"], ["9", "9"], ["×", "×", "op"],
  ["4", "4"], ["5", "5"], ["6", "6"], ["−", "−", "op"],
  ["1", "1"], ["2", "2"], ["3", "3"], ["+", "+", "op"],
  ["0", "0", "zero"], [".", "٫"], ["=", "=", "op"],
];

export function openCalc() {
  return os.open("calc", {
    title: "الحاسبة",
    width: 250, height: 400, resizable: false,
    pos: (a, w) => ({ x: 120, y: 90 }),
    render(b) {
      body = b;
      b.innerHTML = `<div class="calc" dir="ltr"><div class="calc-out" id="calcOut">٠</div>
        <div class="calc-keys">${KEYS.map(([k, l, c = ""]) => `<button class="ck ${c}" data-k="${k}">${l === "AC" ? "AC" : toAr(l)}</button>`).join("")}</div></div>`;
      $$(".ck", b).forEach((x) => x.addEventListener("pointerdown", (e) => { e.preventDefault(); press(x.dataset.k); }));
      show();
    },
    onClose: () => { body = null; },
  });
}

const fmt = (x) => {
  if (!isFinite(x)) return null;
  let s = String(Number(x.toPrecision(12)));
  if (s.includes("e")) s = x.toExponential(6);
  return s;
};
let eqSpam = 0;
const ZERO = ["لا يا ذيب", "مستحيل", "عيدها وأزعل", "طيب… ∞"];
let zeroN = 0;
function compute() {
  const a = acc, b = parseFloat(cur);
  if (op === "÷" && b === 0) {
    err = true; cur = "0"; acc = null; op = null;
    zeroErr = ZERO[Math.min(zeroN++, ZERO.length - 1)];
    os.get("calc")?.animate([{ translate: "0" }, { translate: "-10px" }, { translate: "10px" }, { translate: "-6px" }, { translate: "0" }], { duration: 360 });
    if (zeroN === 1) os.notify({ app: "الحاسبة", icon: os.appIcon("calc", "tiny"), text: "القسمة على صفر؟ حتى الحاسبة تعرف إنها ما تصير." });
    return;
  }
  const r = op === "+" ? a + b : op === "−" ? a - b : op === "×" ? a * b : op === "÷" ? a / b : b;
  const s = fmt(r);
  if (s == null) { err = true; cur = "0"; acc = null; op = null; return; }
  cur = s; acc = r;
}

export function press(k) {
  sound.click();
  if (err && k !== "ac") { err = false; zeroErr = "خطأ"; }
  if (/^[0-9]$/.test(k) || k === ".") {
    if (fresh) { cur = k === "." ? "0." : k; fresh = false; }
    else if (k === "." && cur.includes(".")) return;
    else if (cur.replace(/[-.]/g, "").length >= 9) return;
    else cur = cur === "0" && k !== "." ? k : cur + k;
  } else if (["+", "−", "×", "÷"].includes(k)) {
    if (op && !fresh) compute(); else acc = parseFloat(cur);
    op = k; fresh = true;
  } else if (k === "=") {
    eqSpam = op ? 0 : eqSpam + 1;
    if (eqSpam === 8) os.notify({ app: "الحاسبة", icon: os.appIcon("calc", "tiny"), text: "الجواب ما بيتغيّر مهما ضغطت. والله." });
    if (op) { compute(); op = null; fresh = true; }
  } else if (k === "ac") {
    if (!fresh && cur !== "0") { cur = "0"; fresh = true; } else { cur = "0"; acc = null; op = null; fresh = true; }
    err = false;
  } else if (k === "neg") {
    cur = cur.startsWith("-") ? cur.slice(1) : cur === "0" ? "0" : "-" + cur;
  } else if (k === "pct") {
    cur = fmt(parseFloat(cur) / 100) || "0";
  } else if (k === "back") {
    if (!fresh) cur = cur.length > 1 ? cur.slice(0, -1) : "0";
  }
  show();
}

function show() {
  if (!body) return;
  const o = $("#calcOut", body);
  let txt = zeroErr;
  if (!err) {
    const [i, f] = cur.replace("-", "").split(".");
    const g = cur.includes("e") ? cur : i.replace(/\B(?=(\d{3})+(?!\d))/g, "٬") + (f !== undefined ? "٫" + f : "");
    txt = toAr((cur.startsWith("-") ? "-" : "") + g);
    if (cur === "5318008") txt = "😏";
  }
  o.textContent = txt;
  o.style.fontSize = txt.length > 9 ? "34px" : txt.length > 6 ? "44px" : "";
  $(".ck[data-k=ac]", body).textContent = !fresh && cur !== "0" ? "C" : "AC";
  $$(".ck.op", body).forEach((b) => b.classList.toggle("on", b.dataset.k === op && fresh));
}

addEventListener("keydown", (e) => {
  if (os.focused() !== "calc" || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.activeElement?.matches("input, textarea")) return;
  const map = { "+": "+", "-": "−", "*": "×", "x": "×", "/": "÷", "Enter": "=", "=": "=", "Escape": "ac", "Backspace": "back", "%": "pct", ".": ".", ",": "." };
  const k = /^[0-9]$/.test(e.key) ? e.key : map[e.key];
  if (!k) return;
  e.preventDefault();
  press(k);
  const b = body && $(`.ck[data-k="${k}"]`, body);
  if (b) { b.classList.add("hit"); setTimeout(() => b.classList.remove("hit"), 120); }
});
