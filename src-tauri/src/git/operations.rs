use git2::{Repository, Signature};
use std::path::Path;

pub fn stage_file(workspace_root: &str, path: &str) -> Result<(), String> {
    let repo = Repository::open(workspace_root).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    index.add_path(Path::new(path)).map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn unstage_file(workspace_root: &str, path: &str) -> Result<(), String> {
    let repo = Repository::open(workspace_root).map_err(|e| e.to_string())?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let head_commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    repo.reset_default(
        Some(head_commit.as_object()),
        [path].iter()
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn commit(workspace_root: &str, message: &str) -> Result<(), String> {
    let repo = Repository::open(workspace_root).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    let oid = index.write_tree().map_err(|e| e.to_string())?;
    let signature = Signature::now("Leaf IDE", "leaf@local").map_err(|e| e.to_string())?;
    
    let parent_commit = match repo.head() {
        Ok(head) => Some(head.peel_to_commit().map_err(|e| e.to_string())?),
        Err(_) => None,
    };
    
    let tree = repo.find_tree(oid).map_err(|e| e.to_string())?;
    
    if let Some(parent) = parent_commit {
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &[&parent],
        ).map_err(|e| e.to_string())?;
    } else {
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &[],
        ).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

pub fn get_file_head_content(workspace_root: &str, path: &str) -> Result<String, String> {
    let repo = git2::Repository::open(workspace_root).map_err(|e| e.to_string())?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let head_commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    let tree = head_commit.tree().map_err(|e| e.to_string())?;
    
    let entry = tree.get_path(std::path::Path::new(path)).map_err(|e| e.to_string())?;
    let object = entry.to_object(&repo).map_err(|e| e.to_string())?;
    if let Some(blob) = object.as_blob() {
        Ok(String::from_utf8_lossy(blob.content()).into_owned())
    } else {
        Err("Not a blob".to_string())
    }
}
