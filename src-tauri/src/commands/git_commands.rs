use crate::git::{status, diff, operations};

#[tauri::command]
pub async fn get_repo_status(workspace_root: String) -> Result<status::RepoStatus, String> {
    tokio::task::spawn_blocking(move || {
        status::get_repo_status(&workspace_root)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn has_uncommitted_changes(workspace_root: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        status::has_uncommitted_changes(&workspace_root)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_file_diff(workspace_root: String, path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        diff::get_file_diff(&workspace_root, &path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn stage_file(workspace_root: String, path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        operations::stage_file(&workspace_root, &path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn unstage_file(workspace_root: String, path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        operations::unstage_file(&workspace_root, &path)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn commit(workspace_root: String, message: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        operations::commit(&workspace_root, &message)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_file_head_content(workspace_root: String, path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        crate::git::operations::get_file_head_content(&workspace_root, &path)
    })
    .await
    .map_err(|e| e.to_string())?
}
