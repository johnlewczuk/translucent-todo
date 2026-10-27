use serde_json::Value;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    // The frontend matches on this prefix (src/lib/storage.ts CONFLICT).
    #[error("conflict: todos.json changed on disk since it was last loaded")]
    Conflict,
    #[error("todos.json is locked by another process")]
    Locked,
}

/// A lock older than this belongs to a crashed holder and is broken.
const LOCK_STALE: Duration = Duration::from_secs(10);
const LOCK_TIMEOUT: Duration = Duration::from_secs(3);

/// Run `f` while holding `<path>.lock`: a file created with O_EXCL and
/// removed afterwards. Same protocol as the `todo` CLI (cli/store.ts), so the
/// two never interleave a read-modify-write.
pub fn with_lock<T>(
    path: &Path,
    timeout: Duration,
    f: impl FnOnce() -> Result<T, StorageError>,
) -> Result<T, StorageError> {
    let lock = path.with_file_name(format!(
        "{}.lock",
        path.file_name().unwrap().to_string_lossy()
    ));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let deadline = SystemTime::now() + timeout;
    loop {
        match fs::OpenOptions::new().write(true).create_new(true).open(&lock) {
            Ok(_) => break,
            Err(e) if e.kind() == ErrorKind::AlreadyExists => {
                let stale = fs::metadata(&lock)
                    .and_then(|m| m.modified())
                    .map(|t| t.elapsed().unwrap_or_default() > LOCK_STALE)
                    .unwrap_or(false);
                if stale {
                    let _ = fs::remove_file(&lock); // another process may beat us to it
                    continue;
                }
                if SystemTime::now() > deadline {
                    return Err(StorageError::Locked);
                }
                thread::sleep(Duration::from_millis(20));
            }
            Err(e) => return Err(e.into()),
        }
    }
    let result = f();
    let _ = fs::remove_file(&lock);
    result
}

/// The app's handle on todos.json. Remembers the exact contents it last
/// loaded or saved, so it can tell its own writes from outside ones (the
/// `todo` CLI) and refuse to save over an outside change it hasn't seen.
pub struct Store {
    pub path: PathBuf,
    last_seen: Mutex<Option<String>>,
}

impl Store {
    pub fn new(path: PathBuf) -> Self {
        Store { path, last_seen: Mutex::new(None) }
    }

    pub fn load(&self) -> Result<Value, StorageError> {
        let mut last_seen = self.last_seen.lock().unwrap();
        with_lock(&self.path, LOCK_TIMEOUT, || {
            let state = load_state(&self.path)?;
            *last_seen = read_raw(&self.path)?;
            Ok(state)
        })
    }

    pub fn save(&self, state: &Value) -> Result<(), StorageError> {
        // Held across the write so the watcher can't observe the new file
        // before `last_seen` records it (and mistake it for an outside change).
        let mut last_seen = self.last_seen.lock().unwrap();
        with_lock(&self.path, LOCK_TIMEOUT, || {
            if read_raw(&self.path)? != *last_seen {
                return Err(StorageError::Conflict);
            }
            *last_seen = Some(save_state(&self.path, state)?);
            Ok(())
        })
    }

    /// True when the file no longer matches what this app last loaded/saved.
    pub fn is_external_change(&self) -> bool {
        let last_seen = self.last_seen.lock().unwrap();
        read_raw(&self.path).map_or(false, |raw| raw != *last_seen)
    }
}

fn read_raw(path: &Path) -> Result<Option<String>, StorageError> {
    match fs::read_to_string(path) {
        Ok(raw) => Ok(Some(raw)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
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

/// Atomically write `state`, returning the exact contents written.
pub fn save_state(path: &Path, state: &Value) -> Result<String, StorageError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|s| s.to_str()).unwrap_or("")
    ));
    let raw = serde_json::to_string_pretty(state)?;
    fs::write(&tmp, &raw)?;
    fs::rename(&tmp, path)?;
    Ok(raw)
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

    fn todos(text: &str) -> Value {
        serde_json::json!({ "items": [{ "id": "aaaaaa", "text": text, "done": false, "collapsed": false, "children": [] }] })
    }

    #[test]
    fn store_save_after_load_succeeds() {
        let dir = tempdir().unwrap();
        let store = Store::new(dir.path().join("todos.json"));
        store.load().unwrap();
        store.save(&todos("a")).unwrap();
        store.save(&todos("b")).unwrap();
        assert_eq!(load_state(&store.path).unwrap(), todos("b"));
    }

    #[test]
    fn store_save_refuses_to_overwrite_an_outside_change() {
        let dir = tempdir().unwrap();
        let store = Store::new(dir.path().join("todos.json"));
        store.save(&todos("app")).unwrap();
        fs::write(&store.path, serde_json::to_string(&todos("cli")).unwrap()).unwrap();
        assert!(matches!(store.save(&todos("app2")), Err(StorageError::Conflict)));
        assert_eq!(load_state(&store.path).unwrap(), todos("cli"));
    }

    #[test]
    fn store_load_absorbs_an_outside_change() {
        let dir = tempdir().unwrap();
        let store = Store::new(dir.path().join("todos.json"));
        store.save(&todos("app")).unwrap();
        fs::write(&store.path, serde_json::to_string(&todos("cli")).unwrap()).unwrap();
        assert!(store.is_external_change());
        assert_eq!(store.load().unwrap(), todos("cli"));
        assert!(!store.is_external_change());
        store.save(&todos("app2")).unwrap();
    }

    #[test]
    fn store_own_save_is_not_an_external_change() {
        let dir = tempdir().unwrap();
        let store = Store::new(dir.path().join("todos.json"));
        store.save(&todos("app")).unwrap();
        assert!(!store.is_external_change());
    }

    #[test]
    fn lock_is_released_after_use() {
        let dir = tempdir().unwrap();
        let store = Store::new(dir.path().join("todos.json"));
        store.save(&todos("a")).unwrap();
        assert!(!dir.path().join("todos.json.lock").exists());
    }

    #[test]
    fn lock_waits_for_a_fresh_holder_then_times_out() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("todos.json");
        fs::write(dir.path().join("todos.json.lock"), "").unwrap();
        let r = with_lock(&path, Duration::from_millis(50), || Ok(()));
        assert!(matches!(r, Err(StorageError::Locked)));
    }

    #[test]
    fn lock_breaks_a_stale_holder() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("todos.json");
        let lock = dir.path().join("todos.json.lock");
        fs::write(&lock, "").unwrap();
        let old = SystemTime::now() - Duration::from_secs(60);
        fs::File::options().write(true).open(&lock).unwrap().set_modified(old).unwrap();
        assert!(with_lock(&path, Duration::from_millis(50), || Ok(())).is_ok());
    }

    #[test]
    fn save_creates_parent_dir() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("nested").join("dir").join("todos.json");
        save_state(&path, &default_state()).unwrap();
        assert!(path.exists());
    }
}
