use tokio::time::{Duration, Instant};

#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModelRole {
    Coder,
    Reasoning,
}

#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LoadState {
    Unloaded,
    Loading,
    Ready,
    Unloading,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ModelSlot {
    pub role: ModelRole,
    pub model_name: String,    // e.g. "qwen2.5-coder:14b"
    pub load_state: LoadState,
    #[serde(skip)]
    pub last_used: Option<Instant>,
    pub size_vram_bytes: Option<u64>,   // populated from /api/ps once loaded
    pub expires_at: Option<String>,      // raw string from /api/ps for display
}

#[derive(Debug)]
pub struct ModelOrchestrator {
    pub coder: ModelSlot,
    pub reasoning: ModelSlot,
    pub active_role: Option<ModelRole>, // which model is currently being used for inference
    pub idle_timeout: Duration,          // configurable, default 5 minutes
    pub ollama_base_url: String,         // not hardcoded; see section 3.3
}

impl ModelOrchestrator {
    pub async fn ensure_model_loaded(
        &mut self,
        role: ModelRole,
        client: &reqwest::Client,
        base_url: &str,
    ) -> Result<(), anyhow::Error> {
        // Need to extract load state before match because we borrow self mutably later
        let target_load_state = match role {
            ModelRole::Coder => self.coder.load_state.clone(),
            ModelRole::Reasoning => self.reasoning.load_state.clone(),
        };

        match target_load_state {
            LoadState::Ready => {
                // Already loaded — update last_used, nothing else needed.
                let target_slot = match role {
                    ModelRole::Coder => &mut self.coder,
                    ModelRole::Reasoning => &mut self.reasoning,
                };
                target_slot.last_used = Some(Instant::now());
                return Ok(());
            }
            LoadState::Loading | LoadState::Unloading => {
                // Another task is mid-transition
                return Err(anyhow::anyhow!("model is currently transitioning, retry in a moment"));
            }
            LoadState::Unloaded => {
                // Fall through to load sequence below.
            }
        }

        // Determine if the OTHER model is currently loaded.
        let other_ready = match role {
            ModelRole::Coder => self.reasoning.load_state == LoadState::Ready,
            ModelRole::Reasoning => self.coder.load_state == LoadState::Ready,
        };

        // Strict unload-then-load sequencing: never overlap two models in memory.
        if other_ready {
            let other_slot = match role {
                ModelRole::Coder => &mut self.reasoning,
                ModelRole::Reasoning => &mut self.coder,
            };
            Self::unload_model_slot(other_slot, client, base_url).await?;
            // After unload, sleep 500ms to allow macOS unified memory to
            // fully reclaim and pressure to drop before the next load.
            tokio::time::sleep(Duration::from_millis(500)).await;
        }

        let target_slot = match role {
            ModelRole::Coder => &mut self.coder,
            ModelRole::Reasoning => &mut self.reasoning,
        };
        Self::load_model_slot(target_slot, client, base_url).await?;
        Ok(())
    }

    async fn load_model_slot(
        slot: &mut ModelSlot,
        client: &reqwest::Client,
        base_url: &str,
    ) -> Result<(), anyhow::Error> {
        slot.load_state = LoadState::Loading;

        // Trigger a model load by sending a minimal no-op request with keep_alive set.
        let load_request = serde_json::json!({
            "model": slot.model_name,
            "messages": [{ "role": "user", "content": "." }],
            "stream": false,
            "keep_alive": "5m"
        });

        let response = client
            .post(format!("{}/api/chat", base_url))
            .json(&load_request)
            .send()
            .await?;

        if !response.status().is_success() {
            slot.load_state = LoadState::Unloaded;
            return Err(anyhow::anyhow!(
                "Ollama load request failed with status {}",
                response.status()
            ));
        }

        // Confirm load via /api/ps and populate vram stats.
        let ps_response: serde_json::Value = client
            .get(format!("{}/api/ps", base_url))
            .send()
            .await?
            .json()
            .await?;

        if let Some(models) = ps_response["models"].as_array() {
            for m in models {
                if m["name"].as_str().unwrap_or("") == slot.model_name {
                    slot.size_vram_bytes = m["size_vram"].as_u64();
                    slot.expires_at = m["expires_at"].as_str().map(|s| s.to_string());
                    break;
                }
            }
        }

        slot.load_state = LoadState::Ready;
        slot.last_used = Some(Instant::now());
        Ok(())
    }

    async fn unload_model_slot(
        slot: &mut ModelSlot,
        client: &reqwest::Client,
        base_url: &str,
    ) -> Result<(), anyhow::Error> {
        slot.load_state = LoadState::Unloading;

        // keep_alive: "0" forces immediate unload.
        let unload_request = serde_json::json!({
            "model": slot.model_name,
            "messages": [{ "role": "user", "content": "." }],
            "stream": false,
            "keep_alive": "0"
        });

        let result = client
            .post(format!("{}/api/chat", base_url))
            .json(&unload_request)
            .send()
            .await;

        // Don't propagate network errors on unload
        if let Err(e) = result {
            eprintln!("unload request failed (treating as unloaded): {}", e);
        }

        slot.load_state = LoadState::Unloaded;
        slot.size_vram_bytes = None;
        slot.expires_at = None;
        Ok(())
    }

    pub async fn idle_check(
        &mut self,
        client: &reqwest::Client,
        base_url: &str,
    ) -> Result<(), anyhow::Error> {
        let now = Instant::now();

        // Need to extract the active role to avoid borrow checker issues with `self`
        let active = self.active_role.clone();
        let timeout = self.idle_timeout;

        for slot in [&mut self.coder, &mut self.reasoning] {
            if slot.load_state != LoadState::Ready { continue; }
            if let Some(last_used) = slot.last_used {
                if now.duration_since(last_used) > timeout {
                    // Only unload if this slot is not actively being used for inference.
                    let is_active = active.as_ref()
                        .map(|r| r == &slot.role)
                        .unwrap_or(false);
                    if !is_active {
                        Self::unload_model_slot(slot, client, base_url).await?;
                    }
                }
            }
        }
        Ok(())
    }
}
