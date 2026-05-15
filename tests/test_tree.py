import json
from tree import new_node, serialize, deserialize


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
