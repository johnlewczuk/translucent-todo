use crate::storage::Store;
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

/// ~/.local/share/translucent-todo/todos.json — fixed path matching the GTK
/// version so existing data carries over (and the `todo` CLI's cli/store.ts).
pub fn state_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".local/share/translucent-todo/todos.json")
}

#[tauri::command]
pub fn load_state(store: State<Store>) -> Result<Value, String> {
    store.load().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_state(store: State<Store>, state: Value) -> Result<(), String> {
    store.save(&state).map_err(|e| e.to_string())
}

/// Minimize to the taskbar; clicking the taskbar entry restores it.
#[tauri::command]
pub fn minimize_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}
