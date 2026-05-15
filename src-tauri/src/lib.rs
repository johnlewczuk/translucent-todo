mod commands;
mod storage;

use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // System tray: clicking the icon shows + focuses the main window.
      let icon = app
        .default_window_icon()
        .cloned()
        .expect("missing default window icon");
      TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("translucent-todo")
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            let app = tray.app_handle();
            if let Some(win) = app.get_webview_window("main") {
              let _ = win.show();
              let _ = win.unminimize();
              let _ = win.set_focus();
            }
          }
        })
        .build(app)?;

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::load_state,
      commands::save_state,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
