<script lang="ts">
  import { tick } from "svelte";
  import { state, focusedPath, view } from "./stores";
  import { toggleDone, expandAncestors, type Node } from "./tree";
  import { scheduleSave } from "./storage";
  import { buildAgenda, type AgendaEntry } from "./agenda";
  import { dueLabel, dueStatus } from "./dates";

  // Live: recompute whenever items change, so checking an item re-sorts/re-groups
  // immediately (the chosen "live re-sort" behaviour).
  $: agenda = buildAgenda($state.items);
  $: isEmpty =
    agenda.overdue.length === 0 &&
    agenda.today.length === 0 &&
    agenda.upcoming.length === 0;

  const GROUPS: { key: "overdue" | "today" | "upcoming"; label: string }[] = [
    { key: "overdue", label: "Overdue" },
    { key: "today", label: "Today" },
    { key: "upcoming", label: "Upcoming" },
  ];

  function toggle(entry: AgendaEntry) {
    state.update((s) => {
      toggleDone(s.items, entry.path);
      scheduleSave(s);
      return s;
    });
  }

  // Jump back to the outline focused on this item: un-collapse its ancestors so
  // the row renders, switch to the outline, then scroll it into view.
  async function jump(entry: AgendaEntry) {
    state.update((s) => {
      expandAncestors(s.items, entry.path);
      scheduleSave(s);
      return s;
    });
    focusedPath.set(entry.path);
    view.set("outline");
    await tick();
    const el = document.querySelector(
      `.row[data-path="${entry.path.join(",")}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }

  // Chip state: done items never carry an urgency tint.
  function chipState(node: Node): "overdue" | "today" | null {
    if (node.done) return null;
    const s = dueStatus(node.due!);
    return s === "upcoming" ? null : s;
  }
</script>

<div class="agenda">
  {#if isEmpty}
    <div class="empty">No due dates.</div>
  {:else}
    {#each GROUPS as group (group.key)}
      {#if agenda[group.key].length > 0}
        <div class="group-label">{group.label}</div>
        {#each agenda[group.key] as entry (entry.node.id)}
          {@const cs = chipState(entry.node)}
          <div class="row" class:done={entry.node.done}>
            {#if !entry.node.is_header}
              <button
                class="check"
                class:checked={entry.node.done}
                on:click|stopPropagation={() => toggle(entry)}
                aria-label={entry.node.done ? "Mark as not done" : "Mark as done"}
              ></button>
            {/if}
            <span
              class="text"
              on:click={() => jump(entry)}
              on:keydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); jump(entry); } }}
              role="button"
              tabindex="0"
            >
              {entry.node.text || "—"}
            </span>
            <span
              class="due-chip"
              class:overdue={cs === "overdue"}
              class:today={cs === "today"}
            >
              {dueLabel(entry.node.due!)}
            </span>
          </div>
        {/each}
      {/if}
    {/each}
  {/if}
</div>

<style>
  .agenda {
    padding: 2px 12px 2px 12px;
    min-width: 240px;
  }

  .group-label {
    font-size: 0.72em;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--fg-muted);
    margin: 10px 0 3px 2px;
  }
  .group-label:first-child { margin-top: 2px; }

  .empty {
    color: var(--fg-faint);
    font-size: 0.9em;
    padding: 8px 2px;
  }

  .row {
    display: flex;
    align-items: center;
    min-height: 26px;
    padding: 2px 0;
  }

  /* Checkbox: minimal ring → fills on done (mirrors TodoItem). */
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
  .check:hover { border-color: var(--fg); }
  .check.checked { background: var(--fg); border-color: var(--fg); }

  .text {
    flex: 1;
    min-width: 0;
    color: var(--fg);
    line-height: 1.2;
    cursor: pointer;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .text:hover { color: var(--accent); }
  .row.done .text { color: var(--fg-muted); opacity: 0.55; text-decoration: line-through; }
  /* Header entries have no checkbox; indent the text to align with todo rows. */
  .row > .text:first-child { margin-left: 23px; }

  /* The agenda chip is display-only (date editing happens in the outline), so
     override the global .due-chip's pointer cursor. */
  .due-chip { cursor: default; }
</style>
