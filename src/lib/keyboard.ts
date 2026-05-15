import { get } from "svelte/store";
import { state, focusedPath, editingPath, mode } from "./stores";
import { scheduleSave } from "./storage";
import {
  addSiblingAfter,
  indent,
  outdent,
  deleteNode,
  toggleDone,
  newNode,
  type Node,
} from "./tree";

function flattenPaths(items: Node[], prefix: number[] = []): number[][] {
  const out: number[][] = [];
  items.forEach((n, i) => {
    const p = [...prefix, i];
    out.push(p);
    if (!n.collapsed && n.children.length > 0) {
      out.push(...flattenPaths(n.children, p));
    }
  });
  return out;
}

function moveFocus(delta: -1 | 1): void {
  const s = get(state);
  const paths = flattenPaths(s.items);
  if (paths.length === 0) return;
  const cur = get(focusedPath);
  const curIdx = cur === null
    ? -1
    : paths.findIndex((p) => p.length === cur.length && p.every((v, i) => v === cur[i]));
  const nextIdx = Math.max(0, Math.min(paths.length - 1, curIdx + delta));
  focusedPath.set(paths[nextIdx]);
}

export function installKeyboardHandler(): () => void {
  function handler(e: KeyboardEvent) {
    if (get(editingPath) !== null) return;

    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      return;
    }

    const path = get(focusedPath);

    if (e.key === "m" && e.ctrlKey) {
      e.preventDefault();
      mode.update((m) => (m === "expanded" ? "pill" : "expanded"));
      state.update((s) => {
        s.window.mode = get(mode);
        scheduleSave(s);
        return s;
      });
      return;
    }

    // Enter on empty state creates the first row and enters edit mode
    if (path === null) {
      if (e.key === "Enter") {
        e.preventDefault();
        state.update((s) => {
          if (s.items.length === 0) {
            s.items.push(newNode(""));
            focusedPath.set([0]);
            editingPath.set([0]);
          } else {
            focusedPath.set([0]);
            editingPath.set([0]);
          }
          scheduleSave(s);
          return s;
        });
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      state.update((s) => {
        const np = addSiblingAfter(s.items, path);
        focusedPath.set(np);
        editingPath.set(np);
        scheduleSave(s);
        return s;
      });
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      state.update((s) => {
        const np = indent(s.items, path);
        if (np !== null) focusedPath.set(np);
        scheduleSave(s);
        return s;
      });
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      state.update((s) => {
        const np = outdent(s.items, path);
        if (np !== null) focusedPath.set(np);
        scheduleSave(s);
        return s;
      });
    } else if (e.key === " ") {
      e.preventDefault();
      state.update((s) => {
        toggleDone(s.items, path);
        scheduleSave(s);
        return s;
      });
    } else if (e.key === "Delete") {
      e.preventDefault();
      state.update((s) => {
        const np = deleteNode(s.items, path);
        focusedPath.set(np);
        scheduleSave(s);
        return s;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(1);
    }
  }

  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
