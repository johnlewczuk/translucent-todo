// todos.json I/O for the CLI. Shares the file with the running overlay, so
// every read-modify-write happens under `<file>.lock`: a lock file created
// with O_EXCL, removed when done, and broken if older than STALE_MS (a
// crashed holder). src-tauri/src/storage.rs implements the same protocol.

import {
  openSync, closeSync, unlinkSync, statSync, readFileSync, writeFileSync,
  renameSync, copyFileSync, existsSync, mkdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { AppState } from "../src/lib/storage";
import { CliError } from "./commands";

const STALE_MS = 10_000;

/** Same fixed path the app uses (see src-tauri/src/commands.rs). */
export function dataFile(): string {
  return join(process.env.HOME ?? homedir(), ".local/share/translucent-todo/todos.json");
}

export function withLock<T>(file: string, fn: () => T, { timeoutMs = 3000 } = {}): T {
  const lock = file + ".lock";
  mkdirSync(dirname(file), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if (isStale(lock)) {
        try { unlinkSync(lock); } catch { /* another process broke it first */ }
        continue;
      }
      if (Date.now() > deadline) throw new CliError(`${file} is locked by another process (${lock})`);
      sleep(20);
    }
  }
  try {
    return fn();
  } finally {
    unlinkSync(lock);
  }
}

export function readState(file: string): AppState {
  if (!existsSync(file)) {
    throw new CliError(`no todos at ${file} yet; open translucent-todo once to create it`);
  }
  try {
    return JSON.parse(readFileSync(file, "utf8")) as AppState;
  } catch {
    throw new CliError(`${file} is not valid JSON; fix or restore it before using the CLI`);
  }
}

/** Atomic write (temp + rename), keeping the previous version for `undo`. */
export function writeState(file: string, state: AppState): void {
  if (existsSync(file)) copyFileSync(file, file + ".prev");
  writeFileSync(file + ".tmp", JSON.stringify(state, null, 2));
  renameSync(file + ".tmp", file);
}

export function undo(file: string): void {
  if (!existsSync(file + ".prev")) throw new CliError("nothing to undo");
  renameSync(file + ".prev", file);
}

function isStale(lock: string): boolean {
  try {
    return Date.now() - statSync(lock).mtimeMs > STALE_MS;
  } catch {
    return false; // vanished between open and stat: just retry
  }
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
