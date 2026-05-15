<script lang="ts">
  import type { Node } from "./tree";
  import { toggleDone, toggleCollapsed, setText, indent, outdent } from "./tree";
  import { state, editingPath, focusedPath, dragState } from "./stores";
  import { scheduleSave } from "./storage";
  import { get } from "svelte/store";
  import { tick } from "svelte";
  import { startDrag, updateHover, endDrag } from "./drag";

  export let node: Node;
  export let depth: number;
  export let path: number[];

  let inputEl: HTMLInputElement | null = null;
  let draftText = node.text;

  $: pathKey = path.join(".");
  $: editing = ($editingPath?.join(".") ?? "") === pathKey;
  $: focused = ($focusedPath?.join(".") ?? "") === pathKey;

  // When editing becomes true (from anywhere — local dblclick OR external
  // set via keyboard.ts on Enter), seed draftText and focus the input
  // once the DOM has rendered.
  $: if (editing) {
    draftText = node.text;
    tick().then(() => {
      inputEl?.focus();
      inputEl?.select();
    });
  }

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
    editingPath.set(path);  // reactive block above handles seeding + focusing
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
    } else if (e.key === "Tab" && !e.shiftKey) {
      // Commit text, then indent — without releasing keyboard focus to
      // the browser's default tab-shift behavior.
      e.preventDefault();
      commitEdit();
      state.update((s) => {
        const np = indent(s.items, path);
        if (np !== null) focusedPath.set(np);
        return s;
      });
    } else if ((e.key === "Tab" && e.shiftKey) || e.key === "ISO_Left_Tab") {
      e.preventDefault();
      commitEdit();
      state.update((s) => {
        const np = outdent(s.items, path);
        if (np !== null) focusedPath.set(np);
        return s;
      });
    }
  }

  function onRowClick() {
    focusedPath.set(path);
  }
</script>

<div
  class="row"
  class:focused
  class:done={node.done}
  class:drop-before={$dragState?.hoverPath?.join(",") === path.join(",") && $dragState?.position === "before"}
  class:drop-after={$dragState?.hoverPath?.join(",") === path.join(",") && $dragState?.position === "after"}
  class:drop-child={$dragState?.hoverPath?.join(",") === path.join(",") && $dragState?.position === "child"}
  class:dragging={$dragState?.fromPath?.join(",") === path.join(",")}
  data-path={path.join(",")}
  on:click={onRowClick}
  role="treeitem"
  tabindex="0"
>
  {#each Array(depth) as _, i (i)}
    <span class="indent"></span>
  {/each}

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
  ></div>

  <button
    class="check"
    class:checked={node.done}
    on:click|stopPropagation={onCheckChange}
    aria-label={node.done ? "Mark as not done" : "Mark as done"}
  ></button>

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
      on:click|stopPropagation={() => { if (!node.text) startEdit(); }}
      on:dblclick|stopPropagation={startEdit}
      class="text"
      class:placeholder={!node.text}
    >
      {node.text || "—"}
    </span>
  {/if}

  <button
    class="expander"
    class:visible={node.children.length > 0}
    on:click|stopPropagation={onExpanderClick}
    aria-label={node.collapsed ? "expand" : "collapse"}
  >
    {node.collapsed ? "›" : "⌄"}
  </button>
</div>

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 26px;
    padding: 2px 12px 2px 6px;
    transition: background-color 100ms ease;
    cursor: default;
  }
  .row:hover { background-color: var(--row-hover); }

  /* Focus indicator: cyan tick on the left edge */
  .row.focused::before {
    content: "";
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 2px;
    border-radius: 1px;
    background: var(--accent);
  }

  /* Indent guides */
  .indent {
    width: 16px;
    height: 100%;
    flex-shrink: 0;
    border-left: 1px solid var(--fg-trace);
    margin-left: 6px;
  }

  /* Grip: invisible at rest, fades in on row hover */
  .grip {
    width: 10px;
    height: 18px;
    flex-shrink: 0;
    cursor: grab;
    opacity: 0;
    transition: opacity 140ms ease;
    background-image: radial-gradient(circle, var(--fg-muted) 1px, transparent 1px);
    background-size: 3px 4px;
    background-repeat: repeat;
    background-position: center;
    margin-right: 4px;
  }
  .grip:active { cursor: grabbing; }
  .row:hover .grip { opacity: 0.55; }
  .grip:hover { opacity: 1 !important; }

  /* Checkbox: minimal ring → fills on done */
  .check {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    border: 1.5px solid var(--fg-muted);
    border-radius: 50%;
    background: transparent;
    padding: 0;
    cursor: pointer;
    transition: border-color 140ms ease, background-color 140ms ease;
    margin-right: 10px;
  }
  .check:hover {
    border-color: var(--fg);
  }
  .check.checked {
    background: var(--fg);
    border-color: var(--fg);
  }

  /* Label */
  .text {
    flex: 1;
    padding: 0;
    color: var(--fg);
    line-height: 1.2;
    transition: color 140ms ease, opacity 140ms ease;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .edit {
    line-height: 1.2;
  }
  .row.done .text {
    color: var(--fg-muted);
    opacity: 0.55;
  }
  .text.placeholder {
    color: var(--fg-faint);
    cursor: text;
  }

  /* Expander: hidden until row has children AND row is hovered */
  .expander {
    width: 14px;
    height: 18px;
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 0;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: 11px;
    line-height: 1;
    opacity: 0;
    transition: opacity 140ms ease, color 100ms ease;
  }
  .expander.visible {
    /* visible when row has children; still fades fully in on hover */
    opacity: 0.35;
  }
  .row:hover .expander.visible { opacity: 0.85; }
  .expander:hover { color: var(--fg); }
  .expander:not(.visible) { visibility: hidden; }

  /* Edit input: no chrome, just a caret */
  .edit {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    padding: 0;
    color: var(--fg);
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    letter-spacing: inherit;
    caret-color: var(--accent);
  }

  /* Drag state */
  .row.dragging { opacity: 0.35; }
  .row.drop-before { box-shadow: inset 0 1.5px 0 0 var(--accent); }
  .row.drop-after { box-shadow: inset 0 -1.5px 0 0 var(--accent); }
  .row.drop-child {
    box-shadow: inset 0 0 0 1px var(--accent);
    background-color: rgba(125, 211, 223, 0.08);
  }
</style>
