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

    npm test                                # Vitest, tree-mutation suite (30 tests)
    cd src-tauri && cargo test --lib        # Rust storage suite (5 tests)
