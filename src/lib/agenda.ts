// Pure builder for the agenda view: collects every dated node from the tree
// (including those inside collapsed subtrees), grouped by due-date status and
// sorted soonest-first. Takes `today` as an argument so it stays deterministic
// and unit-testable, mirroring src/lib/dates.ts.

import type { Node } from "./tree";
import { dueStatus } from "./dates";

export type AgendaEntry = { node: Node; path: number[] };

export type Agenda = {
  overdue: AgendaEntry[];
  today: AgendaEntry[];
  upcoming: AgendaEntry[];
};

export function buildAgenda(items: Node[], today: Date = new Date()): Agenda {
  const groups: Agenda = { overdue: [], today: [], upcoming: [] };

  const walk = (nodes: Node[], prefix: number[]): void => {
    nodes.forEach((node, i) => {
      const path = [...prefix, i];
      if (node.due) {
        // dueStatus returns exactly "overdue" | "today" | "upcoming".
        groups[dueStatus(node.due, today)].push({ node, path });
      }
      // Always descend — the agenda shows everything dated, regardless of the
      // outline's collapsed state.
      if (node.children.length > 0) walk(node.children, path);
    });
  };
  walk(items, []);

  // Within each group: open items before done items, then soonest-first,
  // then by text as a stable tie-break.
  const cmp = (a: AgendaEntry, b: AgendaEntry): number => {
    if (!!a.node.done !== !!b.node.done) return a.node.done ? 1 : -1;
    if (a.node.due !== b.node.due) return a.node.due! < b.node.due! ? -1 : 1;
    return a.node.text.localeCompare(b.node.text);
  };
  groups.overdue.sort(cmp);
  groups.today.sort(cmp);
  groups.upcoming.sort(cmp);
  return groups;
}
