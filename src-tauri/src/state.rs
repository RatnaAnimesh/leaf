use notify::RecommendedWatcher;
use std::sync::Mutex;

pub struct AppState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
}
