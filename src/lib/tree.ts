export type Node = {
  id: string;
  text: string;
  done: boolean;
  collapsed: boolean;
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
