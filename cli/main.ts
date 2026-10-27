// Wires the pure commands to the shared data file: lock, read, execute,
// write only if something changed. `help` and `undo` are handled here since
// neither operates on the tree.

import { execute, CliError, USAGE } from "./commands";
import { dataFile, withLock, readState, writeState, undo } from "./store";

export type IO = { out: (s: string) => void; err: (s: string) => void };

export function main(argv: string[], io: IO, file: string = dataFile()): number {
  const cmd = argv[0];
  try {
    if (cmd === undefined || cmd === "help" || cmd === "--help" || cmd === "-h") {
      io.out(USAGE);
    } else if (cmd === "undo") {
      withLock(file, () => undo(file));
      io.out("restored the state from before the last todo command");
    } else {
      io.out(withLock(file, () => {
        const state = readState(file);
        const result = execute(argv, state, new Date());
        if (result.changed) writeState(file, state);
        return result.output;
      }));
    }
    return 0;
  } catch (e) {
    if (!(e instanceof CliError)) throw e;
    io.err(`todo: ${e.message}`);
    return 1;
  }
}
