"""Pure tree-mutation logic. No GTK imports — testable in isolation."""
import json
import secrets


def new_node(text: str = "") -> dict:
    return {
        "id": secrets.token_hex(3),  # 6 hex chars
        "text": text,
        "done": False,
        "collapsed": False,
        "children": [],
    }


def serialize(items: list[dict]) -> str:
    return json.dumps(items, indent=2)


def deserialize(s: str) -> list[dict]:
    if not s:
        return []
    return json.loads(s)


def find_parent_and_index(items: list[dict], path: list[int]) -> tuple[list[dict], int]:
    """Return the list containing the node at `path` and the node's index in that list."""
    assert path, "path must be non-empty"
    current = items
    for i in path[:-1]:
        current = current[i]["children"]
    return current, path[-1]


def add_sibling_after(items: list[dict], path: list[int], text: str = "") -> list[int]:
    """Insert a new empty node immediately after the node at `path`. Returns new node's path."""
    parent, idx = find_parent_and_index(items, path)
    parent.insert(idx + 1, new_node(text))
    return path[:-1] + [idx + 1]


def indent(items: list[dict], path: list[int]) -> list[int] | None:
    """Move node at `path` to become the last child of its previous sibling.
    Returns new path, or None if no previous sibling exists."""
    parent, idx = find_parent_and_index(items, path)
    if idx == 0:
        return None
    node = parent.pop(idx)
    new_parent = parent[idx - 1]
    new_parent["collapsed"] = False  # auto-expand so the move is visible
    new_parent["children"].append(node)
    return path[:-1] + [idx - 1, len(new_parent["children"]) - 1]


def outdent(items: list[dict], path: list[int]) -> list[int] | None:
    """Move node at `path` to become the next sibling of its parent.
    Returns new path, or None if already at root."""
    if len(path) < 2:
        return None
    parent, idx = find_parent_and_index(items, path)
    grandparent, parent_idx = find_parent_and_index(items, path[:-1])
    node = parent.pop(idx)
    grandparent.insert(parent_idx + 1, node)
    return path[:-2] + [parent_idx + 1]
