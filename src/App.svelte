<script lang="ts">
  import { onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
  import { state, mode, showToast, view } from "./lib/stores";
  import { loadState, scheduleSave } from "./lib/storage";
  import type { Node } from "./lib/tree";
  import TodoItem from "./lib/TodoItem.svelte";
  import Agenda from "./lib/Agenda.svelte";
  import Toast from "./lib/Toast.svelte";
  import Pill from "./lib/Pill.svelte";
  import Help from "./lib/Help.svelte";
  import { helpOpen, windowFocused } from "./lib/stores";
  import { installKeyboardHandler } from "./lib/keyboard";

  let rootEl: HTMLElement;
  let listEl: HTMLElement;
  let listInnerEl: HTMLElement;

  const MIN_W = 220;
  const MAX_W = 560;
  const HEADER_H = 0;
  const LIST_PAD = 16;        // .list top+bottom padding (4 + 12)
  const MIN_ROWS_H = 0;       // let content drive the height
  const MAX_H = 480;
  const PILL_W = 120;
  const PILL_H = 36;
  const HELP_MIN_W = 280;     // enough for the shortcut panel
  const HELP_MIN_H = 300;     // enough for the shortcut panel

  // Estimate of non-text row width: indent guides + grip + check + expander + paddings + safety.
  // Each indent guide adds ~22px (16 width + ~6 margin).
  const ROW_CHROME_PX = 56;
  const INDENT_PX = 22;

  async function syncWindowSize() {
    // Wait for Svelte + layout to settle before measuring.
    await tick();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const win = getCurrentWindow();
    const currentMode = get(mode);
    if (currentMode === "pill") {
      await win.setSize(new LogicalSize(PILL_W, PILL_H));
      return;
    }
    // Expanded-mode measurements need the live .root and .list-inner —
    // these only exist when the expanded branch is rendered.
    if (!rootEl || !listInnerEl) return;

    // Height: list-inner's intrinsic height + header + list padding.
    const contentH = listInnerEl.offsetHeight ?? 0;
    let desiredH = Math.max(
      HEADER_H + LIST_PAD + MIN_ROWS_H,
      Math.min(MAX_H, HEADER_H + LIST_PAD + contentH),
    );
    if (get(helpOpen)) desiredH = Math.max(desiredH, HELP_MIN_H);

    // Width: find the widest row's natural text width + chrome + indent.
    // We measure each row's text through a hidden span styled with the base
    // (non-header) font AND a fixed baseline font-size, so neither promoting
    // a row to a section header nor changing the user's font-size (Ctrl+/-)
    // causes the window to widen. Window height still scales with font.
    let measurer = document.getElementById("row-text-measurer") as HTMLSpanElement | null;
    if (!measurer) {
      measurer = document.createElement("span");
      measurer.id = "row-text-measurer";
      measurer.style.position = "fixed";
      measurer.style.visibility = "hidden";
      measurer.style.whiteSpace = "nowrap";
      measurer.style.left = "-9999px";
      measurer.style.top = "0";
      measurer.style.pointerEvents = "none";
      document.body.appendChild(measurer);
    }
    const baseEl =
      (listInnerEl.querySelector(".row:not(.header) .text") as HTMLElement | null) ??
      (listInnerEl as HTMLElement);
    const cs = getComputedStyle(baseEl);
    measurer.style.fontFamily = cs.fontFamily;
    // Pin to the default font-size (matches app.css fallback `var(--fs, 14px)`)
    // so width is invariant under Ctrl+/- font scaling.
    measurer.style.fontSize = "14px";
    measurer.style.fontWeight = cs.fontWeight;
    measurer.style.fontStyle = cs.fontStyle;
    measurer.style.letterSpacing = cs.letterSpacing;

    let widest = 0;
    const rows = listInnerEl.querySelectorAll(".row");
    rows.forEach((row) => {
      const r = row as HTMLElement;
      const textEl = r.querySelector(".text") as HTMLElement | null;
      const inputEl = r.querySelector("input.edit") as HTMLInputElement | null;
      const raw = inputEl ? inputEl.value : textEl ? (textEl.textContent ?? "") : "";
      measurer!.textContent = raw;
      const textW = measurer!.offsetWidth;
      const indents = r.querySelectorAll(".indent").length;
      const total = indents * INDENT_PX + ROW_CHROME_PX + textW;
      if (total > widest) widest = total;
    });
    let desiredW = Math.max(MIN_W, Math.min(MAX_W, widest));
    // The width measurer only counts row text; agenda rows are chip-heavy and
    // have group dividers with no text, so floor the width to avoid wrapping.
    if (get(view) === "agenda") desiredW = Math.max(desiredW, 260);
    if (get(helpOpen)) desiredW = Math.max(desiredW, HELP_MIN_W);

    await win.setSize(new LogicalSize(desiredW, desiredH));
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
    const viewUnsub = view.subscribe(() => { syncWindowSize(); });

    // Safety-net: any state change (item count, collapsed, font_size, etc.)
    // re-syncs window size. ResizeObserver should cover content-height
    // changes, but this catches edge cases where the observer doesn't fire
    // synchronously with the mutation.
    const stateUnsub = state.subscribe((s) => {
      const fs = s.font_size ?? 14;
      document.documentElement.style.setProperty("--fs", `${fs}px`);
      syncWindowSize();
    });

    // Drag from anywhere: any left-button mousedown that isn't on an
    // interactive element arms a potential window drag. We only actually
    // call startDragging() once the pointer moves past a small threshold,
    // so clicks and double-clicks on .text (start-edit) still go through.
    // Note: .text is intentionally NOT in NO_DRAG — the row's editing input
    // is `<input class="edit">` which already matches `input`, so editing
    // text is exempt while non-editing text is draggable.
    const NO_DRAG = "button, input, textarea, a, .grip, .empty, .help-overlay, .help-panel";
    const DRAG_THRESHOLD_PX = 4;
    let pendingDrag: { x: number; y: number } | null = null;
    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(NO_DRAG)) return;
      pendingDrag = { x: e.clientX, y: e.clientY };
    }
    function onMouseMove(e: MouseEvent) {
      if (!pendingDrag) return;
      const dx = e.clientX - pendingDrag.x;
      const dy = e.clientY - pendingDrag.y;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        pendingDrag = null;
        getCurrentWindow().startDragging();
      }
    }
    function onMouseUp() { pendingDrag = null; }
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    const win = getCurrentWindow();
    const unlistenFocus = await win.onFocusChanged(({ payload: focused }) => {
      windowFocused.set(focused);
    });

    return () => {
      cleanup();
      ro.disconnect();
      modeUnsub();
      helpUnsub();
      viewUnsub();
      stateUnsub();
      unlistenFocus();
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  });
</script>

{#if $mode === "pill"}
  <Pill />
{:else}
  <div
    class="root"
    class:idle={!$windowFocused}
    bind:this={rootEl}
  >
    <div class="badge" aria-hidden="true"></div>
    <div class="list" bind:this={listEl}>
      <div class="list-inner" bind:this={listInnerEl}>
        {#if $view === "agenda"}
          <Agenda />
        {:else}
          {#each flatten($state.items) as row (row.node.id)}
            <TodoItem node={row.node} depth={row.depth} path={row.path} />
          {/each}
        {/if}
      </div>
    </div>
    <Toast />
    {#if $helpOpen}
      <Help />
    {/if}
  </div>
{/if}
