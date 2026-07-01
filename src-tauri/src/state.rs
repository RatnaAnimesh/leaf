use notify::RecommendedWatcher;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AppState {
    pub watcher: std::sync::Mutex<Option<RecommendedWatcher>>,
    pub graph_conn: Arc<Mutex<rusqlite::Connection>>,
    pub orchestrator: Arc<Mutex<crate::models::orchestrator::ModelOrchestrator>>,
    pub workspace_root: std::sync::Mutex<Option<String>>,
}
