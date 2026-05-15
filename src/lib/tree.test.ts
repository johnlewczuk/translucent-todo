import { describe, it, expect } from "vitest";
import {
  newNode,
  serialize,
  deserialize,
  findParentAndIndex,
  addSiblingAfter,
  indent,
  outdent,
  deleteNode,
  toggleDone,
  toggleCollapsed,
  setText,
  type Node,
} from "./tree";

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

describe("findParentAndIndex", () => {
  it("finds at root level", () => {
    const items = [newNode("a"), newNode("b")];
    const [parent, idx] = findParentAndIndex(items, [1]);
    expect(parent).toBe(items);
    expect(idx).toBe(1);
  });

  it("finds nested", () => {
    const items = [newNode("a")];
    items[0].children.push(newNode("a.0"));
    items[0].children.push(newNode("a.1"));
    const [parent, idx] = findParentAndIndex(items, [0, 1]);
    expect(parent).toBe(items[0].children);
    expect(idx).toBe(1);
  });
});

describe("addSiblingAfter", () => {
  it("at root", () => {
    const items = [newNode("a")];
    const path = addSiblingAfter(items, [0], "b");
    expect(items.length).toBe(2);
    expect(items[1].text).toBe("b");
    expect(path).toEqual([1]);
  });

  it("nested", () => {
    const items = [newNode("a")];
    items[0].children.push(newNode("a.0"));
    const path = addSiblingAfter(items, [0, 0], "a.1");
    expect(items[0].children.length).toBe(2);
    expect(items[0].children[1].text).toBe("a.1");
    expect(path).toEqual([0, 1]);
  });
});

describe("indent", () => {
  it("with previous sibling", () => {
    const items = [newNode("a"), newNode("b")];
    const path = indent(items, [1]);
    expect(path).toEqual([0, 0]);
    expect(items.length).toBe(1);
    expect(items[0].children[0].text).toBe("b");
  });

  it("no previous sibling returns null", () => {
    const items = [newNode("a")];
    expect(indent(items, [0])).toBeNull();
    expect(items.length).toBe(1);
  });

  it("preserves subtree and collapsed state", () => {
    const items = [newNode("a"), newNode("b")];
    items[1].collapsed = true;
    items[1].children.push(newNode("b.0"));
    indent(items, [1]);
    const moved = items[0].children[0];
    expect(moved.text).toBe("b");
    expect(moved.collapsed).toBe(true);
    expect(moved.children[0].text).toBe("b.0");
  });

  it("auto-expands new parent", () => {
    const items = [newNode("a"), newNode("b")];
    items[0].collapsed = true;
    indent(items, [1]);
    expect(items[0].collapsed).toBe(false);
  });
});

describe("outdent", () => {
  it("one level", () => {
    const items = [newNode("a")];
    items[0].children.push(newNode("a.0"));
    const path = outdent(items, [0, 0]);
    expect(path).toEqual([1]);
    expect(items[0].children).toEqual([]);
    expect(items[1].text).toBe("a.0");
  });

  it("at root returns null", () => {
    const items = [newNode("a")];
    expect(outdent(items, [0])).toBeNull();
    expect(items.length).toBe(1);
  });

  it("preserves subtree", () => {
    const items = [newNode("a")];
    items[0].children.push(newNode("a.0"));
    items[0].children[0].children.push(newNode("a.0.0"));
    outdent(items, [0, 0]);
    expect(items[1].children[0].text).toBe("a.0.0");
  });

  it("inserts after parent, not at end", () => {
    const items = [newNode("a"), newNode("b")];
    items[0].children.push(newNode("a.0"));
    outdent(items, [0, 0]);
    expect(items.map(n => n.text)).toEqual(["a", "a.0", "b"]);
  });
});

describe("deleteNode", () => {
  it("removes node and subtree", () => {
    const items = [newNode("a"), newNode("b")];
    items[0].children.push(newNode("a.0"));
    deleteNode(items, [0]);
    expect(items.length).toBe(1);
    expect(items[0].text).toBe("b");
  });

  it("returns path to previous sibling", () => {
    const items = [newNode("a"), newNode("b")];
    expect(deleteNode(items, [1])).toEqual([0]);
  });

  it("returns parent path when deleting first child", () => {
    const items = [newNode("a")];
    items[0].children.push(newNode("a.0"));
    expect(deleteNode(items, [0, 0])).toEqual([0]);
  });

  it("returns null when last root item deleted", () => {
    const items = [newNode("a")];
    expect(deleteNode(items, [0])).toBeNull();
    expect(items).toEqual([]);
  });
});

describe("toggleDone", () => {
  it("flips done", () => {
    const items = [newNode("a")];
    toggleDone(items, [0]);
    expect(items[0].done).toBe(true);
    toggleDone(items, [0]);
    expect(items[0].done).toBe(false);
  });
});

describe("toggleCollapsed", () => {
  it("flips collapsed", () => {
    const items = [newNode("a")];
    toggleCollapsed(items, [0]);
    expect(items[0].collapsed).toBe(true);
  });
});

describe("setText", () => {
  it("renames node", () => {
    const items = [newNode("a")];
    setText(items, [0], "renamed");
    expect(items[0].text).toBe("renamed");
  });
});

import { moveNode } from "./tree";

describe("moveNode", () => {
  it("moves before target at root", () => {
    const items = [newNode("a"), newNode("b"), newNode("c")];
    const path = moveNode(items, [2], [0], "before");
    expect(items.map(n => n.text)).toEqual(["c", "a", "b"]);
    expect(path).toEqual([0]);
  });

  it("moves after target at root", () => {
    const items = [newNode("a"), newNode("b"), newNode("c")];
    const path = moveNode(items, [0], [2], "after");
    expect(items.map(n => n.text)).toEqual(["b", "c", "a"]);
    expect(path).toEqual([2]);
  });

  it("moves as last child of target", () => {
    const items = [newNode("a"), newNode("b")];
    const path = moveNode(items, [1], [0], "child");
    expect(items.length).toBe(1);
    expect(items[0].children[0].text).toBe("b");
    expect(path).toEqual([0, 0]);
  });

  it("auto-expands target when dropping as child", () => {
    const items = [newNode("a"), newNode("b")];
    items[0].collapsed = true;
    moveNode(items, [1], [0], "child");
    expect(items[0].collapsed).toBe(false);
  });

  it("returns original path when target is descendant of source (cycle)", () => {
    const items = [newNode("a")];
    items[0].children.push(newNode("a.0"));
    items[0].children[0].children.push(newNode("a.0.0"));
    const path = moveNode(items, [0], [0, 0], "child");
    expect(path).toEqual([0]);
    expect(items[0].text).toBe("a");
  });

  it("returns fromPath when from == to", () => {
    const items = [newNode("a"), newNode("b")];
    const path = moveNode(items, [0], [0], "before");
    expect(path).toEqual([0]);
    expect(items.map(n => n.text)).toEqual(["a", "b"]);
  });

  it("preserves subtree when moving", () => {
    const items = [newNode("a"), newNode("b")];
    items[1].children.push(newNode("b.0"));
    moveNode(items, [1], [0], "after");
    expect(items[1].text).toBe("b");
    expect(items[1].children[0].text).toBe("b.0");
  });
});
