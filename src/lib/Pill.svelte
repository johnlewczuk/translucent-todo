<script lang="ts">
  import { state, mode } from "./stores";
  import { scheduleSave } from "./storage";
  import type { Node } from "./tree";

  $: incompleteCount = countIncomplete($state.items);

  function countIncomplete(items: Node[]): number {
    let n = 0;
    function walk(arr: Node[]) {
      for (const it of arr) {
        if (!it.done) n++;
        walk(it.children);
      }
    }
    walk(items);
    return n;
  }

  function expand() {
    mode.set("expanded");
    state.update((s) => { s.window.mode = "expanded"; scheduleSave(s); return s; });
  }
</script>

<button class="pill" on:click={expand} aria-label="Expand todo list">
  <span class="icon">●</span>
  {#if incompleteCount > 0}
    <span class="count">{incompleteCount}</span>
  {/if}
</button>

<style>
  .pill {
    width: 100vw;
    height: 100vh;
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(20px) saturate(160%);
    -webkit-backdrop-filter: blur(20px) saturate(160%);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 18px;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 13px;
    cursor: pointer;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.18),
      0 4px 18px rgba(0, 0, 0, 0.2);
  }
  .pill:hover { background: rgba(255, 255, 255, 0.14); }
  .icon { color: #9ec1ff; font-size: 10px; }
  .count { font-weight: 500; }
</style>
