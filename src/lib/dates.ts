// Pure date helpers for the optional due-date feature. Everything works in
// terms of local calendar dates as ISO "YYYY-MM-DD" strings, and takes the
// reference "today" as an argument so the logic stays deterministic and
// testable (no hidden `new Date()`).

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Month index (0 = January) keyed by full name + common abbreviation.
const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

// getDay() index (0 = Sunday) keyed by name + 3-letter abbreviation.
const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/** Format a Date as a local "YYYY-MM-DD" string. */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** A new Date offset from `base` by `days`, at local midnight. */
function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

/**
 * Parse user input into an ISO "YYYY-MM-DD" string, or null if unparseable.
 * Accepts: ISO dates, "today", "tomorrow", and weekday names/abbreviations
 * (resolving to the next occurrence strictly after `today`).
 */
export function parseDate(input: string, today: Date = new Date()): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const [, y, m, d] = iso.map(Number);
    const dt = new Date(y, m - 1, d);
    // Reject overflow (e.g. 2026-13-40 rolls into another month/year).
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return toISODate(dt);
    }
    return null;
  }

  if (s === "today") return toISODate(today);
  if (s === "tomorrow") return toISODate(addDays(today, 1));

  if (s in WEEKDAYS) {
    const target = WEEKDAYS[s];
    let delta = (target - today.getDay() + 7) % 7;
    if (delta === 0) delta = 7; // "mon" on a Monday means next Monday
    return toISODate(addDays(today, delta));
  }

  // "Mon DD" / "Mon. DD" / "DD Mon" — month name + day-of-month, no year.
  // Resolves to the next occurrence on or after today.
  const md = /^([a-z]+)\.?\s+(\d{1,2})$/.exec(s) ?? flip(/^(\d{1,2})\s+([a-z]+)\.?$/.exec(s));
  if (md && md[1] in MONTH_NAMES) {
    const month = MONTH_NAMES[md[1]];
    const day = Number(md[2]);
    // Try this year first; if that date has already passed, roll to next year.
    for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
      const dt = new Date(year, month, day);
      // Reject impossible days: Date overflows them into the next month.
      if (dt.getMonth() !== month || dt.getDate() !== day) return null;
      if (toISODate(dt) >= toISODate(today)) return toISODate(dt);
    }
  }

  return null;
}

// Normalize a "DD Mon" regex match into the same [_, name, day] shape as
// the "Mon DD" pattern, so both feed one code path.
function flip(m: RegExpExecArray | null): RegExpExecArray | null {
  if (!m) return null;
  const out = [m[0], m[2], m[1]] as unknown as RegExpExecArray;
  return out;
}

/** Classify an ISO due date relative to `today`. */
export function dueStatus(
  iso: string,
  today: Date = new Date(),
): "overdue" | "today" | "upcoming" {
  const t = toISODate(today);
  if (iso < t) return "overdue";
  if (iso === t) return "today";
  return "upcoming";
}

/** Friendly label: "Today", "Tomorrow", or "MMM D" (e.g. "Jun 12"). */
export function dueLabel(iso: string, today: Date = new Date()): string {
  if (iso === toISODate(today)) return "Today";
  if (iso === toISODate(addDays(today, 1))) return "Tomorrow";
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
