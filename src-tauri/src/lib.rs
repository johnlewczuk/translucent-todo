mod commands;
mod storage;
mod watch;

use storage::Store;
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

      app.manage(Store::new(commands::state_path()));
      let watcher = watch::watch_todos(app.handle().clone())?;
      app.manage(watcher);

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::load_state,
      commands::save_state,
      commands::minimize_window,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
