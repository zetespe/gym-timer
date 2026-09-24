// Anonymous usage counts, sent to GoatCounter (https://gymmy.goatcounter.com).
//
// Each phone sends at most:
//   /app/day                  once per calendar day it is opened
//   /app/week                 once per ISO week
//   /app/month/new|returning  once per month; "returning" if it also counted last month
//   /app/install              once ever (first open with counting on)
// Adding up a period's count gives how many different phones used Gymmy in it,
// without any identifier: the phone only remembers which periods it already
// counted. No training data, no ID, no cookies. Users can switch it off in
// Plan → Settings (settings.usageCount). Offline opens are retried on the next
// open in the same period.
import { getState, patch } from "./store";

export const COUNT_URL = "https://gymmy.goatcounter.com/count";

const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const prevMonthKey = (d) => monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));

// ISO-8601 week, e.g. "2026-W39" (weeks start Monday; week 1 holds the first Thursday).
export function weekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
}

// Which counts are due, given what this phone already sent. Pure, for tests.
export function duePings(sent, now) {
  const s = sent || {};
  const due = [];
  if (!s.install) due.push({ key: "install", value: true, path: "/app/install", title: "First use" });
  const day = dayKey(now), week = weekKey(now), month = monthKey(now);
  if (s.day !== day) due.push({ key: "day", value: day, path: "/app/day", title: "Used today" });
  if (s.week !== week) due.push({ key: "week", value: week, path: "/app/week", title: "Used this week" });
  if (s.month !== month) {
    const back = s.month === prevMonthKey(now);
    due.push({ key: "month", value: month, path: back ? "/app/month/returning" : "/app/month/new", title: back ? "Used this month, also last month" : "Used this month, not last month" });
  }
  return due;
}

export function pingUrl(p) {
  return `${COUNT_URL}?p=${encodeURIComponent(p.path)}&t=${encodeURIComponent(p.title)}&e=true&rnd=${Math.random().toString(36).slice(2)}`;
}

function allowed() {
  if (import.meta.env.DEV) return false; // never count local development
  // Automated browsers (tests) never count, unless a test opts in and intercepts.
  if (typeof navigator !== "undefined" && navigator.webdriver && !window.__GYMMY_ALLOW_PINGS__) return false;
  return true;
}

let inFlight = false;
export async function maybeCountUsage(now = new Date()) {
  if (inFlight || !allowed()) return;
  const st = getState();
  if (st.settings.usageCount === false) return;
  const due = duePings(st.settings.usageSent, now);
  if (!due.length) return;
  inFlight = true;
  try {
    for (const p of due) {
      try {
        await fetch(pingUrl(p), { mode: "no-cors", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", keepalive: true });
      } catch {
        break; // offline: try again on the next open
      }
      patch((s) => { s.settings.usageSent = { ...(s.settings.usageSent || {}), [p.key]: p.value }; });
    }
  } finally {
    inFlight = false;
  }
}
