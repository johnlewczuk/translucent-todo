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
