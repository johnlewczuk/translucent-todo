<script lang="ts">
  import { onMount } from "svelte";
  import { state, mode, showToast } from "./lib/stores";
  import { loadState } from "./lib/storage";
  import type { Node } from "./lib/tree";

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
  });
</script>

<div class="root">
  <div class="header" data-tauri-drag-region></div>
  <div class="list">
    {#each flatten($state.items) as row (row.node.id)}
      <div class="row" style="padding-left: {row.depth * 16 + 8}px;">
        <input type="checkbox" checked={row.node.done} />
        <span class:done={row.node.done}>{row.node.text || "(empty)"}</span>
      </div>
    {/each}
    {#if $state.items.length === 0}
      <div class="empty">No items yet</div>
    {/if}
  </div>
</div>

<style>
  .empty {
    padding: 16px;
    text-align: center;
    opacity: 0.5;
    font-size: 12px;
  }
</style>
