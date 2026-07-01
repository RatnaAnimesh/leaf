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
    pub eval_count: Option<u64>,
    pub eval_duration: Option<u64>,
}

pub async fn stream_chat(
    request: ChatRequest,
    app_handle: tauri::AppHandle,
    stream_event_name: &str,
    base_url: &str,
) -> Result<(), anyhow::Error> {
    let client = reqwest::Client::new();
    let response = client
        .post(&format!("{}/api/chat", base_url))
        .json(&request)
        .send()
        .await?;

    use futures_util::StreamExt;
    use tauri::Emitter;
    
    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk?;
        buffer.extend_from_slice(&bytes);
        
        while let Some(newline_pos) = buffer.iter().position(|&b| b == b'\n') {
            let line_bytes = buffer.drain(..=newline_pos).collect::<Vec<u8>>();
            let line = match String::from_utf8(line_bytes) {
                Ok(l) => l,
                Err(e) => {
                    let err_msg = format!("UTF-8 decode error: {}", e);
                    let err_chunk = ChatStreamChunk {
                        model: request.model.clone(),
                        message: Some(ChatMessage {
                            role: "system".to_string(),
                            content: err_msg.clone(),
                        }),
                        done: true,
                        eval_count: None,
                        eval_duration: None,
                    };
                    let _ = app_handle.emit(stream_event_name, &err_chunk);
                    return Err(anyhow::anyhow!(err_msg));
                }
            };
            
            if line.trim().is_empty() { continue; }
            
            match serde_json::from_str::<ChatStreamChunk>(&line) {
                Ok(parsed) => {
                    app_handle.emit(stream_event_name, &parsed)?;
                    if parsed.done {
                        return Ok(());
                    }
                }
                Err(e) => {
                    let err_msg = format!("Stream parsing error: {}", e);
                    let err_chunk = ChatStreamChunk {
                        model: request.model.clone(),
                        message: Some(ChatMessage {
                            role: "system".to_string(),
                            content: err_msg.clone(),
                        }),
                        done: true,
                        eval_count: None,
                        eval_duration: None,
                    };
                    let _ = app_handle.emit(stream_event_name, &err_chunk);
                    return Err(anyhow::anyhow!(err_msg));
                }
            }
        }
    }
    
    Ok(())
}
