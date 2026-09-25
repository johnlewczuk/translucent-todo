use crate::storage;
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn state_path(_app: &AppHandle) -> PathBuf {
    // ~/.local/share/translucent-todo/todos.json — fixed path matching
    // the GTK version so existing data carries over.
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".local/share/translucent-todo/todos.json")
}

#[tauri::command]
pub fn load_state(app: AppHandle) -> Result<Value, String> {
    let path = state_path(&app);
    storage::load_state(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_state(app: AppHandle, state: Value) -> Result<(), String> {
    let path = state_path(&app);
    storage::save_state(&path, &state).map_err(|e| e.to_string())
}

/// Minimize to the taskbar; clicking the taskbar entry restores it.
#[tauri::command]
pub fn minimize_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}
