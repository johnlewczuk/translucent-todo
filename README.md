# translucent-todo

A translucent, frameless, always-on-top nested todo overlay for Linux/X11.

Single-file Python + GTK4. No build step, no install — just run.

## Run

    python3 todo.py

## Install dependencies (Debian / Ubuntu)

    sudo apt install python3-gi gir1.2-gtk-4.0 wmctrl

`wmctrl` is optional. Without it the window still works but is not always-on-top.

## Keyboard

| Key            | Action                            |
|----------------|-----------------------------------|
| Enter          | New sibling below                 |
| Tab            | Indent (under previous sibling)   |
| Shift+Tab      | Outdent                           |
| Space          | Toggle done                       |
| Delete         | Remove row + subtree              |
| Double-click   | Edit text                         |
| ← / →          | Collapse / expand                 |
| ↑ / ↓          | Move focus                        |

## Data

State is stored at `~/.local/share/translucent-todo/todos.json`. Writes are
atomic (temp file + rename), so a crash mid-write cannot corrupt the file.

If `todos.json` ever fails to parse, it is renamed to
`todos.json.broken-<timestamp>` and a fresh empty state is created. Your
data is preserved for recovery; nothing is ever deleted.

## Tests

    .venv/bin/python3 -m pytest

Pure tree-mutation logic and persistence are unit-tested without GTK.
