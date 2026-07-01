use crate::ollama_client::{stream_chat, ChatMessage, ChatRequest};
use crate::state::AppState;
use crate::models::orchestrator::{ModelRole, LoadState};
use crate::models::prompt;
use crate::graph;
use std::time::Instant;

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub role: ModelRole,
    pub state: LoadState,
    pub size_vram_bytes: Option<u64>,
    pub expires_at: Option<String>,
}

#[tauri::command]
pub async fn send_chat_message(
    app_handle: tauri::AppHandle,
    app_state: tauri::State<'_, AppState>,
    user_message: String,
    history: Vec<ChatMessage>,
    stream_id: String,
    anchor_file: Option<String>,
    anchor_line: Option<u32>,
    active_file_extension: Option<String>,
    use_reasoning: bool,
    multi_file_intent: bool,
) -> Result<(), String> {
    let model_role = if use_reasoning {
        ModelRole::Reasoning
    } else {
        ModelRole::Coder
    };

    // Step 1: ensure the right model is loaded (may trigger a hot-swap).
    {
        let mut orchestrator = app_state.orchestrator.lock().await;
        let client = reqwest::Client::new();
        let base_url = orchestrator.ollama_base_url.clone();

        orchestrator.active_role = Some(model_role.clone());

        use tauri::Emitter;
        app_handle.emit(&format!("{}-status", stream_id), ModelStatus {
            role: model_role.clone(),
            state: LoadState::Loading,
            size_vram_bytes: None,
            expires_at: None,
        }).ok();

        orchestrator.ensure_model_loaded(model_role.clone(), &client, &base_url)
            .await
            .map_err(|e| e.to_string())?;

        let slot = match model_role {
            ModelRole::Coder => &orchestrator.coder,
            ModelRole::Reasoning => &orchestrator.reasoning,
        };

        app_handle.emit(&format!("{}-status", stream_id), ModelStatus {
            role: model_role.clone(),
            state: LoadState::Ready,
            size_vram_bytes: slot.size_vram_bytes,
            expires_at: slot.expires_at.clone(),
        }).ok();
    } // release orchestrator lock before starting inference

    // Step 2: fetch graph context for current cursor position and @mentions
    let context = {
        let conn = app_state.graph_conn.lock().await;
        let mut ctx = if let (Some(file), Some(line)) = (&anchor_file, anchor_line) {
            graph::context_select::select_context(&conn, file, line as usize)
                .unwrap_or_else(|_| vec![])
        } else {
            vec![]
        };

        // Extract @mentions from user message
        for word in user_message.split_whitespace() {
            if word.starts_with('@') && word.len() > 1 {
                let label = &word[1..];
                use rusqlite::OptionalExtension;
                
                // Try file first
                if let Ok(Some(path)) = conn.query_row(
                    "SELECT path FROM files WHERE path = ?1 LIMIT 1",
                    [label],
                    |row| row.get::<_, String>(0)
                ).optional() {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        ctx.push(format!("// File: {}\n{}", path, content));
                        continue;
                    }
                }
                
                // Try symbol
                if let Ok(Some((path, name, signature))) = conn.query_row(
                    "SELECT f.path, s.name, s.signature FROM symbols s JOIN files f ON s.file_id = f.id WHERE s.name = ?1 LIMIT 1",
                    [label],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
                ).optional() {
                    ctx.push(format!("// Symbol: {} in {}\n{}", name, path, signature));
                }
            }
        }

        ctx
    }; // release graph conn lock

    // Step 3: assemble full prompt.
    let model_name = {
        let orchestrator = app_state.orchestrator.lock().await;
        match model_role {
            ModelRole::Coder => orchestrator.coder.model_name.clone(),
            ModelRole::Reasoning => orchestrator.reasoning.model_name.clone(),
        }
    };

    let prompt = prompt::assemble_prompt(
        &user_message,
        &history,
        &context,
        active_file_extension.as_deref(),
        model_role.clone(),
        multi_file_intent,
    );

    // Step 4: stream to frontend.
    let base_url = {
        app_state.orchestrator.lock().await.ollama_base_url.clone()
    };

    let chat_request = ChatRequest {
        model: model_name,
        messages: prompt.messages,
        stream: true,
        keep_alive: "5m".to_string(),
    };

    stream_chat(chat_request, app_handle.clone(), &stream_id, &base_url)
        .await
        .map_err(|e| e.to_string())?;

    // Step 5: release active_role after inference completes.
    {
        let mut orchestrator = app_state.orchestrator.lock().await;
        orchestrator.active_role = None;
        if let Some(slot) = match model_role {
            ModelRole::Coder => Some(&mut orchestrator.coder),
            ModelRole::Reasoning => Some(&mut orchestrator.reasoning),
        } {
            slot.last_used = Some(tokio::time::Instant::now());
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn preload_model(
    role: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let model_role = match role.as_str() {
        "reasoning" => ModelRole::Reasoning,
        "coder" => ModelRole::Coder,
        _ => return Err(format!("unknown model role: {}", role)),
    };

    // Spawn — do not await. The command returns to the frontend immediately.
    let orchestrator_arc = app_state.orchestrator.clone();
    tauri::async_runtime::spawn(async move {
        let mut orchestrator = orchestrator_arc.lock().await;
        let client = reqwest::Client::new();
        let base_url = orchestrator.ollama_base_url.clone();
        if let Err(e) = orchestrator.ensure_model_loaded(model_role, &client, &base_url).await {
            eprintln!("predictive preload failed: {}", e);
        }
    });

    Ok(())
}
