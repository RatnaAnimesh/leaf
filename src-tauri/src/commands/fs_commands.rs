use ignore::WalkBuilder;
use std::fs;
use tauri::State;
use crate::state::AppState;
use crate::graph::index_file;

#[derive(serde::Serialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

#[derive(serde::Serialize)]
pub struct ReadDirectoryResult {
    pub nodes: Vec<FileNode>,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub async fn read_directory(path: String) -> Result<ReadDirectoryResult, String> {
    let mut builder = WalkBuilder::new(&path);
    builder.max_depth(Some(1)).hidden(false);
    
    // Explicitly filter out noise directories/files from the File Explorer
    builder.filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        !matches!(name.as_ref(), ".leaf" | ".git" | ".DS_Store" | ".venv" | "__pycache__" | "node_modules" | "target")
    });

    let mut nodes = Vec::new();
    let mut warnings = Vec::new();
    let root_path = std::path::Path::new(&path);

    for result in builder.build() {
        match result {
            Ok(entry) => {
                let entry_path = entry.path();
                // Filter out the root entry itself (depth 0)
                if entry_path == root_path {
                    continue;
                }

                let is_dir = entry_path.is_dir();
                let name = entry
                    .file_name()
                    .to_string_lossy()
                    .into_owned();
                
                nodes.push(FileNode {
                    name,
                    path: entry_path.to_string_lossy().into_owned(),
                    is_dir,
                    children: None,
                });
            }
            Err(err) => {
                warnings.push(format!("Error reading directory entry: {}", err));
            }
        }
    }

    // Sort: directories first, then files, both alphabetically
    nodes.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name))
    });

    Ok(ReadDirectoryResult { nodes, warnings })
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    let meta = fs::metadata(&path).map_err(|e| format!("Failed to read metadata for {}: {}", path, e))?;
    if meta.len() > 5 * 1024 * 1024 {
        return Err(format!("File {} is too large (over 5MB limit).", path));
    }
    
    let content_bytes = fs::read(&path).map_err(|e| format!("Failed to read file bytes {}: {}", path, e))?;
    
    if content_inspector::inspect(&content_bytes).is_binary() {
        return Err(format!("File {} appears to be binary and cannot be opened.", path));
    }
    
    String::from_utf8(content_bytes).map_err(|e| format!("File {} contains invalid UTF-8: {}", path, e))
}

#[tauri::command]
pub async fn write_file(path: String, content: String, state: State<'_, AppState>) -> Result<(), String> {
    let tmp_path = format!("{}.tmp", path);
    fs::write(&tmp_path, &content).map_err(|e| format!("Failed to write temp file {}: {}", tmp_path, e))?;
    fs::rename(&tmp_path, &path).map_err(|e| format!("Failed to rename temp file to target {}: {}", path, e))?;

    let graph_conn = state.graph_conn.clone();
    tauri::async_runtime::spawn(async move {
        let ext = std::path::Path::new(&path).extension().and_then(|e| e.to_str()).unwrap_or("");
        let lang = if ext == "rs" { "rust" } else if ext == "py" { "python" } else { "" };
        
        if lang != "" {
            let conn_guard = graph_conn.lock().await;
            if let Err(e) = index_file(&conn_guard, &path, &content, lang) {
                eprintln!("Failed to index file {}: {}", path, e);
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    if std::path::Path::new(&path).exists() {
        return Err(format!("File {} already exists", path));
    }
    fs::write(&path, "").map_err(|e| format!("Failed to create file {}: {}", path, e))
}

#[tauri::command]
pub async fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory {}: {}", path, e))
}

#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename {} to {}: {}", old_path, new_path, e))
}

#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("Failed to delete directory {}: {}", path, e))
    } else {
        fs::remove_file(p).map_err(|e| format!("Failed to delete file {}: {}", path, e))
    }
}
