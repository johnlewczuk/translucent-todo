import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./main";
import { writeState } from "./store";

let dir: string;
let file: string;
let out: string[];
let err: string[];
const io = () => ({ out: (s: string) => out.push(s), err: (s: string) => err.push(s) });
const items = () => JSON.parse(readFileSync(file, "utf8")).items;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "todo-main-"));
  file = join(dir, "todos.json");
  out = [];
  err = [];
  writeState(file, {
    window: { x: 0, y: 0, w: 320, h: 420, mode: "expanded" },
    mini_mode_enabled: true,
    items: [],
  });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("main", () => {
  it("persists a mutating command and prints its output", () => {
    expect(main(["add", "buy milk"], io(), file)).toBe(0);
    expect(items().map((n: { text: string }) => n.text)).toEqual(["buy milk"]);
    expect(out[0]).toMatch(/^[0-9a-f]{6}  \[ \] buy milk$/);
  });

  it("undo reverts the last command", () => {
    main(["add", "buy milk"], io(), file);
    expect(main(["undo"], io(), file)).toBe(0);
    expect(items()).toEqual([]);
  });

  it("does not rewrite the file for read-only commands", () => {
    main(["ls"], io(), file);
    expect(existsSync(file + ".prev")).toBe(false);
  });

  it("reports user errors on stderr with exit code 1 and writes nothing", () => {
    expect(main(["rm", "zzzzzz"], io(), file)).toBe(1);
    expect(err[0]).toMatch(/^todo: no item with id "zzzzzz"/);
    expect(existsSync(file + ".prev")).toBe(false);
  });

  it("explains a missing data directory instead of crashing", () => {
    const missing = join(dir, "never-created", "todos.json");
    expect(main(["ls"], io(), missing)).toBe(1);
    expect(err[0]).toMatch(/open translucent-todo once/);
  });

  it("prints usage for help even with no data file", () => {
    expect(main(["help"], io(), join(dir, "missing.json"))).toBe(0);
    expect(out[0]).toMatch(/^usage: todo/);
  });
});
