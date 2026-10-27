// Keeps the overlay in step with todos.json when something else (the `todo`
// CLI) writes it. The backend emits "todos-changed" for outside writes and
// refuses saves that would overwrite one; either way we reload from disk,
// carrying focus/editing over to the same rows by id. The outside write wins:
// a local change still waiting to be saved is dropped, with a toast.

import { get } from "svelte/store";
import { listen } from "@tauri-apps/api/event";
import { loadState, discardPendingSave, onSaveConflict } from "./storage";
import { state, focusedPath, editingPath, editingDatePath, dragState, showToast } from "./stores";
import { remapPath } from "./tree";

export async function installExternalSync(): Promise<() => void> {
  onSaveConflict(() => void reload(true));
  const unlisten = await listen("todos-changed", () => void reload(discardPendingSave()));
  return () => {
    unlisten();
    onSaveConflict(null);
  };
}

async function reload(droppedLocalChange: boolean): Promise<void> {
  let loaded;
  try {
    loaded = await loadState();
  } catch (e) {
    console.error("[translucent-todo] reload failed:", e);
    return;
  }
  const before = get(state).items;
  const remap = (p: number[] | null) => remapPath(before, loaded.items, p);
  focusedPath.update(remap);
  editingPath.update(remap);
  editingDatePath.update(remap);
  dragState.set(null);
  state.set(loaded);
  if (droppedLocalChange) {
    showToast("Todos changed outside the app; your last change was discarded");
  }
}
