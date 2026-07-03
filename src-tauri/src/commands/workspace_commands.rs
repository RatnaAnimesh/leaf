use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Default)]
struct RecentWorkspaces {
    paths: Vec<String>,
}

fn get_recent_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    
    Ok(app_dir.join("recent_workspaces.json"))
}

#[tauri::command]
pub fn get_recent_workspaces(app: AppHandle) -> Result<Vec<String>, String> {
    let recent_path = get_recent_file_path(&app)?;
    
    if !recent_path.exists() {
        return Ok(Vec::new());
    }

    let contents = fs::read_to_string(recent_path).map_err(|e| e.to_string())?;
    let workspaces: RecentWorkspaces = serde_json::from_str(&contents).unwrap_or_default();
    
    Ok(workspaces.paths)
}

#[tauri::command]
pub fn add_recent_workspace(app: AppHandle, path: String) -> Result<(), String> {
    let recent_path = get_recent_file_path(&app)?;
    
    let mut workspaces = if recent_path.exists() {
        let contents = fs::read_to_string(&recent_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<RecentWorkspaces>(&contents).unwrap_or_default()
    } else {
        RecentWorkspaces::default()
    };

    // Remove if already exists so we can push it to the top (most recent)
    workspaces.paths.retain(|p| p != &path);
    workspaces.paths.insert(0, path);

    // Keep only top 10
    if workspaces.paths.len() > 10 {
        workspaces.paths.truncate(10);
    }

    let serialized = serde_json::to_string_pretty(&workspaces).map_err(|e| e.to_string())?;
    fs::write(recent_path, serialized).map_err(|e| e.to_string())?;

    Ok(())
}
