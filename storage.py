"""Atomic JSON persistence with corruption backup. No GTK dependency."""
import json
import os
import sys
import time
from pathlib import Path

DEFAULT_STATE = {
    "window": {"x": 100, "y": 100, "w": 320, "h": 500},
    "items": [],
}


def load_state(path: Path) -> dict:
    """Load state from JSON. Returns DEFAULT_STATE if missing.
    If file exists but is unparseable, back it up to todos.json.broken-<ts>
    (per user rule: never delete data) and return DEFAULT_STATE."""
    if not path.exists():
        return dict(DEFAULT_STATE, items=[])
    raw = path.read_text()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        backup = path.with_name(f"{path.name}.broken-{int(time.time())}")
        path.rename(backup)
        print(f"[translucent-todo] corrupted state at {path}, "
              f"backed up to {backup}", file=sys.stderr)
        return dict(DEFAULT_STATE, items=[])


def save_state(path: Path, state: dict) -> None:
    """Atomic write: write to .tmp then os.replace onto target."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    os.replace(tmp, path)
