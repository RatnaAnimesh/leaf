use crate::ollama_client::{stream_chat, ChatMessage, ChatRequest};

#[tauri::command]
pub async fn send_chat_message(
    app_handle: tauri::AppHandle,
    model: String,
    messages: Vec<ChatMessage>,
    stream_id: String,
) -> Result<(), String> {
    let request = ChatRequest {
        model,
        messages,
        stream: true,
        keep_alive: "5m".into(),
    };
    
    stream_chat(request, app_handle, &stream_id)
        .await
        .map_err(|e| e.to_string())
}
