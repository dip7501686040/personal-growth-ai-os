/**
 * Date/number formatting with a **pinned** locale.
 *
 * A bare `toLocaleString()` renders in the runtime's locale — Node's on the
 * server, the viewer's in the browser — so the SSR HTML and the hydrated
 * client disagree (e.g. `9/3/2026` vs `3/9/2026`) and React throws a
 * hydration mismatch. Formatting through these fixed `en-US` formatters keeps
 * both sides identical. Use them in any `"use client"` component that renders
 * a date or a grouped number during SSR.
 */

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "medium",
});
const DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const TIME = new Intl.DateTimeFormat("en-US", { timeStyle: "medium" });
const HM = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
});
const NUM = new Intl.NumberFormat("en-US");

type DateInput = Date | string | number;

const toDate = (v: DateInput): Date => (v instanceof Date ? v : new Date(v));

/** e.g. "Sep 3, 2026, 8:12:28 AM" */
export const fmtDateTime = (v: DateInput): string => DATE_TIME.format(toDate(v));

/** e.g. "Sep 3, 2026" */
export const fmtDate = (v: DateInput): string => DATE.format(toDate(v));

/** e.g. "8:12:28 AM" */
export const fmtTime = (v: DateInput): string => TIME.format(toDate(v));

/** e.g. "08:12 AM" */
export const fmtHm = (v: DateInput): string => HM.format(toDate(v));

/** e.g. "1,234" */
export const fmtNum = (n: number): string => NUM.format(n);
