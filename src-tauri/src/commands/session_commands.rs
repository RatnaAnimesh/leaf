use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatSession {
    pub id: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub title: String,
    pub summary: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub id: i64,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub created_at: u64,
}

#[tauri::command]
pub async fn list_sessions(state: tauri::State<'_, AppState>) -> Result<Vec<ChatSession>, String> {
    let conn = state.graph_conn.lock().await;
    let mut stmt = conn.prepare("SELECT id, created_at, updated_at, title, summary FROM chat_sessions ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([], |row| {
        Ok(ChatSession {
            id: row.get(0)?,
            created_at: row.get(1)?,
            updated_at: row.get(2)?,
            title: row.get(3)?,
            summary: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut sessions = Vec::new();
    for s in iter {
        if let Ok(session) = s {
            sessions.push(session);
        }
    }
    
    Ok(sessions)
}

#[tauri::command]
pub async fn get_session_messages(session_id: String, state: tauri::State<'_, AppState>) -> Result<Vec<ChatMessage>, String> {
    let conn = state.graph_conn.lock().await;
    let mut stmt = conn.prepare("SELECT id, session_id, role, content, created_at FROM chat_messages WHERE session_id = ?1 ORDER BY created_at ASC").map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([session_id], |row| {
        Ok(ChatMessage {
            id: row.get(0)?,
            session_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut messages = Vec::new();
    for m in iter {
        if let Ok(msg) = m {
            messages.push(msg);
        }
    }
    
    Ok(messages)
}

#[tauri::command]
pub async fn create_session(id: String, title: String, state: tauri::State<'_, AppState>) -> Result<ChatSession, String> {
    let conn = state.graph_conn.lock().await;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    
    conn.execute(
        "INSERT INTO chat_sessions (id, created_at, updated_at, title) VALUES (?1, ?2, ?3, ?4)",
        (id.clone(), now, now, title.clone()),
    ).map_err(|e| e.to_string())?;
    
    Ok(ChatSession {
        id,
        created_at: now,
        updated_at: now,
        title,
        summary: None,
    })
}

#[tauri::command]
pub async fn add_message(session_id: String, role: String, content: String, state: tauri::State<'_, AppState>) -> Result<i64, String> {
    let conn = state.graph_conn.lock().await;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    
    conn.execute(
        "INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4)",
        (session_id.clone(), role, content, now),
    ).map_err(|e| e.to_string())?;
    
    let id = conn.last_insert_rowid();
    
    conn.execute(
        "UPDATE chat_sessions SET updated_at = ?1 WHERE id = ?2",
        (now, session_id),
    ).map_err(|e| e.to_string())?;
    
    Ok(id)
}

#[tauri::command]
pub async fn update_session_summary(session_id: String, summary: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let conn = state.graph_conn.lock().await;
    conn.execute(
        "UPDATE chat_sessions SET summary = ?1 WHERE id = ?2",
        (summary, session_id),
    ).map_err(|e| e.to_string())?;
    Ok(())
}
