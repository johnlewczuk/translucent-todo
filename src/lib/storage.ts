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
  items: Node[];
};

export async function loadState(): Promise<AppState> {
  return invoke<AppState>("load_state");
}

export async function saveState(state: AppState): Promise<void> {
  return invoke<void>("save_state", { state });
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: AppState | null = null;
let inFlight = false;

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
      console.error("[translucent-todo] save failed:", e);
    } finally {
      inFlight = false;
      if (pendingState !== null) scheduleSave(pendingState, delayMs);
    }
  }, delayMs);
}
