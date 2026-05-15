mod commands;
mod storage;

use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, PhysicalPosition};

/// Holds the window's last known outer position so we can restore it
/// after a tray hide/show round-trip (X11/Wayland WMs are free to
/// reposition windows between hide and show otherwise).
#[derive(Default)]
pub struct AppPosState {
  pub last_pos: Mutex<Option<PhysicalPosition<i32>>>,
}

fn restore_window(app: &tauri::AppHandle) {
  let pos = app
    .state::<AppPosState>()
    .last_pos
    .lock()
    .unwrap()
    .clone();
  if let Some(win) = app.get_webview_window("main") {
    let _ = win.show();
    let _ = win.unminimize();
    if let Some(p) = pos {
      let _ = win.set_position(p);
    }
    let _ = win.set_focus();
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AppPosState::default())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // System tray
      let icon = app.default_window_icon().cloned();
      eprintln!("[tray] default_window_icon present: {}", icon.is_some());
      if let Some(icon) = icon {
        let show_item = MenuItem::with_id(app, "show", "Show window", true, None::<&str>)?;
        let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

        match TrayIconBuilder::with_id("main-tray")
          .icon(icon)
          .tooltip("translucent-todo")
          .menu(&menu)
          .show_menu_on_left_click(false)
          .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => restore_window(app),
            "quit" => app.exit(0),
            _ => {}
          })
          .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
              button: MouseButton::Left,
              button_state: MouseButtonState::Up,
              ..
            } = event
            {
              restore_window(tray.app_handle());
            }
          })
          .build(app)
        {
          Ok(_) => eprintln!("[tray] icon built OK"),
          Err(e) => eprintln!("[tray] build FAILED: {:?}", e),
        }
      } else {
        eprintln!("[tray] no default_window_icon — skipping tray build");
      }

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::load_state,
      commands::save_state,
      commands::hide_to_tray,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
