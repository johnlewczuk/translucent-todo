import { describe, it, expect } from "vitest";
import { newNode, serialize, deserialize, type Node } from "./tree";

describe("newNode", () => {
  it("has required fields", () => {
    const n = newNode("buy milk");
    expect(n.text).toBe("buy milk");
    expect(n.done).toBe(false);
    expect(n.collapsed).toBe(false);
    expect(n.children).toEqual([]);
    expect(n.id).toMatch(/^[0-9a-f]{6}$/);
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newNode("x").id));
    expect(ids.size).toBe(1000);
  });
});

describe("serialize/deserialize", () => {
  it("round-trips a nested tree", () => {
    const a = newNode("root");
    a.children.push(newNode("child"));
    a.children[0].children.push(newNode("grandchild"));
    const s = serialize([a]);
    expect(JSON.parse(s)).toBeTruthy();
    expect(deserialize(s)).toEqual([a]);
  });

  it("deserialize('') returns []", () => {
    expect(deserialize("")).toEqual([]);
  });
});
