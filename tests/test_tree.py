import json
from tree import new_node, serialize, deserialize
from tree import find_parent_and_index, add_sibling_after


def test_new_node_has_required_fields():
    n = new_node("buy milk")
    assert n["text"] == "buy milk"
    assert n["done"] is False
    assert n["collapsed"] is False
    assert n["children"] == []
    assert isinstance(n["id"], str) and len(n["id"]) == 6


def test_new_node_ids_are_unique():
    ids = {new_node("x")["id"] for _ in range(1000)}
    assert len(ids) == 1000


def test_serialize_deserialize_roundtrip():
    a = new_node("root")
    a["children"].append(new_node("child"))
    a["children"][0]["children"].append(new_node("grandchild"))
    s = serialize([a])
    assert json.loads(s)  # valid JSON
    back = deserialize(s)
    assert back == [a]


def test_deserialize_empty_string_returns_empty_list():
    assert deserialize("") == []


def test_find_parent_and_index_root_level():
    items = [new_node("a"), new_node("b")]
    parent, idx = find_parent_and_index(items, [1])
    assert parent is items
    assert idx == 1


def test_find_parent_and_index_nested():
    items = [new_node("a")]
    items[0]["children"].append(new_node("a.0"))
    items[0]["children"].append(new_node("a.1"))
    parent, idx = find_parent_and_index(items, [0, 1])
    assert parent is items[0]["children"]
    assert idx == 1


def test_add_sibling_after_root():
    items = [new_node("a")]
    new_path = add_sibling_after(items, [0], "b")
    assert len(items) == 2
    assert items[1]["text"] == "b"
    assert new_path == [1]


def test_add_sibling_after_nested():
    items = [new_node("a")]
    items[0]["children"].append(new_node("a.0"))
    new_path = add_sibling_after(items, [0, 0], "a.1")
    assert len(items[0]["children"]) == 2
    assert items[0]["children"][1]["text"] == "a.1"
    assert new_path == [0, 1]
