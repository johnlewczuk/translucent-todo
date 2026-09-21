# translucent-todo

A translucent, frameless, always-on-top nested todo overlay for Linux.

Built with Tauri 2 + Svelte 5. Distributes as a single ~4 MB binary.

## Install

### From source

System dependencies (Ubuntu / Debian):

    sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
      libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

Plus a Rust toolchain (`rustup`) and Node 20+. Then:

    npm install
    npm run tauri build

The binary lands at `src-tauri/target/release/translucent-todo`.
A `.deb` and `.AppImage` are also produced under `src-tauri/target/release/bundle/`.

### Run

    src-tauri/target/release/translucent-todo

Or install the `.deb` via `sudo dpkg -i ...` and launch from your app menu.

## Keyboard

| Key            | Action                            |
|----------------|-----------------------------------|
| Enter          | New sibling below                 |
| Tab            | Indent (under previous sibling)   |
| Shift+Tab      | Outdent                           |
| Space          | Toggle done                       |
| Delete         | Remove row + subtree              |
| C / Shift+C    | Cycle text colour fwd / back      |
| Double-click   | Edit text                         |
| F2             | Edit text                         |
| ↑ / ↓          | Move focus                        |
| Esc            | Cancel edit / cancel drag         |
| Ctrl+M         | Toggle pill mode                  |

## Drag

- Drag the **⋮⋮ grip** on the left of a row to reorder.
- Drop on the row's top third → insert before.
- Drop on the bottom third → insert after.
- Drop on the middle → become a child of that row (parent auto-expands).

## Data

State is stored at `~/.local/share/translucent-todo/todos.json`. Writes are
atomic. If the file ever fails to parse it is renamed to
`todos.json.broken-<timestamp>` and a fresh empty state is created — your
data is preserved for recovery; nothing is ever deleted.

## Legacy GTK version

The original GTK4 + Python implementation lives in [`legacy-gtk/`](legacy-gtk/).
It remains runnable for reference.

## Tests

    npm test                                # Vitest: tree, dates, agenda, release scripts
    cd src-tauri && cargo test --lib        # Rust storage suite


## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
This is not bookkeeping for its own sake — the release scripts read these
messages to decide the next version number, so the prefix you write *is* the
version bump.

    <type>[optional scope][!]: <description>

    [optional body]

    [optional BREAKING CHANGE: <what broke>]

| Type       | Meaning                                        | Version effect |
|------------|------------------------------------------------|----------------|
| `feat`     | New user-visible capability                     | minor          |
| `fix`      | Bug fix                                         | patch          |
| `perf`     | Faster or lighter, same behaviour               | patch          |
| `refactor` | Restructuring with no behaviour change          | none           |
| `docs`     | Documentation only                              | none           |
| `test`     | Tests only                                      | none           |
| `build`    | Build system, bundling, dependencies            | none           |
| `chore`    | Housekeeping                                    | none           |
| `style`    | Formatting, whitespace                          | none           |

A `!` after the type (or a `BREAKING CHANGE:` footer) marks a breaking change.

Examples:

    feat(agenda): group dated items by due status
    fix: keep the cursor in the input when Tab is pressed while editing
    perf: memoize the agenda grouping
    docs: document the release scripts

    feat(storage)!: move todos.json under XDG_STATE_HOME

    BREAKING CHANGE: existing todos.json must be moved by hand from
    ~/.local/share/translucent-todo/ to ~/.local/state/translucent-todo/.

Only the **first line** is parsed for the type, so a body may mention `feat:`
in prose without triggering a bump. Commits with no recognised type are
ignored by the release scripts.

## Releasing

Three scripts, each the previous one plus a step:

    npm run release:version     # decide version -> stamp manifests -> commit -> tag
    npm run release             # ...and then `npm run tauri build`
    npm run release:install     # ...and then `sudo dpkg -i` the built .deb

Flags pass through (note the `--` npm needs):

    npm run release:version -- --dry-run              # print the decision, change nothing
    npm run release:version -- --release-as 1.0.0     # override the computed version

What `release:version` does:

1. Refuses to run if tracked files are dirty, or if `HEAD` is already tagged.
2. Reads every commit since the last `v*` tag (or the whole history if there
   is no tag yet) and takes the largest bump any of them calls for. No
   `feat`/`fix`/`perf`/breaking commit means nothing to release — it exits
   without tagging.
3. Writes the new version into all four manifests that carry it:
   `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the
   `app` entry in `src-tauri/Cargo.lock`.
4. Commits that as `chore(release): vX.Y.Z` and creates an annotated tag
   `vX.Y.Z` whose message is the grouped release notes.

**Below 1.0.0, a breaking change bumps the minor**, not the major — semver
makes no stability promise for `0.x`. Reaching `1.0.0` is a deliberate act:
`--release-as 1.0.0`.

The bump rules and the manifest edits are pure functions in
[`scripts/semver.mjs`](scripts/semver.mjs) and
[`scripts/manifests.mjs`](scripts/manifests.mjs), covered by the Vitest suite
along with the shell scripts themselves.
