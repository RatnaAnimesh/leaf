use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event};
use tauri::{AppHandle, Emitter};

pub fn start_watching(path: &str, app_handle: AppHandle) -> notify::Result<RecommendedWatcher> {
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            // emit a tauri event "fs-changed" with the affected path(s)
            // frontend listens via @tauri-apps/api/event's `listen`
            let _ = app_handle.emit("fs-changed", &event.paths);
        }
    })?;
    watcher.watch(std::path::Path::new(path), RecursiveMode::Recursive)?;
    Ok(watcher)
}
