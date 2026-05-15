use serde_json::Value;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

pub fn default_state() -> Value {
    serde_json::json!({
        "window": { "x": 100, "y": 100, "w": 320, "h": 420, "mode": "expanded" },
        "mini_mode_enabled": true,
        "items": []
    })
}

pub fn load_state(path: &Path) -> Result<Value, StorageError> {
    if !path.exists() {
        return Ok(default_state());
    }
    let raw = fs::read_to_string(path)?;
    match serde_json::from_str::<Value>(&raw) {
        Ok(v) => Ok(v),
        Err(_) => {
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let backup = path.with_file_name(format!(
                "{}.broken-{}",
                path.file_name().unwrap().to_string_lossy(),
                ts
            ));
            fs::rename(path, &backup)?;
            eprintln!(
                "[translucent-todo] corrupted state at {:?}, backed up to {:?}",
                path, backup
            );
            Ok(default_state())
        }
    }
}

pub fn save_state(path: &Path, state: &Value) -> Result<(), StorageError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|s| s.to_str()).unwrap_or("")
    ));
    fs::write(&tmp, serde_json::to_string_pretty(state)?)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn load_missing_returns_default() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("todos.json");
        let s = load_state(&path).unwrap();
        assert_eq!(s, default_state());
    }

    #[test]
    fn save_then_load_roundtrip() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("todos.json");
        let state = serde_json::json!({
            "window": {"x": 1, "y": 2, "w": 3, "h": 4, "mode": "expanded"},
            "mini_mode_enabled": false,
            "items": [{"id": "abc", "text": "x", "done": false, "collapsed": false, "children": []}]
        });
        save_state(&path, &state).unwrap();
        assert_eq!(load_state(&path).unwrap(), state);
    }

    #[test]
    fn save_no_tmp_left_behind() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("todos.json");
        save_state(&path, &default_state()).unwrap();
        assert!(path.exists());
        let entries: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name())
            .collect();
        assert!(!entries
            .iter()
            .any(|n| n.to_string_lossy().contains(".tmp")));
    }

    #[test]
    fn corrupted_load_backs_up_and_returns_default() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("todos.json");
        fs::write(&path, "{not valid json").unwrap();
        let s = load_state(&path).unwrap();
        assert_eq!(s, default_state());
        let backups: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".broken-"))
            .collect();
        assert_eq!(backups.len(), 1);
    }

    #[test]
    fn save_creates_parent_dir() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("nested").join("dir").join("todos.json");
        save_state(&path, &default_state()).unwrap();
        assert!(path.exists());
    }
}
