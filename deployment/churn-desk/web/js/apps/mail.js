// «البريد»: messages from the team lead.
import { $, esc, clock } from "../util.js";
import * as os from "../os.js";
import { state } from "../state.js";

let body = null;

export function addMail(m) {
  state.mail.unshift({ ...m, time: clock(), unread: true });
  badge();
  render();
}

function badge() {
  const b = $("#mailBadge");
  const u = state.mail.filter((m) => m.unread).length;
  b.textContent = new Intl.NumberFormat("ar-SA").format(u);
  b.classList.toggle("hide", u === 0);
}

export function openMail() {
  return os.open("mail", {
    title: "البريد",
    width: 460, height: 520,
    render(b) {
      body = b;
      render();
      setTimeout(() => { state.mail.forEach((m) => (m.unread = false)); badge(); }, 1800);
    },
    onClose: () => { body = null; },
  });
}

function render() {
  if (!body) return;
  body.innerHTML = `<div class="mail">${state.mail.map((m) => `
    <div class="mail-item ${m.unread ? "unread" : ""}">
      <div class="av">${esc(m.from[0])}</div>
      <div>
        <div class="hd"><b>${esc(m.from)}</b><span>${esc(m.time)}</span></div>
        <h4>${esc(m.subject)}</h4>
        <p>${esc(m.text)}</p>
      </div>
    </div>`).join("")}</div>`;
}
