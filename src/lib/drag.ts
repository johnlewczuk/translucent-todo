import { get } from "svelte/store";
import { state, dragState } from "./stores";
import { scheduleSave } from "./storage";
import { moveNode, type Node } from "./tree";

let autoExpandTimer: ReturnType<typeof setTimeout> | null = null;

export function startDrag(fromPath: number[]): void {
  dragState.set({ fromPath, hoverPath: null, position: null });
}

export function updateHover(
  hoverPath: number[],
  position: "before" | "after" | "child",
  hoveredNode: Node,
): void {
  const cur = get(dragState);
  if (!cur) return;
  // Cycle prevention
  if (
    hoverPath.length > cur.fromPath.length &&
    cur.fromPath.every((v, i) => v === hoverPath[i])
  ) {
    dragState.set({ ...cur, hoverPath: null, position: null });
    return;
  }
  dragState.set({ ...cur, hoverPath, position });

  if (position === "child" && hoveredNode.collapsed) {
    if (autoExpandTimer !== null) clearTimeout(autoExpandTimer);
    autoExpandTimer = setTimeout(() => {
      state.update((s) => {
        let cur2: Node[] = s.items;
        let n: Node | null = null;
        for (const idx of hoverPath) {
          n = cur2[idx];
          cur2 = n.children;
        }
        if (n) n.collapsed = false;
        return s;
      });
    }, 400);
  } else {
    if (autoExpandTimer !== null) {
      clearTimeout(autoExpandTimer);
      autoExpandTimer = null;
    }
  }
}

export function endDrag(commit: boolean): void {
  const cur = get(dragState);
  if (autoExpandTimer !== null) {
    clearTimeout(autoExpandTimer);
    autoExpandTimer = null;
  }
  if (commit && cur && cur.hoverPath !== null && cur.position !== null) {
    state.update((s) => {
      moveNode(s.items, cur.fromPath, cur.hoverPath!, cur.position!);
      scheduleSave(s);
      return s;
    });
  }
  dragState.set(null);
}
