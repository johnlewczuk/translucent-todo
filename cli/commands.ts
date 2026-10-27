// The `todo` CLI's commands, as one pure function over the app state: parse
// argv, mutate `state` in place through the same tree.ts / dates.ts /
// agenda.ts functions the overlay uses, and return what to print. File I/O
// and locking live in store.ts, so this stays deterministic and testable.

import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import type { AppState } from "../src/lib/storage";
import {
  newNode,
  findPathById,
  findParentAndIndex,
  moveNode,
  deleteNode,
  setText,
  setDone,
  setDue,
  setColor,
  setHeader,
  type Node,
} from "../src/lib/tree";
import { parseDate, dueStatus } from "../src/lib/dates";
import { buildAgenda } from "../src/lib/agenda";

export const USAGE = `usage: todo <command> [args]

  ls [ID] [--open] [--json]    show the tree (or one subtree) with item ids
  agenda [--json]              dated items: overdue / today / upcoming
  add TEXT [--under ID | --before ID | --after ID]
           [--due DATE] [--color C] [--header]
  set ID... [--text T] [--done | --open] [--due DATE|none]
            [--color C|none] [--header | --no-header]
  mv ID (--under ID | --before ID | --after ID)
  rm ID...                     remove items and everything nested under them
  undo                         restore the state before the last todo command

DATE: today, tomorrow, mon..sun, "oct 30", "30 oct", or YYYY-MM-DD
C:    red, peach, yellow, green, sky, blue, mauve`;

/** A user-facing error: printed without a stack trace. */
export class CliError extends Error {}

export type Result = { output: string; changed: boolean };

type Position = "before" | "after" | "child";

export function execute(argv: string[], state: AppState, today: Date): Result {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "ls": return ls(rest, state, today);
    case "agenda": return agenda(rest, state, today);
    case "add": return add(rest, state, today);
    case "set": return set(rest, state, today);
    case "mv": return mv(rest, state);
    case "rm": return rm(rest, state);
    default:
      throw new CliError(`unknown command "${cmd}"\n\n${USAGE}`);
  }
}

function parse<const T extends ParseArgsOptionsConfig>(args: string[], options: T) {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (e) {
    throw new CliError((e as Error).message);
  }
}

function ls(args: string[], state: AppState, today: Date): Result {
  const { values, positionals } = parse(args, {
    open: { type: "boolean" },
    json: { type: "boolean" },
  });
  const roots = positionals.length > 0
    ? positionals.map((id) => nodeAt(state.items, pathOf(state.items, id)))
    : state.items;
  if (values.json) return { output: JSON.stringify(roots, null, 2), changed: false };

  const lines: string[] = [];
  const walk = (nodes: Node[], depth: number): void => {
    for (const node of nodes) {
      if (values.open && node.done) continue;
      lines.push(formatRow(node, depth, today));
      walk(node.children, depth + 1);
    }
  };
  walk(roots, 0);
  return { output: lines.length > 0 ? lines.join("\n") : "(no todos)", changed: false };
}

function agenda(args: string[], state: AppState, today: Date): Result {
  const { values } = parse(args, { json: { type: "boolean" } });
  const groups = buildAgenda(state.items, today);
  if (values.json) {
    const ids = (entries: { node: Node }[]) => entries.map((e) => e.node);
    const out = { overdue: ids(groups.overdue), today: ids(groups.today), upcoming: ids(groups.upcoming) };
    return { output: JSON.stringify(out, null, 2), changed: false };
  }
  const lines: string[] = [];
  for (const [title, entries] of [
    ["Overdue", groups.overdue],
    ["Today", groups.today],
    ["Upcoming", groups.upcoming],
  ] as const) {
    if (entries.length === 0) continue;
    lines.push(title, ...entries.map((e) => "  " + formatRow(e.node, 0, today)));
  }
  return { output: lines.length > 0 ? lines.join("\n") : "(nothing dated)", changed: false };
}

function add(args: string[], state: AppState, today: Date): Result {
  const { values, positionals } = parse(args, {
    under: { type: "string" },
    before: { type: "string" },
    after: { type: "string" },
    due: { type: "string" },
    color: { type: "string" },
    header: { type: "boolean" },
  });
  const text = positionals.join(" ").trim();
  if (!text) throw new CliError("add needs the item's text");
  const placement = placementOf(values, false);

  const node = newNode(text);
  state.items.push(node);
  let path = [state.items.length - 1];
  if (placement) {
    path = moveNode(state.items, path, pathOf(state.items, placement.target), placement.position);
  }
  apply(() => {
    if (values.header) setHeader(state.items, path, true);
    if (values.due !== undefined) setDue(state.items, path, dateOf(values.due, today));
    if (values.color !== undefined) setColor(state.items, path, colorOf(values.color));
  });
  return { output: formatRow(node, 0, today), changed: true };
}

function set(args: string[], state: AppState, today: Date): Result {
  const { values, positionals: ids } = parse(args, {
    text: { type: "string" },
    done: { type: "boolean" },
    open: { type: "boolean" },
    due: { type: "string" },
    color: { type: "string" },
    header: { type: "boolean" },
    "no-header": { type: "boolean" },
  });
  if (ids.length === 0) throw new CliError("set needs at least one ID");
  if (values.done && values.open) throw new CliError("--done and --open contradict each other");
  if (values.header && values["no-header"]) throw new CliError("--header and --no-header contradict each other");
  if (values.text !== undefined && ids.length > 1) throw new CliError("--text takes exactly one ID");
  const changes = ["text", "done", "open", "due", "color", "header", "no-header"] as const;
  if (!changes.some((k) => values[k] !== undefined)) {
    throw new CliError("nothing to change: pass --text, --done, --open, --due, --color, --header or --no-header");
  }

  // Resolve every id (and value) before touching anything, so a bad one
  // leaves the state as it was.
  const paths = ids.map((id) => pathOf(state.items, id));
  const due = values.due !== undefined ? dateOf(values.due, today) : undefined;
  const color = values.color !== undefined ? colorOf(values.color) : undefined;

  apply(() => {
    for (const path of paths) {
      if (values.text !== undefined) setText(state.items, path, values.text);
      if (values.done) setDone(state.items, path, true);
      if (values.open) setDone(state.items, path, false);
      if (due !== undefined) setDue(state.items, path, due);
      if (color !== undefined) setColor(state.items, path, color);
      if (values.header) setHeader(state.items, path, true);
      if (values["no-header"]) setHeader(state.items, path, false);
    }
  });
  const rows = paths.map((p) => formatRow(nodeAt(state.items, p), 0, today));
  return { output: rows.join("\n"), changed: true };
}

function mv(args: string[], state: AppState): Result {
  const { values, positionals } = parse(args, {
    under: { type: "string" },
    before: { type: "string" },
    after: { type: "string" },
  });
  if (positionals.length !== 1) throw new CliError("mv takes exactly one ID to move");
  const placement = placementOf(values, true)!;
  const from = pathOf(state.items, positionals[0]);
  const to = pathOf(state.items, placement.target);

  if (to.length >= from.length && from.every((v, i) => v === to[i])) {
    throw new CliError("can't move an item into itself");
  }
  const lands = placement.position === "child" ? to.length + 1 : to.length;
  if (nodeAt(state.items, from).is_header && lands !== 1) {
    throw new CliError("headers stay at the root; use --before/--after a root item");
  }
  moveNode(state.items, from, to, placement.position);
  return { output: `moved ${positionals[0]}`, changed: true };
}

function rm(args: string[], state: AppState): Result {
  const { positionals: ids } = parse(args, {});
  if (ids.length === 0) throw new CliError("rm needs at least one ID");
  ids.forEach((id) => pathOf(state.items, id)); // all-or-nothing

  const lines = ids.map((id) => {
    // Re-resolve each time: earlier removals shift paths.
    const path = findPathById(state.items, id);
    if (!path) return `skipped ${id} (already removed with its parent)`;
    const node = nodeAt(state.items, path);
    deleteNode(state.items, path);
    const nested = countNested(node);
    return `removed ${id}  ${node.text}${nested > 0 ? `  (+${nested} nested)` : ""}`;
  });
  return { output: lines.join("\n"), changed: true };
}

// ---- helpers ---------------------------------------------------------------

function formatRow(node: Node, depth: number, today: Date): string {
  const marker = node.is_header ? "#" : node.done ? "[x]" : "[ ]";
  let row = `${node.id}  ${"  ".repeat(depth)}${marker} ${node.text}`;
  if (node.due) row += `  due ${node.due} (${dueStatus(node.due, today)})`;
  if (node.color) row += `  ${node.color}`;
  return row;
}

function pathOf(items: Node[], id: string): number[] {
  const path = findPathById(items, id);
  if (!path) throw new CliError(`no item with id "${id}" (see \`todo ls\`)`);
  return path;
}

function nodeAt(items: Node[], path: number[]): Node {
  const [parent, idx] = findParentAndIndex(items, path);
  return parent[idx];
}

function countNested(node: Node): number {
  return node.children.reduce((sum, c) => sum + 1 + countNested(c), 0);
}

function placementOf(
  values: { under?: string; before?: string; after?: string },
  required: boolean,
): { target: string; position: Position } | null {
  const given = (["under", "before", "after"] as const).filter((k) => values[k] !== undefined);
  if (given.length > 1 || (required && given.length === 0)) {
    throw new CliError("use one of --under, --before, --after");
  }
  if (given.length === 0) return null;
  const key = given[0];
  return { target: values[key]!, position: key === "under" ? "child" : key };
}

function dateOf(input: string, today: Date): string | null {
  if (input === "none") return null;
  const iso = parseDate(input, today);
  if (!iso) {
    throw new CliError(`can't parse date "${input}" (try today, tomorrow, fri, "oct 30", 2026-11-02, or none)`);
  }
  return iso;
}

function colorOf(input: string): string | null {
  return input === "none" ? null : input;
}

/** Run tree mutations, surfacing their validation errors as CliErrors. */
function apply(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    throw new CliError((e as Error).message);
  }
}
