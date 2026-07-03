use crate::git::{status, diff, operations};
use std::path::PathBuf;
use std::process::Command;

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

#[tauri::command]
pub async fn git_clone(url: String, parent_dir: String) -> Result<String, String> {
    // Determine the repository name from the URL
    // e.g. "https://github.com/foo/bar.git" -> "bar"
    let repo_name = url
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .split('/')
        .last()
        .unwrap_or("repo");

    let target_path = PathBuf::from(&parent_dir).join(repo_name);

    if target_path.exists() {
        return Err(format!("Target directory '{}' already exists.", target_path.display()));
    }

    // Use standard library Command to invoke system git
    // This allows us to use the user's existing SSH keys and credentials
    let output = Command::new("git")
        .arg("clone")
        .arg(&url)
        .arg(&target_path)
        .current_dir(&parent_dir)
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;

    if output.status.success() {
        Ok(target_path.to_string_lossy().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Git clone failed: {}", stderr))
    }
}
