use git2::{Repository, DiffOptions, DiffFormat};

pub fn get_file_diff(workspace_root: &str, path: &str) -> Result<String, String> {
    let repo = Repository::open(workspace_root).map_err(|e| e.to_string())?;
    
    let mut opts = DiffOptions::new();
    opts.pathspec(path);

    // Get the diff between index and worktree
    let diff = repo.diff_index_to_workdir(None, Some(&mut opts)).map_err(|e| e.to_string())?;
    
    let mut diff_output = String::new();
    
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        let prefix = match line.origin() {
            '+' => "+",
            '-' => "-",
            ' ' => " ",
            _ => "",
        };
        let content = std::str::from_utf8(line.content()).unwrap_or("");
        diff_output.push_str(&format!("{}{}", prefix, content));
        true
    }).map_err(|e| e.to_string())?;

    Ok(diff_output)
}
