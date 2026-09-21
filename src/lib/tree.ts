export type Node = {
  id: string;
  text: string;
  done: boolean;
  collapsed: boolean;
  is_header?: boolean;  // when true: no checkbox, header styling, lives at root depth
  due?: string;         // optional due date as ISO "YYYY-MM-DD"; absent when none
  color?: string;       // optional ROW_COLORS key tinting the text; absent = default fg
  children: Node[];
};

function randomId(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newNode(text: string = ""): Node {
  return {
    id: randomId(),
    text,
    done: false,
    collapsed: false,
    children: [],
  };
}

export function serialize(items: Node[]): string {
  return JSON.stringify(items, null, 2);
}

export function deserialize(s: string): Node[] {
  if (!s) return [];
  return JSON.parse(s) as Node[];
}

export function findParentAndIndex(
  items: Node[],
  path: number[],
): [Node[], number] {
  if (path.length === 0) throw new Error("path must be non-empty");
  let current: Node[] = items;
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]].children;
  }
  return [current, path[path.length - 1]];
}

export function addSiblingAfter(
  items: Node[],
  path: number[],
  text: string = "",
): number[] {
  const [parent, idx] = findParentAndIndex(items, path);
  parent.splice(idx + 1, 0, newNode(text));
  return [...path.slice(0, -1), idx + 1];
}

export function indent(items: Node[], path: number[]): number[] | null {
  const [parent, idx] = findParentAndIndex(items, path);
  if (idx === 0) return null;
  const [node] = parent.splice(idx, 1);
  const newParent = parent[idx - 1];
  newParent.collapsed = false;
  newParent.children.push(node);
  return [...path.slice(0, -1), idx - 1, newParent.children.length - 1];
}

export function outdent(items: Node[], path: number[]): number[] | null {
  if (path.length < 2) return null;
  const [parent, idx] = findParentAndIndex(items, path);
  const [grandparent, parentIdx] = findParentAndIndex(items, path.slice(0, -1));
  const [node] = parent.splice(idx, 1);
  grandparent.splice(parentIdx + 1, 0, node);
  return [...path.slice(0, -2), parentIdx + 1];
}

function getNode(items: Node[], path: number[]): Node {
  const [parent, idx] = findParentAndIndex(items, path);
  return parent[idx];
}

export function deleteNode(items: Node[], path: number[]): number[] | null {
  const [parent, idx] = findParentAndIndex(items, path);
  parent.splice(idx, 1);
  if (items.length === 0) return null;
  if (idx > 0) return [...path.slice(0, -1), idx - 1];
  if (parent.length > 0) return path;
  if (path.length >= 2) return path.slice(0, -1);
  return null;
}

export function toggleDone(items: Node[], path: number[]): void {
  const n = getNode(items, path);
  n.done = !n.done;
}

export function toggleCollapsed(items: Node[], path: number[]): void {
  const n = getNode(items, path);
  n.collapsed = !n.collapsed;
}

export function setText(items: Node[], path: number[], text: string): void {
  getNode(items, path).text = text;
}

export function setDue(items: Node[], path: number[], due: string | null): void {
  const n = getNode(items, path);
  if (due === null) {
    delete n.due;
  } else {
    n.due = due;
  }
}

/** Text tints a row can cycle through, in hue-wheel order. Pastel accents
 *  (Catppuccin Mocha) so they stay legible on the dark translucent glass and
 *  under the text-shadow halo. The key is what gets persisted, so hexes can
 *  be retuned without migrating saved state. */
export const ROW_COLORS: readonly { key: string; hex: string }[] = [
  { key: "red", hex: "#f38ba8" },
  { key: "peach", hex: "#fab387" },
  { key: "yellow", hex: "#f9e2af" },
  { key: "green", hex: "#a6e3a1" },
  { key: "sky", hex: "#89dceb" },
  { key: "blue", hex: "#89b4fa" },
  { key: "mauve", hex: "#cba6f7" },
];

export function rowColor(key: string | undefined): string | null {
  return ROW_COLORS.find((c) => c.key === key)?.hex ?? null;
}

/** Step the row's colour through [none, ...ROW_COLORS], wrapping both ways.
 *  An unrecognised stored key counts as "none". */
export function cycleColor(items: Node[], path: number[], delta: -1 | 1): void {
  const n = getNode(items, path);
  const slots = ROW_COLORS.length + 1;             // slot 0 = no colour
  const cur = ROW_COLORS.findIndex((c) => c.key === n.color) + 1;
  const next = (cur + delta + slots) % slots;
  if (next === 0) {
    delete n.color;
  } else {
    n.color = ROW_COLORS[next - 1].key;
  }
}

/** Un-collapse every ancestor along `path` so the target row will render.
 *  Leaves the target node's own `collapsed` flag untouched. */
export function expandAncestors(items: Node[], path: number[]): void {
  let cur: Node[] = items;
  for (let i = 0; i < path.length - 1; i++) {
    const node = cur[path[i]];
    if (!node) return;
    node.collapsed = false;
    cur = node.children;
  }
}

function isDescendant(items: Node[], ancestorPath: number[], maybeDescendant: number[]): boolean {
  if (maybeDescendant.length <= ancestorPath.length) return false;
  for (let i = 0; i < ancestorPath.length; i++) {
    if (ancestorPath[i] !== maybeDescendant[i]) return false;
  }
  return true;
}

function pathsEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function moveNode(
  items: Node[],
  fromPath: number[],
  toPath: number[],
  position: "before" | "after" | "child",
): number[] {
  if (pathsEqual(fromPath, toPath)) return fromPath;
  if (isDescendant(items, fromPath, toPath)) return fromPath;

  // 1. Detach the source node
  const [fromParent, fromIdx] = findParentAndIndex(items, fromPath);
  const [node] = fromParent.splice(fromIdx, 1);

  // 2. Adjust toPath if the removal shifted indices at the level fromPath
  //    was operating on.
  const adjustedToPath = [...toPath];
  for (let i = 0; i < adjustedToPath.length; i++) {
    const prefix = fromPath.slice(0, i);
    const sharesPrefix = prefix.every((v, j) => v === adjustedToPath[j]);
    if (sharesPrefix && i === fromPath.length - 1 && adjustedToPath[i] > fromIdx) {
      adjustedToPath[i] -= 1;
    }
  }

  // 3. Insert
  if (position === "child") {
    let cur: Node[] = items;
    let target: Node | null = null;
    for (const idx of adjustedToPath) {
      target = cur[idx];
      cur = target.children;
    }
    target!.collapsed = false;
    target!.children.push(node);
    return [...adjustedToPath, target!.children.length - 1];
  }

  const [toParent, toIdx] = findParentAndIndex(items, adjustedToPath);
  const insertAt = position === "before" ? toIdx : toIdx + 1;
  toParent.splice(insertAt, 0, node);
  return [...adjustedToPath.slice(0, -1), insertAt];
}
