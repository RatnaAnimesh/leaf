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

#[derive(serde::Serialize)]
pub struct MentionResult {
    pub label: String,
    pub kind: String, // "file" or symbol kind
    pub file_path: Option<String>,
}

#[tauri::command]
pub async fn search_mentions(query: String, state: State<'_, AppState>) -> Result<Vec<MentionResult>, String> {
    let conn = state.graph_conn.lock().await;
    let mut results = Vec::new();
    
    let like_query = format!("%{}%", query);

    // Search files
    let mut stmt = conn.prepare("SELECT path FROM files WHERE path LIKE ?1 LIMIT 5").map_err(|e| e.to_string())?;
    let mut file_rows = stmt.query([&like_query]).map_err(|e| e.to_string())?;
    while let Ok(Some(row)) = file_rows.next() {
        let path: String = row.get(0).unwrap_or_default();
        results.push(MentionResult {
            label: path.clone(),
            kind: "file".to_string(),
            file_path: Some(path),
        });
    }

    // Search symbols
    let mut stmt2 = conn.prepare("SELECT s.name, s.kind, f.path FROM symbols s JOIN files f ON s.file_id = f.id WHERE s.name LIKE ?1 LIMIT 10").map_err(|e| e.to_string())?;
    let mut symbol_rows = stmt2.query([&like_query]).map_err(|e| e.to_string())?;
    while let Ok(Some(row)) = symbol_rows.next() {
        let name: String = row.get(0).unwrap_or_default();
        let kind: String = row.get(1).unwrap_or_default();
        let path: String = row.get(2).unwrap_or_default();
        results.push(MentionResult {
            label: name,
            kind,
            file_path: Some(path),
        });
    }

    Ok(results)
}
