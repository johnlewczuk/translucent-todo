import { writable } from "svelte/store";
import type { AppState } from "./storage";

export type Mode = "expanded" | "pill";

export const state = writable<AppState>({
  window: { x: 100, y: 100, w: 320, h: 420, mode: "expanded" },
  mini_mode_enabled: true,
  items: [],
});

export const mode = writable<Mode>("expanded");
export const focusedPath = writable<number[] | null>(null);
export const editingPath = writable<number[] | null>(null);
export const dragState = writable<{
  fromPath: number[];
  hoverPath: number[] | null;
  position: "before" | "after" | "child" | null;
} | null>(null);

export type ToastMessage = { text: string; id: number };
let toastSeq = 0;
export const toasts = writable<ToastMessage[]>([]);

export function showToast(text: string): void {
  const id = ++toastSeq;
  toasts.update((arr) => [...arr, { text, id }]);
  setTimeout(() => {
    toasts.update((arr) => arr.filter((t) => t.id !== id));
  }, 8000);
}
