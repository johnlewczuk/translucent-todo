import { get } from "svelte/store";
import { tick } from "svelte";
import { invoke } from "@tauri-apps/api/core";
import { state, focusedPath, editingPath, mode, helpOpen } from "./stores";
import { scheduleSave } from "./storage";
import {
  addSiblingAfter,
  indent,
  outdent,
  deleteNode,
  toggleDone,
  setText,
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
    // Esc closes the help overlay even if nothing else is focused
    if (get(helpOpen)) {
      if (e.key === "Escape") {
        e.preventDefault();
        helpOpen.set(false);
      }
      return;
    }

    const target = e.target as HTMLElement | null;
    const inInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");

    // Tab and Shift+Tab work in BOTH edit and non-edit mode. If editing,
    // we save the input's current value and indent/outdent the row WITHOUT
    // leaving edit mode — the user keeps typing in the same input.
    const isTab = e.key === "Tab" || e.code === "Tab" || e.key === "ISO_Left_Tab";
    if (isTab) {
      e.preventDefault();
      const isShift =
        e.shiftKey ||
        e.getModifierState?.("Shift") ||
        e.key === "ISO_Left_Tab";

      const editPath = get(editingPath);
      const wasEditing = editPath !== null;
      const draftValue = wasEditing && inInput
        ? (target as HTMLInputElement).value
        : null;

      const fp = get(focusedPath);
      if (fp) {
        state.update((s) => {
          if (wasEditing && draftValue !== null && editPath) {
            setText(s.items, editPath, draftValue);
          }
          const np = isShift ? outdent(s.items, fp) : indent(s.items, fp);
          if (np !== null) {
            focusedPath.set(np);
            // Carry the edit cursor with the moved row so the user keeps typing
            if (wasEditing) editingPath.set(np);
          }
          scheduleSave(s);
          return s;
        });

        // Re-assert focus on next tick in case Svelte remounted the input
        if (wasEditing) {
          tick().then(() => {
            const inp = document.querySelector("input.edit") as HTMLInputElement | null;
            if (inp && document.activeElement !== inp) {
              inp.focus();
              // place caret at end so typing continues naturally
              const len = inp.value.length;
              try { inp.setSelectionRange(len, len); } catch {}
            }
          });
        }
      }
      return;
    }

    // For other keys, defer to the input itself while editing.
    if (get(editingPath) !== null) return;
    if (inInput) return;

    if ((e.key === "h" || e.key === "H" || e.key === "?") && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      helpOpen.set(true);
      return;
    }

    // Font size: Ctrl+= (or Ctrl++) / Ctrl+- / Ctrl+0 to reset
    if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      state.update((s) => {
        const cur = s.font_size ?? 13;
        s.font_size = Math.min(22, cur + 1);
        scheduleSave(s);
        return s;
      });
      return;
    }
    if (e.ctrlKey && e.key === "-") {
      e.preventDefault();
      state.update((s) => {
        const cur = s.font_size ?? 13;
        s.font_size = Math.max(10, cur - 1);
        scheduleSave(s);
        return s;
      });
      return;
    }
    if (e.ctrlKey && e.key === "0") {
      e.preventDefault();
      state.update((s) => {
        s.font_size = 13;
        scheduleSave(s);
        return s;
      });
      return;
    }

    const path = get(focusedPath);

    if (e.key === "m" && e.ctrlKey) {
      e.preventDefault();
      // Hide to the system tray (saves position so restore puts us back exactly).
      invoke("hide_to_tray");
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

  // Capture phase: see the event before any inner element can stop or
  // hijack it (some browsers/WMs do focus-navigation on Shift+Tab).
  window.addEventListener("keydown", handler, true);
  return () => window.removeEventListener("keydown", handler, true);
}
