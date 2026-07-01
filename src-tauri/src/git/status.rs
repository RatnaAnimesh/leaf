use git2::{Repository, StatusOptions};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GitFile {
    pub path: String,
    pub status: String, // e.g., "M", "A", "D", "??"
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RepoStatus {
    pub branch: String,
    pub ahead: usize,
    pub behind: usize,
    pub staged: Vec<GitFile>,
    pub unstaged: Vec<GitFile>,
    pub untracked: Vec<GitFile>,
}

pub fn get_repo_status(workspace_root: &str) -> Result<RepoStatus, String> {
    let repo = Repository::open(workspace_root).map_err(|e| e.to_string())?;

    let branch = if let Ok(head) = repo.head() {
        if head.is_branch() {
            head.shorthand().unwrap_or("unknown").to_string()
        } else {
            "detached HEAD".to_string()
        }
    } else {
        "unknown".to_string()
    };

    let mut ahead = 0;
    let mut behind = 0;
    if let Ok(head) = repo.head() {
        if let Some(head_target) = head.target() {
            if let Ok(upstream) = repo.branch_upstream_name(head.name().unwrap_or("")) {
                let upstream_name = upstream.as_str().unwrap_or("");
                if let Ok(upstream_ref) = repo.find_reference(upstream_name) {
                    if let Some(upstream_target) = upstream_ref.target() {
                        if let Ok((a, b)) = repo.graph_ahead_behind(head_target, upstream_target) {
                            ahead = a;
                            behind = b;
                        }
                    }
                }
            }
        }
    }

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    let mut opts = StatusOptions::new();
    opts.include_untracked(true);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let status = entry.status();

        if status.intersects(git2::Status::INDEX_NEW | git2::Status::INDEX_MODIFIED | git2::Status::INDEX_DELETED | git2::Status::INDEX_RENAMED | git2::Status::INDEX_TYPECHANGE) {
            let s = if status.contains(git2::Status::INDEX_NEW) { "A" }
            else if status.contains(git2::Status::INDEX_MODIFIED) { "M" }
            else if status.contains(git2::Status::INDEX_DELETED) { "D" }
            else { "M" };
            staged.push(GitFile { path: path.clone(), status: s.to_string() });
        }

        if status.intersects(git2::Status::WT_MODIFIED | git2::Status::WT_DELETED | git2::Status::WT_TYPECHANGE | git2::Status::WT_RENAMED) {
            let s = if status.contains(git2::Status::WT_MODIFIED) { "M" }
            else if status.contains(git2::Status::WT_DELETED) { "D" }
            else { "M" };
            unstaged.push(GitFile { path: path.clone(), status: s.to_string() });
        } else if status.contains(git2::Status::WT_NEW) {
            untracked.push(GitFile { path: path.clone(), status: "U".to_string() });
        }
    }

    Ok(RepoStatus {
        branch,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
    })
}

pub fn has_uncommitted_changes(workspace_root: &str) -> Result<bool, String> {
    let repo = Repository::open(workspace_root).map_err(|e| e.to_string())?;
    let mut opts = StatusOptions::new();
    opts.include_untracked(false);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    Ok(!statuses.is_empty())
}
