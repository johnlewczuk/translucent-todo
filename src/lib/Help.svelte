<script lang="ts">
  import { helpOpen } from "./stores";

  const shortcuts: [string, string][] = [
    ["Enter", "New row"],
    ["Tab", "Indent"],
    ["⇧ Tab", "Outdent"],
    ["Space", "Toggle done"],
    ["Delete", "Remove row"],
    ["D", "Set / edit due date"],
    ["C / ⇧ C", "Cycle text colour"],
    ["A", "Agenda (due-date view)"],
    ["↑ / ↓", "Move focus"],
    ["Alt ↑ / ↓", "Move row up / down"],
    ["→", "Expand / enter child"],
    ["←", "Collapse / parent"],
    ["Dbl-click", "Edit text"],
    ["⌃ M", "Hide to tray"],
    ["⌃ + / -", "Font size"],
    ["⌃ 0", "Reset font"],
    ["H", "This help"],
    ["Esc", "Cancel"],
  ];

  function close() {
    helpOpen.set(false);
  }
</script>

<div
  class="overlay"
  data-tauri-drag-region="false"
  on:click={close}
  role="dialog"
  aria-modal="true"
  aria-label="Keyboard shortcuts"
>
  <div class="panel" on:click|stopPropagation role="document">
    <div class="title">Keyboard</div>
    <dl>
      {#each shortcuts as [key, desc]}
        <dt><kbd>{key}</kbd></dt>
        <dd>{desc}</dd>
      {/each}
    </dl>
  </div>
</div>

<style>
  .overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fade 140ms ease;
  }
  @keyframes fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .panel {
    background: rgba(20, 22, 30, 0.78);
    border-radius: 10px;
    padding: 14px 16px 12px;
    min-width: 220px;
    max-height: calc(100vh - 24px);
    overflow-y: auto;
    overscroll-behavior: contain;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
  }
  .panel::-webkit-scrollbar { width: 6px; }
  .panel::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.18);
    border-radius: 3px;
  }

  .title {
    font-size: 0.8em;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--fg-muted);
    margin-bottom: 10px;
  }

  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 14px;
    row-gap: 6px;
    align-items: center;
    font-size: 0.9em;
  }
  dt, dd { margin: 0; }
  dt { text-align: right; }
  dd { color: var(--fg-muted); }

  kbd {
    display: inline-block;
    padding: 1px 6px;
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 4px;
    color: var(--fg);
    font-family: "SF Mono", "JetBrains Mono", "Consolas", monospace;
    font-size: 0.78em;
    line-height: 1.3;
    min-width: 1.5em;
    text-align: center;
  }
</style>
