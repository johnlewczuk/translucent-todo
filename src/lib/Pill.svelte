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
  {#if incompleteCount > 0}
    <span class="count">{incompleteCount}</span>
  {:else}
    <span class="dot"></span>
  {/if}
</button>

<style>
  .pill {
    width: 100vw;
    height: 100vh;
    background: rgba(255, 255, 255, 0.10);
    backdrop-filter: blur(28px) saturate(170%);
    -webkit-backdrop-filter: blur(28px) saturate(170%);
    border: none;
    border-radius: 18px;
    color: var(--fg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    font-size: 14px;
    font-weight: 400;
    letter-spacing: -0.01em;
    cursor: pointer;
    padding: 0;
    transition: background 140ms ease;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.25);
  }
  .pill:hover { background: rgba(255, 255, 255, 0.16); }

  .count { line-height: 1; }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--fg-muted);
  }
</style>
