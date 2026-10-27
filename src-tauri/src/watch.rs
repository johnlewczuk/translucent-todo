use crate::storage::Store;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// Emitted when todos.json changes under the app (e.g. the `todo` CLI); the
/// frontend reloads in response.
pub const TODOS_CHANGED: &str = "todos-changed";

/// Kept in managed state: dropping the watcher stops it.
pub struct TodosWatcher(#[allow(dead_code)] Mutex<RecommendedWatcher>);

/// Watch the data directory (not the file: atomic writes replace the file's
/// inode via rename) and emit TODOS_CHANGED for changes the app didn't make.
pub fn watch_todos(app: AppHandle) -> Result<TodosWatcher, Box<dyn std::error::Error>> {
    let path = app.state::<Store>().path.clone();
    let dir = path.parent().ok_or("todos path has no parent")?.to_path_buf();
    std::fs::create_dir_all(&dir)?;

    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if !event.paths.iter().any(|p| p == &path) {
            return;
        }
        if handle.state::<Store>().is_external_change() {
            let _ = handle.emit(TODOS_CHANGED, ());
        }
    })?;
    watcher.watch(&dir, RecursiveMode::NonRecursive)?;
    Ok(TodosWatcher(Mutex::new(watcher)))
}
