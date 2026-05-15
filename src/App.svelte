<script lang="ts">
  import { onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
  import { state, mode, showToast } from "./lib/stores";
  import { loadState } from "./lib/storage";
  import type { Node } from "./lib/tree";
  import TodoItem from "./lib/TodoItem.svelte";
  import Toast from "./lib/Toast.svelte";
  import Pill from "./lib/Pill.svelte";
  import { installKeyboardHandler } from "./lib/keyboard";

  let rootEl: HTMLElement;
  let listEl: HTMLElement;

  const MIN_H = 200;
  const MAX_H = 600;
  const PILL_W = 120;
  const PILL_H = 36;

  async function syncWindowSize() {
    if (!rootEl) return;
    const win = getCurrentWindow();
    const currentMode = get(mode);
    if (currentMode === "pill") {
      await win.setSize(new LogicalSize(PILL_W, PILL_H));
      return;
    }
    const headerH = 24;
    const naturalListH = listEl?.scrollHeight ?? 0;
    const desired = Math.max(MIN_H, Math.min(MAX_H, headerH + naturalListH + 16));
    await win.setSize(new LogicalSize(320, desired));
  }

  type FlatRow = { node: Node; depth: number; path: number[] };

  function flatten(items: Node[], depth: number = 0, prefix: number[] = []): FlatRow[] {
    const out: FlatRow[] = [];
    items.forEach((node, i) => {
      const path = [...prefix, i];
      out.push({ node, depth, path });
      if (!node.collapsed && node.children.length > 0) {
        out.push(...flatten(node.children, depth + 1, path));
      }
    });
    return out;
  }

  onMount(async () => {
    try {
      const loaded = await loadState();
      state.set(loaded);
      mode.set(loaded.window.mode);
    } catch (e) {
      console.error("load_state failed:", e);
      showToast("Could not load saved state");
    }
    const cleanup = installKeyboardHandler();

    let ro: ResizeObserver | null = null;
    function reattachObserver() {
      if (ro) ro.disconnect();
      ro = new ResizeObserver(() => { syncWindowSize(); });
      if (listEl) ro.observe(listEl);
    }
    reattachObserver();
    syncWindowSize();

    // When mode flips, the markup branches: re-attach observer to the
    // new listEl (or stop observing if we're entering pill mode), then sync.
    const modeUnsub = mode.subscribe(async () => {
      await tick();
      reattachObserver();
      syncWindowSize();
    });

    const win = getCurrentWindow();
    const unlistenFocus = await win.onFocusChanged(({ payload: focused }) => {
      const s = get(state);
      if (!focused && s.mini_mode_enabled && get(mode) === "expanded") {
        mode.set("pill");
        state.update((s2) => { s2.window.mode = "pill"; scheduleSave(s2); return s2; });
      }
    });

    return () => {
      cleanup();
      ro?.disconnect();
      modeUnsub();
      unlistenFocus();
    };
  });
</script>

{#if $mode === "pill"}
  <Pill />
{:else}
  <div class="root" bind:this={rootEl}>
    <div class="header" data-tauri-drag-region></div>
    <div class="list" bind:this={listEl}>
      {#each flatten($state.items) as row (row.node.id)}
        <TodoItem node={row.node} depth={row.depth} path={row.path} />
      {/each}
      {#if $state.items.length === 0}
        <div class="empty">Press Enter to begin</div>
      {/if}
    </div>
    <Toast />
  </div>
{/if}

