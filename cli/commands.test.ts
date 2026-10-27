import { describe, it, expect } from "vitest";
import { execute } from "./commands";
import type { AppState } from "../src/lib/storage";
import type { Node } from "../src/lib/tree";

// Fixed reference date: Monday, 2026-06-08 (matches dates.test.ts).
const MON = new Date(2026, 5, 8);

function n(id: string, text: string, opts: Partial<Node> = {}): Node {
  return { id, text, done: false, collapsed: false, children: [], ...opts };
}

// Work      (header)
//   a  write report   due 2026-06-07
//     a1 outline
//   b  email bob
// Home      (header)
//   c  groceries      done
function fixture(): AppState {
  return {
    window: { x: 0, y: 0, w: 320, h: 420, mode: "expanded" },
    mini_mode_enabled: true,
    items: [
      n("hwork0", "Work", { is_header: true }),
      n("aaaaaa", "write report", { due: "2026-06-07", children: [n("a1a1a1", "outline")] }),
      n("bbbbbb", "email bob", { color: "red" }),
      n("hhome0", "Home", { is_header: true }),
      n("cccccc", "groceries", { done: true }),
    ],
  };
}

function run(argv: string[], state: AppState = fixture()) {
  return { ...execute(argv, state, MON), state };
}

const texts = (nodes: Node[]) => nodes.map((x) => x.text);

describe("ls", () => {
  it("prints every node with id, marker, depth and attributes", () => {
    const { output, changed } = run(["ls"]);
    expect(changed).toBe(false);
    expect(output).toBe(
      [
        "hwork0  # Work",
        "aaaaaa  [ ] write report  due 2026-06-07 (overdue)",
        "a1a1a1    [ ] outline",
        "bbbbbb  [ ] email bob  red",
        "hhome0  # Home",
        "cccccc  [x] groceries",
      ].join("\n"),
    );
  });

  it("--open hides done items", () => {
    expect(run(["ls", "--open"]).output).not.toContain("groceries");
  });

  it("ID limits output to that subtree", () => {
    expect(run(["ls", "aaaaaa"]).output).toBe(
      ["aaaaaa  [ ] write report  due 2026-06-07 (overdue)", "a1a1a1    [ ] outline"].join("\n"),
    );
  });

  it("--json prints the raw nodes", () => {
    expect(JSON.parse(run(["ls", "--json"]).output)).toEqual(fixture().items);
  });

  it("says so when the list is empty", () => {
    const s = fixture();
    s.items = [];
    expect(run(["ls"], s).output).toBe("(no todos)");
  });
});

describe("agenda", () => {
  it("groups dated items by status", () => {
    const s = fixture();
    s.items[2].due = "2026-06-08";
    expect(run(["agenda"], s).output).toBe(
      [
        "Overdue",
        "  aaaaaa  [ ] write report  due 2026-06-07 (overdue)",
        "Today",
        "  bbbbbb  [ ] email bob  due 2026-06-08 (today)  red",
      ].join("\n"),
    );
  });

  it("says so when nothing is dated", () => {
    const s = fixture();
    delete s.items[1].due;
    expect(run(["agenda"], s).output).toBe("(nothing dated)");
  });
});

describe("add", () => {
  it("appends to the end of the root by default and prints the new row", () => {
    const { state, output, changed } = run(["add", "call", "mum"]);
    expect(changed).toBe(true);
    const added = state.items[state.items.length - 1];
    expect(added.text).toBe("call mum");
    expect(output).toBe(`${added.id}  [ ] call mum`);
  });

  it("--under appends as the last child and expands the parent", () => {
    const s = fixture();
    s.items[1].collapsed = true;
    run(["add", "draft", "--under", "aaaaaa"], s);
    expect(texts(s.items[1].children)).toEqual(["outline", "draft"]);
    expect(s.items[1].collapsed).toBe(false);
  });

  it("--before / --after place it beside a sibling", () => {
    const s = fixture();
    run(["add", "x", "--before", "bbbbbb"], s);
    run(["add", "y", "--after", "hhome0"], s);
    expect(texts(s.items)).toEqual(["Work", "write report", "x", "email bob", "Home", "y", "groceries"]);
  });

  it("applies --due, --color and --header", () => {
    const { state } = run(["add", "Errands", "--header", "--due", "fri", "--color", "green"]);
    const added = state.items[state.items.length - 1];
    expect(added).toMatchObject({ is_header: true, due: "2026-06-12", color: "green" });
  });

  it("rejects a nested header", () => {
    expect(() => run(["add", "x", "--header", "--under", "aaaaaa"])).toThrow(/root/);
  });

  it("rejects more than one placement flag", () => {
    expect(() => run(["add", "x", "--under", "aaaaaa", "--after", "bbbbbb"])).toThrow(/one of/);
  });

  it("requires text", () => {
    expect(() => run(["add"])).toThrow(/text/);
  });
});

describe("set", () => {
  it("--done / --open set completion on every id given", () => {
    const { state, changed } = run(["set", "aaaaaa", "bbbbbb", "--done"]);
    expect(changed).toBe(true);
    expect(state.items[1].done).toBe(true);
    expect(state.items[2].done).toBe(true);
    run(["set", "aaaaaa", "--open"], state);
    expect(state.items[1].done).toBe(false);
  });

  it("--text renames", () => {
    expect(run(["set", "bbbbbb", "--text", "email alice"]).state.items[2].text).toBe("email alice");
  });

  it("--due parses like the overlay, and 'none' clears it", () => {
    const { state } = run(["set", "bbbbbb", "--due", "tomorrow"]);
    expect(state.items[2].due).toBe("2026-06-09");
    run(["set", "bbbbbb", "--due", "none"], state);
    expect("due" in state.items[2]).toBe(false);
  });

  it("rejects an unparseable date", () => {
    expect(() => run(["set", "bbbbbb", "--due", "someday"])).toThrow(/can't parse date/);
  });

  it("--color none clears the colour", () => {
    expect("color" in run(["set", "bbbbbb", "--color", "none"]).state.items[2]).toBe(false);
  });

  it("--header / --no-header", () => {
    const { state } = run(["set", "bbbbbb", "--header"]);
    expect(state.items[2].is_header).toBe(true);
    run(["set", "hwork0", "--no-header"], state);
    expect("is_header" in state.items[0]).toBe(false);
  });

  it("prints the updated rows", () => {
    expect(run(["set", "bbbbbb", "--done"]).output).toBe("bbbbbb  [x] email bob  red");
  });

  it("rejects --text with several ids", () => {
    expect(() => run(["set", "aaaaaa", "bbbbbb", "--text", "x"])).toThrow(/one ID/);
  });

  it("rejects contradictory flags", () => {
    expect(() => run(["set", "aaaaaa", "--done", "--open"])).toThrow(/--done.*--open/);
  });

  it("requires a change", () => {
    expect(() => run(["set", "aaaaaa"])).toThrow(/nothing to change/);
  });

  it("rejects an unknown id without changing anything", () => {
    const s = fixture();
    expect(() => run(["set", "aaaaaa", "zzzzzz", "--done"], s)).toThrow(/no item with id "zzzzzz"/);
  });
});

describe("mv", () => {
  it("--under re-parents", () => {
    const { state } = run(["mv", "bbbbbb", "--under", "aaaaaa"]);
    expect(texts(state.items[1].children)).toEqual(["outline", "email bob"]);
  });

  it("--after moves beside a sibling", () => {
    const { state } = run(["mv", "aaaaaa", "--after", "hhome0"]);
    expect(texts(state.items)).toEqual(["Work", "email bob", "Home", "write report", "groceries"]);
  });

  it("rejects moving an item into its own subtree", () => {
    expect(() => run(["mv", "aaaaaa", "--under", "a1a1a1"])).toThrow(/into itself/);
  });

  it("rejects nesting a header", () => {
    expect(() => run(["mv", "hhome0", "--under", "aaaaaa"])).toThrow(/root/);
    expect(() => run(["mv", "hhome0", "--before", "a1a1a1"])).toThrow(/root/);
  });

  it("requires exactly one destination", () => {
    expect(() => run(["mv", "aaaaaa"])).toThrow(/one of/);
  });
});

describe("rm", () => {
  it("removes each subtree and reports it", () => {
    const { state, output } = run(["rm", "aaaaaa", "cccccc"]);
    expect(texts(state.items)).toEqual(["Work", "email bob", "Home"]);
    expect(output).toBe(
      ["removed aaaaaa  write report  (+1 nested)", "removed cccccc  groceries"].join("\n"),
    );
  });
});

describe("errors", () => {
  it("rejects an unknown command", () => {
    expect(() => run(["frobnicate"])).toThrow(/unknown command/);
  });

  it("rejects an unknown flag", () => {
    expect(() => run(["ls", "--bogus"])).toThrow();
  });
});
