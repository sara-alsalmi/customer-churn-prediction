// Shared state + a tiny event bus.
export const state = {
  employee: "",
  config: null,
  call: null,        // {id, customer, opening, score, hint, row, startedAt}
  timeline: [],      // scores during the current call
  lastReport: null,
  stats: { calls: 0, saved: 0, finals: [] },
  mail: [],
  reports: [],      // finished calls, newest first
};

const subs = {};
export const on = (ev, fn) => ((subs[ev] ||= []).push(fn), () => (subs[ev] = subs[ev].filter((f) => f !== fn)));
export const emit = (ev, data) => (subs[ev] || []).forEach((f) => f(data));
