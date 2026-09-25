<script lang="ts">
  import type { Node } from "./tree";
  import { toggleDone, toggleCollapsed, setText, setDue, rowColor } from "./tree";
  import { parseDate, dueLabel, dueStatus } from "./dates";
  import { state, editingPath, editingDatePath, focusedPath, dragState, showToast } from "./stores";
  import { scheduleSave } from "./storage";
  import { get } from "svelte/store";
  import { tick } from "svelte";
  import { startDrag, updateHover, endDrag } from "./drag";

  export let node: Node;
  export let depth: number;
  export let path: number[];

  let rowEl: HTMLDivElement | null = null;
  let inputEl: HTMLInputElement | null = null;
  let dateInputEl: HTMLInputElement | null = null;
  let draftText = node.text;
  let draftDue = node.due ?? "";

  $: pathKey = path.join(".");
  $: editing = ($editingPath?.join(".") ?? "") === pathKey;
  $: editingDate = ($editingDatePath?.join(".") ?? "") === pathKey;
  $: focused = ($focusedPath?.join(".") ?? "") === pathKey;

  // Keep the focused row visible when arrow keys move focus offscreen.
  // Only on the false→true transition, so re-renders don't yank the scroll.
  let wasFocused = false;
  $: {
    // tick(): a freshly created row (Enter) isn't bound to rowEl yet.
    if (focused && !wasFocused) tick().then(() => rowEl?.scrollIntoView({ block: "nearest" }));
    wasFocused = focused;
  }

  // Display state for the due-date chip (uses the real "now" at runtime).
  $: dueText = node.due ? dueLabel(node.due) : "";
  $: dueState = node.due ? dueStatus(node.due) : null;

  // When editing becomes true (from anywhere — local dblclick OR external
  // set via keyboard.ts on Enter), seed draftText and focus the input
  // once the DOM has rendered. Only select-all when the input is FRESHLY
  // gaining focus, not when the reactive re-fires due to editingPath
  // changing but staying on this same node (Tab carries edit cursor).
  $: if (editing) {
    draftText = node.text;
    tick().then(() => {
      if (inputEl && document.activeElement !== inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    });
  }

  // When the date editor opens (via `d` or chip click), seed the draft with
  // the current ISO date and focus/select the input once rendered.
  $: if (editingDate) {
    draftDue = node.due ?? "";
    tick().then(() => {
      if (dateInputEl && document.activeElement !== dateInputEl) {
        dateInputEl.focus();
        dateInputEl.select();
      }
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
    // Tab and Shift+Tab are handled by the global keyboard handler,
    // which also commits the in-progress edit using this input's value.
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

  function startDateEdit() {
    editingDatePath.set(path);  // reactive block above seeds + focuses
  }

  /** Persist a due value (ISO string or null to clear) and close the editor. */
  function applyDue(due: string | null) {
    state.update((s) => {
      setDue(s.items, path, due);
      scheduleSave(s);
      return s;
    });
    editingDatePath.set(null);
  }

  function onDateKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      const raw = draftDue.trim();
      if (!raw) { applyDue(null); return; }      // empty → clear the date
      const iso = parseDate(raw);
      if (iso) {
        applyDue(iso);
      } else {
        showToast(`Couldn't parse "${raw}"`);     // keep editing so it can be fixed
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Reset the draft BEFORE closing: unmounting the focused input fires a
      // blur, and onDateBlur would otherwise commit whatever was typed. With
      // the draft reset to the original, that blur is a no-op.
      draftDue = node.due ?? "";
      editingDatePath.set(null);                  // cancel, leave the date unchanged
    }
  }

  function onDateBlur() {
    const raw = draftDue.trim();
    if (!raw) { applyDue(null); return; }         // empty → clear
    const iso = parseDate(raw);
    if (iso) applyDue(iso);                        // valid → set
    else editingDatePath.set(null);               // invalid → close, leave unchanged
  }
</script>

<div
  bind:this={rowEl}
  class="row"
  class:focused
  class:done={node.done}
  class:header={node.is_header}
  class:drop-before={$dragState?.hoverPath?.join(",") === path.join(",") && $dragState?.position === "before"}
  class:drop-after={$dragState?.hoverPath?.join(",") === path.join(",") && $dragState?.position === "after"}
  class:drop-child={$dragState?.hoverPath?.join(",") === path.join(",") && $dragState?.position === "child"}
  class:dragging={$dragState?.fromPath?.join(",") === path.join(",")}
  data-path={path.join(",")}
  style:--row-color={rowColor(node.color)}
  on:click={onRowClick}
  role="treeitem"
  tabindex="0"
>
  {#each Array(depth) as _, i (i)}
    <span class="indent"></span>
  {/each}

  <div
    class="grip"
    data-tauri-drag-region="false"
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

  {#if !node.is_header}
    <button
      class="check"
      class:checked={node.done}
      data-tauri-drag-region="false"
      on:click|stopPropagation={onCheckChange}
      aria-label={node.done ? "Mark as not done" : "Mark as done"}
    ></button>
  {/if}

  {#if editing}
    <input
      type="text"
      bind:value={draftText}
      bind:this={inputEl}
      data-tauri-drag-region="false"
      on:blur={commitEdit}
      on:keydown={onKeydown}
      class="edit"
    />
  {:else}
    <span
      data-tauri-drag-region="false"
      on:click={() => { if (!node.text) startEdit(); }}
      on:dblclick|stopPropagation={startEdit}
      class="text"
      class:placeholder={!node.text}
    >
      {node.text || "—"}
    </span>
  {/if}

  {#if editingDate}
    <input
      type="text"
      bind:value={draftDue}
      bind:this={dateInputEl}
      data-tauri-drag-region="false"
      placeholder="Jun 19, fri, today, 2026-06-19…"
      on:click|stopPropagation
      on:blur={onDateBlur}
      on:keydown={onDateKeydown}
      class="due-edit"
    />
  {:else if node.due}
    <button
      class="due-chip"
      class:overdue={dueState === "overdue"}
      class:today={dueState === "today"}
      data-tauri-drag-region="false"
      on:click|stopPropagation={startDateEdit}
      title="Edit due date"
    >
      {dueText}
    </button>
  {/if}

  <button
    class="expander"
    class:visible={node.children.length > 0}
    data-tauri-drag-region="false"
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

  /* Focus indicator: cyan tick on the left edge + soft row tint, so
     focus is unmistakable as it moves between rows. Uses --accent-row
     so the parent .root can override it to transparent while idle. */
  .row.focused {
    background-color: var(--row-focus, rgba(125, 211, 223, 0.12));
    transition: background-color 120ms ease;
  }
  .row.focused::before {
    content: "";
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 3px;
    border-radius: 0 2px 2px 0;
    background: var(--accent-row, var(--accent));
    transition: background 220ms ease;
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
    min-width: 0; /* let flex shrink instead of pushing the row wider */
    padding: 0;
    color: var(--row-color, var(--fg));
    line-height: 1.2;
    transition: color 140ms ease, opacity 140ms ease;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .edit {
    line-height: 1.2;
  }
  .row.done .text {
    color: var(--fg-muted);
    opacity: 0.55;
  }

  /* Header styling: no checkbox; bolder, slightly larger text;
     a sliver of top margin so headers separate visually from the
     row above. */
  .row.header {
    margin-top: 8px;
    padding-top: 4px;
  }
  .row.header:first-child { margin-top: 2px; }
  .row.header .text {
    font-weight: 600;
    font-size: 1.05em;
    letter-spacing: -0.01em;
    color: var(--row-color, var(--fg));
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
    color: var(--row-color, var(--fg));
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    letter-spacing: inherit;
    caret-color: var(--accent);
  }

  /* Due-date editor: same minimal-chrome treatment as the text editor, but
     fixed-width and right-aligned where the chip would sit. */
  .due-edit {
    flex-shrink: 0;
    width: 11em;
    margin: 0 8px 0 8px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--accent);
    outline: none;
    padding: 0 0 1px 0;
    color: var(--fg);
    font-family: inherit;
    font-size: 0.85em;
    caret-color: var(--accent);
  }
  .due-edit::placeholder { color: var(--fg-faint); }

  /* Drag state */
  .row.dragging { opacity: 0.35; }
  .row.drop-before { box-shadow: inset 0 1.5px 0 0 var(--accent); }
  .row.drop-after { box-shadow: inset 0 -1.5px 0 0 var(--accent); }
  .row.drop-child {
    box-shadow: inset 0 0 0 1px var(--accent);
    background-color: rgba(125, 211, 223, 0.08);
  }
</style>
