<script lang="ts">
  import { onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
  import { state, mode, showToast } from "./lib/stores";
  import { loadState, scheduleSave } from "./lib/storage";
  import type { Node } from "./lib/tree";
  import TodoItem from "./lib/TodoItem.svelte";
  import Toast from "./lib/Toast.svelte";
  import Pill from "./lib/Pill.svelte";
  import Help from "./lib/Help.svelte";
  import { helpOpen } from "./lib/stores";
  import { installKeyboardHandler } from "./lib/keyboard";

  let rootEl: HTMLElement;
  let listEl: HTMLElement;
  let listInnerEl: HTMLElement;

  const WIDTH = 320;
  const HEADER_H = 14;
  const LIST_PAD = 16;        // .list top+bottom padding (4 + 12)
  const MIN_ROWS_H = 42;      // ~ one row + tiny breathing room
  const MAX_H = 480;
  const PILL_W = 120;
  const PILL_H = 36;
  const HELP_MIN_H = 300;     // enough to show the full shortcut panel

  async function syncWindowSize() {
    if (!rootEl) return;
    // Wait for Svelte + layout to settle before measuring.
    await tick();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const win = getCurrentWindow();
    const currentMode = get(mode);
    if (currentMode === "pill") {
      await win.setSize(new LogicalSize(PILL_W, PILL_H));
      return;
    }
    // Measure the inner wrapper (intrinsic height), NOT listEl
    // (which is flex:1 and always fills available space).
    const contentH = listInnerEl?.offsetHeight ?? 0;
    let desired = Math.max(
      HEADER_H + LIST_PAD + MIN_ROWS_H,
      Math.min(MAX_H, HEADER_H + LIST_PAD + contentH),
    );
    // Keep at least enough room for the help panel while it's open
    if (get(helpOpen)) {
      desired = Math.max(desired, HELP_MIN_H);
    }
    await win.setSize(new LogicalSize(WIDTH, desired));
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
    await tick();
    syncWindowSize();

    // ResizeObserver on the inner wrapper (which is intrinsically sized,
    // unlike .list which is flex:1) fires whenever content height changes.
    const ro = new ResizeObserver(() => { syncWindowSize(); });
    if (listInnerEl) ro.observe(listInnerEl);

    const modeUnsub = mode.subscribe(() => { syncWindowSize(); });
    const helpUnsub = helpOpen.subscribe(() => { syncWindowSize(); });

    // Safety-net: any state change (item count, collapsed, font_size, etc.)
    // re-syncs window size. ResizeObserver should cover content-height
    // changes, but this catches edge cases where the observer doesn't fire
    // synchronously with the mutation.
    const stateUnsub = state.subscribe((s) => {
      const fs = s.font_size ?? 14;
      document.documentElement.style.setProperty("--fs", `${fs}px`);
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
      ro.disconnect();
      modeUnsub();
      helpUnsub();
      stateUnsub();
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
      <div class="list-inner" bind:this={listInnerEl}>
        {#each flatten($state.items) as row (row.node.id)}
          <TodoItem node={row.node} depth={row.depth} path={row.path} />
        {/each}
        {#if $state.items.length === 0}
          <div class="empty">Press Enter to begin</div>
        {/if}
      </div>
    </div>
    <Toast />
    {#if $helpOpen}
      <Help />
    {/if}
  </div>
{/if}
