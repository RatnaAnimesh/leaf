use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TerminalDrawerConfig {
    pub open: bool,
    pub height_percent: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WindowBounds {
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub x: Option<f64>,
    pub y: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfig {
    pub version: u32,
    pub main_split: Vec<f64>,
    pub left_split: Vec<f64>,
    pub terminal_drawer: TerminalDrawerConfig,
    pub window_bounds: WindowBounds,
}

impl Default for WorkspaceConfig {
    fn default() -> Self {
        Self {
            version: 1,
            main_split: vec![30.0, 70.0],
            left_split: vec![60.0, 40.0],
            terminal_drawer: TerminalDrawerConfig {
                open: false,
                height_percent: 30.0,
            },
            window_bounds: WindowBounds {
                width: Some(1440.0),
                height: Some(900.0),
                x: None,
                y: None,
            },
        }
    }
}

#[tauri::command]
pub async fn load_workspace_config(workspace_root: String) -> Result<WorkspaceConfig, String> {
    let mut config_path = PathBuf::from(&workspace_root);
    config_path.push(".leaf");
    config_path.push("layout.json");

    if !config_path.exists() {
        return Ok(WorkspaceConfig::default());
    }

    let content = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_workspace_config(workspace_root: String, config: WorkspaceConfig) -> Result<(), String> {
    let mut leaf_dir = PathBuf::from(&workspace_root);
    leaf_dir.push(".leaf");

    if !leaf_dir.exists() {
        fs::create_dir_all(&leaf_dir).map_err(|e| e.to_string())?;
        
        // Add to gitignore if not present
        let mut gitignore_path = PathBuf::from(&workspace_root);
        gitignore_path.push(".gitignore");
        
        if gitignore_path.exists() {
            let content = fs::read_to_string(&gitignore_path).unwrap_or_default();
            if !content.contains(".leaf/") {
                let new_content = format!("{}\n.leaf/\n", content.trim_end());
                let _ = fs::write(gitignore_path, new_content);
            }
        } else {
            let _ = fs::write(gitignore_path, ".leaf/\n");
        }
    }

    let mut config_path = leaf_dir;
    config_path.push("layout.json");

    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(config_path, content).map_err(|e| e.to_string())
}
