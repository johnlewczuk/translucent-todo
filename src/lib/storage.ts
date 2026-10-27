import { invoke } from "@tauri-apps/api/core";
import type { Node } from "./tree";

export type AppState = {
  window: {
    x: number;
    y: number;
    w: number;
    h: number;
    mode: "expanded" | "pill";
  };
  mini_mode_enabled: boolean;
  font_size?: number;
  items: Node[];
};

export async function loadState(): Promise<AppState> {
  return invoke<AppState>("load_state");
}

export async function saveState(state: AppState): Promise<void> {
  return invoke<void>("save_state", { state });
}

// Prefix of the backend's error when todos.json changed under the app (the
// `todo` CLI) since it was last loaded; see StorageError::Conflict.
const CONFLICT = "conflict:";

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: AppState | null = null;
let inFlight = false;
let conflictHandler: (() => void) | null = null;

/** Called when a save is refused because the file changed underneath us. */
export function onSaveConflict(fn: (() => void) | null): void {
  conflictHandler = fn;
}

/** Drop a scheduled-but-unsent save. Returns whether there was one. */
export function discardPendingSave(): boolean {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = null;
  const had = pendingState !== null;
  pendingState = null;
  return had;
}

export function scheduleSave(state: AppState, delayMs: number = 250): void {
  pendingState = state;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (inFlight || pendingState === null) return;
    const toSave = pendingState;
    pendingState = null;
    inFlight = true;
    try {
      await saveState(toSave);
    } catch (e) {
      if (String(e).startsWith(CONFLICT)) conflictHandler?.();
      else console.error("[translucent-todo] save failed:", e);
    } finally {
      inFlight = false;
      if (pendingState !== null) scheduleSave(pendingState, delayMs);
    }
  }, delayMs);
}
