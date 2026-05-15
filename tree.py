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
