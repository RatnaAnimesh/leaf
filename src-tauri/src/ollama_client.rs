use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Debug)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
    pub keep_alive: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct ChatStreamChunk {
    pub model: String,
    pub message: Option<ChatMessage>,
    pub done: bool,
}

pub async fn stream_chat(
    request: ChatRequest,
    app_handle: tauri::AppHandle,
    stream_event_name: &str,
) -> Result<(), anyhow::Error> {
    let client = reqwest::Client::new();
    let response = client
        .post("http://localhost:11434/api/chat")
        .json(&request)
        .send()
        .await?;

    use futures_util::StreamExt;
    use tauri::Emitter;
    
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));
        
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].to_string();
            buffer.drain(..=newline_pos);
            
            if line.trim().is_empty() { continue; }
            
            let parsed: ChatStreamChunk = serde_json::from_str(&line)?;
            app_handle.emit(stream_event_name, &parsed)?;
            
            if parsed.done {
                return Ok(());
            }
        }
    }
    
    Ok(())
}
