import { describe, it, expect } from "vitest";
import { parseDate, dueLabel, dueStatus } from "./dates";

// Fixed reference date for deterministic tests: Monday, 2026-06-08.
const MON = new Date(2026, 5, 8);

describe("parseDate", () => {
  it("accepts a valid ISO date", () => {
    expect(parseDate("2026-06-10", MON)).toBe("2026-06-10");
  });

  it("rejects an out-of-range ISO date", () => {
    expect(parseDate("2026-13-40", MON)).toBeNull();
  });

  it("rejects gibberish", () => {
    expect(parseDate("not-a-date", MON)).toBeNull();
  });

  it("returns null for empty / whitespace", () => {
    expect(parseDate("", MON)).toBeNull();
    expect(parseDate("   ", MON)).toBeNull();
  });

  it("parses 'today'", () => {
    expect(parseDate("today", MON)).toBe("2026-06-08");
  });

  it("parses 'tomorrow'", () => {
    expect(parseDate("tomorrow", MON)).toBe("2026-06-09");
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(parseDate("  ToDay ", MON)).toBe("2026-06-08");
  });

  it("parses a weekday abbreviation to its next occurrence", () => {
    expect(parseDate("fri", MON)).toBe("2026-06-12");
    expect(parseDate("wed", MON)).toBe("2026-06-10");
  });

  it("parses a full weekday name", () => {
    expect(parseDate("friday", MON)).toBe("2026-06-12");
  });

  it("rolls a weekday forward 7 days when today is that weekday", () => {
    expect(parseDate("mon", MON)).toBe("2026-06-15");
  });

  it("parses 'Mon DD' for a date later this year", () => {
    expect(parseDate("Jun 19", MON)).toBe("2026-06-19");
    expect(parseDate("Dec 25", MON)).toBe("2026-12-25");
  });

  it("rolls 'Mon DD' to next year when it has already passed this year", () => {
    expect(parseDate("Jun 5", MON)).toBe("2027-06-05");
    expect(parseDate("Feb 3", MON)).toBe("2027-02-03");
  });

  it("treats today's month/day as today (on-or-after)", () => {
    expect(parseDate("Jun 8", MON)).toBe("2026-06-08");
  });

  it("accepts full month names and is case-insensitive", () => {
    expect(parseDate("december 25", MON)).toBe("2026-12-25");
    expect(parseDate("FEB 3", MON)).toBe("2027-02-03");
  });

  it("accepts day-then-month order", () => {
    expect(parseDate("19 Jun", MON)).toBe("2026-06-19");
  });

  it("rejects an invalid day for the month", () => {
    expect(parseDate("Jun 32", MON)).toBeNull();
    expect(parseDate("Feb 30", MON)).toBeNull();
  });

  it("rejects a month name with no day", () => {
    expect(parseDate("Jun", MON)).toBeNull();
  });
});

describe("dueStatus", () => {
  it("flags a past date as overdue", () => {
    expect(dueStatus("2026-06-07", MON)).toBe("overdue");
  });

  it("flags the current date as today", () => {
    expect(dueStatus("2026-06-08", MON)).toBe("today");
  });

  it("flags a future date as upcoming", () => {
    expect(dueStatus("2026-06-09", MON)).toBe("upcoming");
  });
});

describe("dueLabel", () => {
  it("labels the current date 'Today'", () => {
    expect(dueLabel("2026-06-08", MON)).toBe("Today");
  });

  it("labels the next day 'Tomorrow'", () => {
    expect(dueLabel("2026-06-09", MON)).toBe("Tomorrow");
  });

  it("labels other dates as 'MMM D'", () => {
    expect(dueLabel("2026-06-12", MON)).toBe("Jun 12");
    expect(dueLabel("2026-12-01", MON)).toBe("Dec 1");
  });
});
