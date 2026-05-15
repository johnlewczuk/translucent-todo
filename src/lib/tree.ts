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
