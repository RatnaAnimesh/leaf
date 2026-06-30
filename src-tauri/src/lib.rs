mod commands;
mod config;
mod fs_watch;
mod ollama_client;
mod state;

use state::AppState;
use std::sync::Mutex;

#[tauri::command]
fn start_watching_workspace(path: String, app_handle: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let watcher = fs_watch::start_watching(&path, app_handle).map_err(|e| e.to_string())?;
    let mut state_watcher = state.watcher.lock().unwrap();
    *state_watcher = Some(watcher);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(AppState {
            watcher: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            config::load_workspace_config,
            config::save_workspace_config,
            commands::fs_commands::read_directory,
            commands::fs_commands::read_file,
            commands::fs_commands::write_file,
            commands::model_commands::send_chat_message,
            start_watching_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
