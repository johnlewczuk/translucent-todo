import { describe, it, expect } from "vitest";
import { buildAgenda } from "./agenda";
import type { Node } from "./tree";

// Fixed reference date: Monday, 2026-06-08 (matches dates.test.ts).
const MON = new Date(2026, 5, 8);

// Minimal Node factory for fixtures (real ids don't matter to buildAgenda).
function n(text: string, opts: Partial<Node> = {}): Node {
  return { id: text, text, done: false, collapsed: false, children: [], ...opts };
}

describe("buildAgenda", () => {
  it("returns all-empty groups for no items", () => {
    expect(buildAgenda([], MON)).toEqual({ overdue: [], today: [], upcoming: [] });
  });

  it("omits items with no due date", () => {
    const a = buildAgenda([n("no date"), n("dated", { due: "2026-06-09" })], MON);
    expect(a.overdue.length + a.today.length).toBe(0);
    expect(a.upcoming.map((e) => e.node.text)).toEqual(["dated"]);
  });

  it("classifies into overdue / today / upcoming", () => {
    const a = buildAgenda(
      [
        n("past", { due: "2026-06-07" }),
        n("now", { due: "2026-06-08" }),
        n("soon", { due: "2026-06-10" }),
      ],
      MON,
    );
    expect(a.overdue.map((e) => e.node.text)).toEqual(["past"]);
    expect(a.today.map((e) => e.node.text)).toEqual(["now"]);
    expect(a.upcoming.map((e) => e.node.text)).toEqual(["soon"]);
  });

  it("sorts within a group soonest-first, tie-breaking by text", () => {
    const a = buildAgenda(
      [
        n("b", { due: "2026-06-12" }),
        n("a", { due: "2026-06-12" }),
        n("early", { due: "2026-06-09" }),
      ],
      MON,
    );
    expect(a.upcoming.map((e) => e.node.text)).toEqual(["early", "a", "b"]);
  });

  it("sinks done items to the bottom of their group", () => {
    const a = buildAgenda(
      [
        n("done-early", { due: "2026-06-09", done: true }),
        n("open-late", { due: "2026-06-20" }),
      ],
      MON,
    );
    expect(a.upcoming.map((e) => e.node.text)).toEqual(["open-late", "done-early"]);
  });

  it("collects dated descendants inside collapsed subtrees, with full paths", () => {
    const tree = [
      n("root", {
        collapsed: true,
        children: [n("child", { due: "2026-06-10" })],
      }),
    ];
    const a = buildAgenda(tree, MON);
    expect(a.upcoming.map((e) => e.node.text)).toEqual(["child"]);
    expect(a.upcoming[0].path).toEqual([0, 0]);
  });

  it("includes a dated header in its group, with its path", () => {
    const a = buildAgenda(
      [n("milestone", { is_header: true, due: "2026-06-10" })],
      MON,
    );
    expect(a.upcoming.map((e) => e.node.text)).toEqual(["milestone"]);
    expect(a.upcoming[0].node.is_header).toBe(true);
    expect(a.upcoming[0].path).toEqual([0]);
  });

  it("places a done overdue item in the overdue group", () => {
    // The chip-tint suppression for done items is the view's concern, but the
    // entry must still classify by its date so it appears under Overdue.
    const a = buildAgenda([n("late-but-done", { due: "2026-06-07", done: true })], MON);
    expect(a.overdue.map((e) => e.node.text)).toEqual(["late-but-done"]);
  });
});
