<script lang="ts">
  import type { Node } from "./tree";
  import { toggleDone, toggleCollapsed, setText } from "./tree";
  import { state, editingPath, focusedPath, dragState } from "./stores";
  import { scheduleSave } from "./storage";
  import { get } from "svelte/store";
  import { startDrag, updateHover, endDrag } from "./drag";

  export let node: Node;
  export let depth: number;
  export let path: number[];

  let inputEl: HTMLInputElement | null = null;
  let draftText = node.text;

  $: pathKey = path.join(".");
  $: editing = ($editingPath?.join(".") ?? "") === pathKey;
  $: focused = ($focusedPath?.join(".") ?? "") === pathKey;

  function onCheckChange() {
    state.update((s) => {
      toggleDone(s.items, path);
      scheduleSave(s);
      return s;
    });
  }

  function onExpanderClick() {
    state.update((s) => {
      toggleCollapsed(s.items, path);
      scheduleSave(s);
      return s;
    });
  }

  function startEdit() {
    draftText = node.text;
    editingPath.set(path);
    setTimeout(() => inputEl?.focus(), 0);
  }

  function commitEdit() {
    state.update((s) => {
      setText(s.items, path, draftText);
      scheduleSave(s);
      return s;
    });
    editingPath.set(null);
  }

  function cancelEdit() {
    draftText = node.text;
    editingPath.set(null);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }

  function onRowClick() {
    focusedPath.set(path);
  }
</script>

<div
  class="row"
  class:focused
  class:drop-before={$dragState?.hoverPath?.join(",") === path.join(",") && $dragState?.position === "before"}
  class:drop-after={$dragState?.hoverPath?.join(",") === path.join(",") && $dragState?.position === "after"}
  class:drop-child={$dragState?.hoverPath?.join(",") === path.join(",") && $dragState?.position === "child"}
  class:dragging={$dragState?.fromPath?.join(",") === path.join(",")}
  data-path={path.join(",")}
  style="padding-left: {depth * 16 + 4}px;"
  on:click={onRowClick}
  role="treeitem"
  tabindex="0"
>
  <div
    class="grip"
    on:pointerdown|stopPropagation={(e) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      startDrag(path);
    }}
    on:pointermove={(e) => {
      if (get(dragState) === null) return;
      const elBelow = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const rowEl = elBelow?.closest(".row") as HTMLElement | null;
      if (!rowEl) return;
      const rect = rowEl.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const third = rect.height / 3;
      const position: "before" | "after" | "child" =
        y < third ? "before" : y > 2 * third ? "after" : "child";
      const hoverPathAttr = rowEl.dataset.path;
      if (!hoverPathAttr) return;
      const hoverPath = hoverPathAttr.split(",").map(Number);
      let nodes = get(state).items as Node[];
      let n: Node | null = null;
      for (const idx of hoverPath) { n = nodes[idx]; nodes = n.children; }
      if (n) updateHover(hoverPath, position, n);
    }}
    on:pointerup={() => endDrag(true)}
    on:pointercancel={() => endDrag(false)}
    on:keydown={(e) => { if (e.key === "Escape") endDrag(false); }}
    aria-label="Drag handle"
    role="button"
    tabindex="0"
  >⋮⋮</div>
  <button
    class="expander"
    class:invisible={node.children.length === 0}
    on:click|stopPropagation={onExpanderClick}
    aria-label={node.collapsed ? "expand" : "collapse"}
  >
    {node.collapsed ? "▸" : "▾"}
  </button>

  <input
    type="checkbox"
    checked={node.done}
    on:change={onCheckChange}
    on:click|stopPropagation
  />

  {#if editing}
    <input
      type="text"
      bind:value={draftText}
      bind:this={inputEl}
      on:blur={commitEdit}
      on:keydown={onKeydown}
      class="edit"
    />
  {:else}
    <span
      class:done={node.done}
      on:dblclick|stopPropagation={startEdit}
      class="text"
    >
      {node.text || "(empty)"}
    </span>
  {/if}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 6px;
    transition: background-color 120ms ease;
    cursor: default;
  }
  .row:hover { background-color: rgba(255, 255, 255, 0.08); }
  .row.focused { background-color: rgba(255, 255, 255, 0.16); }

  .expander {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.65);
    cursor: pointer;
    padding: 0 2px;
    font-size: 11px;
    width: 16px;
    text-align: center;
  }
  .expander.invisible { visibility: hidden; }
  .expander:hover { color: white; }

  input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border: 1.5px solid rgba(255, 255, 255, 0.45);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.10);
    cursor: pointer;
    transition: all 140ms ease;
    position: relative;
  }
  input[type="checkbox"]:hover {
    border-color: rgba(255, 255, 255, 0.75);
    background: rgba(255, 255, 255, 0.14);
  }
  input[type="checkbox"]:checked {
    background: linear-gradient(135deg, #9ec1ff, #6f93d6);
    border-color: rgba(158, 193, 255, 0.55);
  }
  input[type="checkbox"]:checked::after {
    content: "✓";
    position: absolute;
    top: -2px;
    left: 1px;
    color: #0d1018;
    font-size: 11px;
    font-weight: bold;
  }

  .text {
    flex: 1;
    padding: 2px 4px;
  }
  .done { text-decoration: line-through; opacity: 0.45; font-style: italic; }

  .grip {
    width: 12px;
    text-align: center;
    cursor: grab;
    color: rgba(255, 255, 255, 0.30);
    font-size: 10px;
    user-select: none;
    letter-spacing: -3px;
  }
  .grip:active { cursor: grabbing; }

  .row.dragging { opacity: 0.4; }

  .row.drop-before {
    box-shadow: inset 0 2px 0 0 #9ec1ff;
  }
  .row.drop-after {
    box-shadow: inset 0 -2px 0 0 #9ec1ff;
  }
  .row.drop-child {
    box-shadow: inset 0 0 0 2px rgba(158, 193, 255, 0.5);
  }

  .edit {
    flex: 1;
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(158, 193, 255, 0.40);
    border-radius: 4px;
    padding: 1px 4px;
    color: white;
    font-family: inherit;
    font-size: inherit;
    outline: none;
  }
</style>
