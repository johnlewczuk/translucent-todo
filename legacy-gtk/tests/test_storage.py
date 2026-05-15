import json
import os
from pathlib import Path
from storage import load_state, save_state, DEFAULT_STATE


def test_load_missing_file_returns_default(tmp_path):
    path = tmp_path / "todos.json"
    state = load_state(path)
    assert state == DEFAULT_STATE


def test_save_then_load_roundtrip(tmp_path):
    path = tmp_path / "todos.json"
    state = {"window": {"x": 1, "y": 2, "w": 3, "h": 4}, "items": [{"id": "abc", "text": "x"}]}
    save_state(path, state)
    assert load_state(path) == state


def test_save_is_atomic_no_tmp_left_behind(tmp_path):
    path = tmp_path / "todos.json"
    save_state(path, {"window": {}, "items": []})
    assert path.exists()
    assert not (tmp_path / "todos.json.tmp").exists()


def test_load_corrupted_file_backs_up_and_returns_default(tmp_path):
    path = tmp_path / "todos.json"
    path.write_text("{not valid json")
    state = load_state(path)
    assert state == DEFAULT_STATE
    backups = list(tmp_path.glob("todos.json.broken-*"))
    assert len(backups) == 1
    assert backups[0].read_text() == "{not valid json"


def test_save_creates_parent_dir(tmp_path):
    path = tmp_path / "nested" / "dir" / "todos.json"
    save_state(path, {"window": {}, "items": []})
    assert path.exists()
