use ignore::WalkBuilder;
use std::fs;

#[derive(serde::Serialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

#[tauri::command]
pub async fn read_directory(path: String) -> Result<Vec<FileNode>, String> {
    let mut builder = WalkBuilder::new(&path);
    builder.max_depth(Some(1)).hidden(false);

    let mut nodes = Vec::new();
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
                // Ignore errors for unreadable files/dirs, just skip them for now
                eprintln!("Error reading directory entry: {}", err);
            }
        }
    }

    // Sort: directories first, then files, both alphabetically
    nodes.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name))
    });

    Ok(nodes)
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file {}: {}", path, e))
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("Failed to write file {}: {}", path, e))
}
