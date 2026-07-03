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
        // By default, WalkBuilder respects .gitignore and hidden files (hidden(true) is default)
        builder.filter_entry(|e| {
            let path = e.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if path.is_dir() {
                // Ignore common dependency and build directories
                if matches!(name, "node_modules" | "target" | "dist" | "build" | "__pycache__" | ".venv" | "venv" | "env" | ".env") {
                    return false;
                }
            }
            true
        });
        
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
                
                let conn_guard = graph_conn.lock().await;
                
                // Clear old files for this exact file path to ensure freshness
                let _ = conn_guard.execute("DELETE FROM files WHERE path = ?1", [&file_path]);

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

#[derive(serde::Serialize)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    pub group: String,
    pub kind: Option<String>,
}

#[derive(serde::Serialize)]
pub struct GraphLink {
    pub source: String,
    pub target: String,
    pub label: String,
}

#[derive(serde::Serialize)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub links: Vec<GraphLink>,
}

#[tauri::command]
pub async fn get_full_graph(workspace_root: String, state: State<'_, AppState>) -> Result<GraphData, String> {
    let conn = state.graph_conn.lock().await;
    let mut nodes = Vec::new();
    let mut links = Vec::new();

    let pattern = format!("{}%", workspace_root);

    // 1. Fetch Files
    let mut stmt = conn.prepare("SELECT id, path FROM files WHERE path LIKE ?1").map_err(|e| e.to_string())?;
    let mut file_rows = stmt.query([&pattern]).map_err(|e| e.to_string())?;
    while let Ok(Some(row)) = file_rows.next() {
        let id: i64 = row.get(0).unwrap_or(0);
        let path: String = row.get(1).unwrap_or_default();
        let basename = std::path::Path::new(&path).file_name().and_then(|n| n.to_str()).unwrap_or(&path).to_string();
        nodes.push(GraphNode {
            id: format!("file_{}", id),
            label: basename,
            group: "file".to_string(),
            kind: None,
        });
    }

    // 2. Fetch Symbols
    let mut stmt = conn.prepare("SELECT id, file_id, name, kind FROM symbols WHERE file_id IN (SELECT id FROM files WHERE path LIKE ?1)").map_err(|e| e.to_string())?;
    let mut sym_rows = stmt.query([&pattern]).map_err(|e| e.to_string())?;
    while let Ok(Some(row)) = sym_rows.next() {
        let id: i64 = row.get(0).unwrap_or(0);
        let file_id: i64 = row.get(1).unwrap_or(0);
        let name: String = row.get(2).unwrap_or_default();
        let kind: String = row.get(3).unwrap_or_default();
        
        nodes.push(GraphNode {
            id: format!("sym_{}", id),
            label: name,
            group: "symbol".to_string(),
            kind: Some(kind),
        });

        // Implicit edge from file to symbol
        links.push(GraphLink {
            source: format!("file_{}", file_id),
            target: format!("sym_{}", id),
            label: "contains".to_string(),
        });
    }

    // 3. Fetch Edges
    let mut stmt = conn.prepare("SELECT from_symbol_id, to_symbol_id, edge_type FROM edges WHERE to_symbol_id IS NOT NULL AND from_symbol_id IN (SELECT id FROM symbols WHERE file_id IN (SELECT id FROM files WHERE path LIKE ?1))").map_err(|e| e.to_string())?;
    let mut edge_rows = stmt.query([&pattern]).map_err(|e| e.to_string())?;
    while let Ok(Some(row)) = edge_rows.next() {
        let from_id: i64 = row.get(0).unwrap_or(0);
        let to_id: i64 = row.get(1).unwrap_or(0);
        let edge_type: String = row.get(2).unwrap_or_default();
        
        links.push(GraphLink {
            source: format!("sym_{}", from_id),
            target: format!("sym_{}", to_id),
            label: edge_type,
        });
    }

    Ok(GraphData { nodes, links })
}
