import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readState, writeState, undo, withLock } from "./store";
import type { AppState } from "../src/lib/storage";

const STATE: AppState = {
  window: { x: 0, y: 0, w: 320, h: 420, mode: "expanded" },
  mini_mode_enabled: true,
  items: [{ id: "aaaaaa", text: "a", done: false, collapsed: false, children: [] }],
};

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "todo-store-"));
  file = join(dir, "todos.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("readState / writeState", () => {
  it("round-trips", () => {
    writeState(file, STATE);
    expect(readState(file)).toEqual(STATE);
  });

  it("leaves no temp file behind", () => {
    writeState(file, STATE);
    expect(existsSync(file + ".tmp")).toBe(false);
  });

  it("reading a missing file explains how to create it", () => {
    expect(() => readState(file)).toThrow(/open translucent-todo once/);
  });

  it("reading a corrupt file refuses rather than guessing", () => {
    writeFileSync(file, "{nope");
    expect(() => readState(file)).toThrow(/not valid JSON/);
  });
});

describe("undo", () => {
  it("restores the state from before the last write", () => {
    writeState(file, STATE);
    writeState(file, { ...STATE, items: [] });
    undo(file);
    expect(readState(file)).toEqual(STATE);
  });

  it("is one level deep", () => {
    writeState(file, STATE);
    writeState(file, { ...STATE, items: [] });
    undo(file);
    expect(() => undo(file)).toThrow(/nothing to undo/);
  });

  it("with no history says there is nothing to undo", () => {
    expect(() => undo(file)).toThrow(/nothing to undo/);
  });
});

describe("withLock", () => {
  it("runs the function and releases the lock", () => {
    expect(withLock(file, () => 42)).toBe(42);
    expect(existsSync(file + ".lock")).toBe(false);
  });

  it("releases the lock when the function throws", () => {
    expect(() => withLock(file, () => { throw new Error("boom"); })).toThrow("boom");
    expect(existsSync(file + ".lock")).toBe(false);
  });

  it("times out while another holder has a fresh lock", () => {
    writeFileSync(file + ".lock", "");
    expect(() => withLock(file, () => 1, { timeoutMs: 50 })).toThrow(/locked/);
  });

  it("breaks a stale lock", () => {
    writeFileSync(file + ".lock", "");
    const old = new Date(Date.now() - 60_000);
    utimesSync(file + ".lock", old, old);
    expect(withLock(file, () => readFileSync(file + ".lock", "utf8") !== undefined)).toBe(true);
  });
});
