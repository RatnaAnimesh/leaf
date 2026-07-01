use tauri::State;
use crate::state::AppState;
use ignore::WalkBuilder;
use std::fs;
use crate::graph::index_file;

#[derive(serde::Serialize)]
pub struct IndexStats {
    pub total_files: usize,
    pub total_symbols: usize,
}

#[tauri::command]
pub async fn rebuild_index(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut builder = WalkBuilder::new(&path);
    builder.hidden(false);
    
    // Do it inline for simplicity for now, but we should probably spawn it and emit events.
    // Spec says: "Expose rebuild_index which performs a full ignore::WalkBuilder traversal... emitting progress updates."
    // Let's implement the basic version first that blocks the command until done, or spawn it.
    
    let graph_conn = state.graph_conn.clone();
    let path_clone = path.clone();
    
    tokio::spawn(async move {
        // Find all rust/python files
        let mut files_to_index = Vec::new();
        let mut builder = WalkBuilder::new(&path_clone);
        builder.hidden(false);
        for result in builder.build() {
            if let Ok(entry) = result {
                if !entry.path().is_dir() {
                    let ext = entry.path().extension().and_then(|e| e.to_str()).unwrap_or("");
                    if ext == "rs" || ext == "py" {
                        files_to_index.push(entry.path().to_string_lossy().into_owned());
                    }
                }
            }
        }
        
        for file_path in files_to_index {
            if let Ok(content) = fs::read_to_string(&file_path) {
                let ext = std::path::Path::new(&file_path).extension().and_then(|e| e.to_str()).unwrap_or("");
                let lang = if ext == "rs" { "rust" } else { "python" };
                // CRITICAL: We cannot hold a non-Send rusqlite::Connection across await points.
                // We lock, perform the synchronous rusqlite work (index_file), and drop the lock
                // *before* any await point.
                
                let conn_guard = graph_conn.lock().await;
                let _ = index_file(&conn_guard, &file_path, &content, lang);
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn get_index_stats(state: State<'_, AppState>) -> Result<IndexStats, String> {
    let conn = state.graph_conn.lock().await;
    let total_files: usize = conn.query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0)).unwrap_or(0);
    let total_symbols: usize = conn.query_row("SELECT COUNT(*) FROM symbols", [], |row| row.get(0)).unwrap_or(0);
    
    Ok(IndexStats {
        total_files,
        total_symbols,
    })
}
