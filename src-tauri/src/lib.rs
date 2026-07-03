mod commands;
mod config;
mod fs_watch;
mod ollama_client;
mod state;
pub mod graph;
pub mod models;
pub mod git;

use state::AppState;
use std::sync::{Arc, Mutex};
use tokio::sync::Mutex as TokioMutex;
use tauri::Manager;
use models::orchestrator::{ModelOrchestrator, ModelSlot, ModelRole, LoadState};
use std::time::Duration;

#[tauri::command]
fn start_watching_workspace(path: String, app_handle: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let watcher = fs_watch::start_watching(&path, app_handle).map_err(|e| e.to_string())?;
    let mut state_watcher = state.watcher.lock().unwrap();
    *state_watcher = Some(watcher);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let leaf_dir = std::path::Path::new(".leaf");
    if !leaf_dir.exists() {
        std::fs::create_dir_all(leaf_dir).expect("failed to create .leaf directory");
    }
    let db_path = leaf_dir.join("graph.db");
    let conn = rusqlite::Connection::open(&db_path).expect("failed to open graph.db");
    conn.pragma_update(None, "journal_mode", "WAL").expect("failed to set WAL mode");
    conn.pragma_update(None, "foreign_keys", "ON").expect("failed to set foreign keys");
    graph::schema::setup(&conn).expect("failed to setup schema");

    let graph_conn = Arc::new(TokioMutex::new(conn));

    let orchestrator = ModelOrchestrator {
        coder: ModelSlot {
            role: ModelRole::Coder,
            model_name: "ornith:latest".to_string(),
            load_state: LoadState::Unloaded,
            last_used: None,
            size_vram_bytes: None,
            expires_at: None,
        },
        reasoning: ModelSlot {
            role: ModelRole::Reasoning,
            model_name: "gemma4:latest".to_string(),
            load_state: LoadState::Unloaded,
            last_used: None,
            size_vram_bytes: None,
            expires_at: None,
        },
        active_role: None,
        idle_timeout: Duration::from_secs(300),
        ollama_base_url: "http://localhost:11434".to_string(),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_pty::init())
        .manage(AppState {
            watcher: Mutex::new(None),
            graph_conn,
            orchestrator: Arc::new(TokioMutex::new(orchestrator)),
            workspace_root: Mutex::new(None),
            cancel_flags: Arc::new(TokioMutex::new(std::collections::HashMap::new())),
        })
        .setup(|app| {
            let app_handle_idle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_secs(60));
                loop {
                    interval.tick().await;
                    let state = app_handle_idle.state::<AppState>();
                    let mut orchestrator = state.orchestrator.lock().await;
                    let client = reqwest::Client::new();
                    let base_url = orchestrator.ollama_base_url.clone();
                    if let Err(e) = orchestrator.idle_check(&client, &base_url).await {
                        eprintln!("idle check error: {}", e);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::load_workspace_config,
            config::save_workspace_config,
            commands::fs_commands::read_directory,
            commands::fs_commands::read_file,
            commands::fs_commands::write_file,
            commands::fs_commands::create_file,
            commands::fs_commands::create_dir,
            commands::fs_commands::rename_file,
            commands::fs_commands::delete_file,
            commands::model_commands::send_chat_message,
            commands::model_commands::preload_model,
            commands::model_commands::cancel_chat_message,
            commands::graph_commands::rebuild_index,
            commands::graph_commands::get_index_stats,
            commands::graph_commands::search_mentions,
            commands::graph_commands::get_full_graph,
            commands::git_commands::get_repo_status,
            commands::git_commands::has_uncommitted_changes,
            commands::git_commands::get_file_diff,
            commands::git_commands::get_file_head_content,
            commands::git_commands::stage_file,
            commands::git_commands::unstage_file,
            commands::git_commands::commit,
            commands::git_commands::git_clone,
            commands::workspace_commands::get_recent_workspaces,
            commands::workspace_commands::add_recent_workspace,
            commands::session_commands::list_sessions,
            commands::session_commands::get_session_messages,
            commands::session_commands::create_session,
            commands::session_commands::add_message,
            commands::session_commands::update_session_summary,
            start_watching_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
