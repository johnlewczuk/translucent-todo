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

from tree import indent


def test_indent_with_previous_sibling():
    items = [new_node("a"), new_node("b")]
    new_path = indent(items, [1])
    assert new_path == [0, 0]
    assert len(items) == 1
    assert items[0]["children"][0]["text"] == "b"


def test_indent_no_previous_sibling_returns_none():
    items = [new_node("a")]
    assert indent(items, [0]) is None
    assert len(items) == 1  # unchanged


def test_indent_preserves_subtree_and_collapsed_state():
    items = [new_node("a"), new_node("b")]
    items[1]["collapsed"] = True
    items[1]["children"].append(new_node("b.0"))
    indent(items, [1])
    moved = items[0]["children"][0]
    assert moved["text"] == "b"
    assert moved["collapsed"] is True
    assert moved["children"][0]["text"] == "b.0"


def test_indent_auto_expands_new_parent():
    items = [new_node("a"), new_node("b")]
    items[0]["collapsed"] = True
    indent(items, [1])
    assert items[0]["collapsed"] is False


from tree import outdent


def test_outdent_one_level():
    items = [new_node("a")]
    items[0]["children"].append(new_node("a.0"))
    new_path = outdent(items, [0, 0])
    assert new_path == [1]
    assert items[0]["children"] == []
    assert items[1]["text"] == "a.0"


def test_outdent_at_root_returns_none():
    items = [new_node("a")]
    assert outdent(items, [0]) is None
    assert len(items) == 1


def test_outdent_preserves_subtree():
    items = [new_node("a")]
    items[0]["children"].append(new_node("a.0"))
    items[0]["children"][0]["children"].append(new_node("a.0.0"))
    outdent(items, [0, 0])
    assert items[1]["children"][0]["text"] == "a.0.0"


def test_outdent_inserts_after_parent_not_at_end():
    items = [new_node("a"), new_node("b")]
    items[0]["children"].append(new_node("a.0"))
    outdent(items, [0, 0])
    assert [n["text"] for n in items] == ["a", "a.0", "b"]


from tree import delete, toggle_done, toggle_collapsed, set_text


def test_delete_removes_node_and_subtree():
    items = [new_node("a"), new_node("b")]
    items[0]["children"].append(new_node("a.0"))
    delete(items, [0])
    assert len(items) == 1
    assert items[0]["text"] == "b"


def test_delete_returns_focus_path_to_previous_sibling():
    items = [new_node("a"), new_node("b")]
    new_path = delete(items, [1])
    assert new_path == [0]


def test_delete_first_child_returns_parent_path():
    items = [new_node("a")]
    items[0]["children"].append(new_node("a.0"))
    new_path = delete(items, [0, 0])
    assert new_path == [0]


def test_delete_only_root_returns_none():
    items = [new_node("a")]
    new_path = delete(items, [0])
    assert new_path is None
    assert items == []


def test_toggle_done():
    items = [new_node("a")]
    toggle_done(items, [0])
    assert items[0]["done"] is True
    toggle_done(items, [0])
    assert items[0]["done"] is False


def test_toggle_collapsed():
    items = [new_node("a")]
    toggle_collapsed(items, [0])
    assert items[0]["collapsed"] is True


def test_set_text():
    items = [new_node("a")]
    set_text(items, [0], "renamed")
    assert items[0]["text"] == "renamed"
