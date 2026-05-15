use crate::storage;
use crate::AppPosState;
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

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

/// Save current window outer position, then hide. The tray-click handler
/// restores the saved position before showing the window again so the
/// window-manager can't relocate the overlay between hide / show.
#[tauri::command]
pub fn hide_to_tray(app: AppHandle, pos_state: State<AppPosState>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        if let Ok(pos) = win.outer_position() {
            *pos_state.last_pos.lock().unwrap() = Some(pos);
        }
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
