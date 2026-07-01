import { useState } from 'react';
import { ChatMessage, ChatStreamChunk, ModelStatus } from '../../lib/types';
import { sendChatMessage, preloadModel } from '../../lib/tauri-commands';
import { listen } from '@tauri-apps/api/event';

export function ChatPanel(props: { activeFilePath?: string, activeLineNumber?: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [useReasoning, setUseReasoning] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [tokensPerSec, setTokensPerSec] = useState<string | null>(null);

  const handleFocus = () => {
    preloadModel(useReasoning ? 'reasoning' : 'coder').catch(console.error);
  };

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;
    
    const newMsg: ChatMessage = { role: 'user', content: input };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);
    setStreamingMessage('');
    setTokensPerSec(null);

    const streamId = crypto.randomUUID();
    let accumulated = '';
    let timeoutId: number | undefined;

    let unlistenStream: () => void;
    let unlistenStatus: () => void;

    const handleTimeout = () => {
      if (unlistenStream) unlistenStream();
      if (unlistenStatus) unlistenStatus();
      setMessages(prev => [...prev, { role: 'assistant', content: accumulated + '\n\n[Error: Stream timed out after 3 minutes]' }]);
      setStreamingMessage('');
      setIsStreaming(false);
    };

    const resetTimeout = () => {
      window.clearTimeout(timeoutId);
      // Increased timeout to 3 minutes to allow for model loading/swapping
      timeoutId = window.setTimeout(handleTimeout, 180000);
    };

    unlistenStatus = await listen<ModelStatus>(`${streamId}-status`, (event) => {
      setModelStatus(event.payload);
    });

    unlistenStream = await listen<ChatStreamChunk>(streamId, (event) => {
      resetTimeout();
      if (event.payload.message?.content) {
        accumulated += event.payload.message.content;
        setStreamingMessage(accumulated);
      }
      if (event.payload.done) {
        window.clearTimeout(timeoutId);
        unlistenStream();
        if (unlistenStatus) unlistenStatus();
        
        if (event.payload.eval_count && event.payload.eval_duration) {
          const tps = (event.payload.eval_count / (event.payload.eval_duration / 1e9)).toFixed(1);
          setTokensPerSec(`${tps} t/s`);
        }

        setMessages(prev => [...prev, { role: 'assistant', content: accumulated }]);
        setStreamingMessage('');
        setIsStreaming(false);
      }
    });

    resetTimeout();

    try {
      const ext = props.activeFilePath ? props.activeFilePath.split('.').pop() || null : null;
      await sendChatMessage(
        input,
        messages,
        streamId,
        props.activeFilePath || null,
        props.activeLineNumber || null,
        ext,
        useReasoning
      );
    } catch (e) {
      window.clearTimeout(timeoutId);
      console.error('Chat error', e);
      setMessages(prev => [...prev, { role: 'assistant', content: accumulated + '\n\n[Error: Failed to send message]' }]);
      setStreamingMessage('');
      setIsStreaming(false);
      if (unlistenStream) unlistenStream();
      if (unlistenStatus) unlistenStatus();
    }
  };

  const renderMessageContent = (content: string) => {
    if (!content) return null;
    const parts = content.split(/(<think>[\s\S]*?(?:<\/think>|$))/gi);
    return parts.map((part, i) => {
      if (part.toLowerCase().startsWith('<think>')) {
        const inner = part.substring(7).replace(/<\/think>$/i, '');
        return (
          <div key={i} style={{ 
            padding: '8px 12px', 
            borderLeft: '4px solid #ddd', 
            color: '#666', 
            fontStyle: 'italic', 
            margin: '8px 0', 
            backgroundColor: '#f5f5f5',
            borderRadius: '0 4px 4px 0',
            fontSize: '0.9em'
          }}>
            {inner}
          </div>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px', boxSizing: 'border-box' }}>
      <div style={{ flex: 1, overflow: 'auto', marginBottom: '8px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '12px' }}>
            <strong>{m.role === 'user' ? 'You' : 'Model'}:</strong>
            <div style={{ whiteSpace: 'pre-wrap', margin: '4px 0', wordBreak: 'break-word' }}>
              {renderMessageContent(m.content)}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div style={{ marginBottom: '12px' }}>
            <strong>Model:</strong>
            <div style={{ whiteSpace: 'pre-wrap', margin: '4px 0', wordBreak: 'break-word' }}>
              {renderMessageContent(streamingMessage)}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
          <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={useReasoning}
              onChange={(e) => setUseReasoning(e.target.checked)}
              disabled={isStreaming}
              style={{ marginRight: '4px' }}
            />
            Reasoning Model
          </label>
        </div>
        <div style={{ display: 'flex', position: 'relative' }}>
          <textarea 
            style={{ flex: 1, padding: '4px', resize: 'vertical', minHeight: '60px' }}
            value={input} 
            onChange={e => setInput(e.target.value)}
            onFocus={handleFocus}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
            disabled={isStreaming}
          />
          <button onClick={sendMessage} disabled={isStreaming} style={{ marginLeft: '4px' }}>Send</button>
        </div>
        
        {/* Model Status Pill */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '4px', color: '#666' }}>
          <div>
            {modelStatus && (
              <span style={{ 
                padding: '2px 6px', 
                borderRadius: '12px', 
                backgroundColor: modelStatus.state === 'ready' ? '#e6ffe6' : '#fff3e6',
                color: modelStatus.state === 'ready' ? '#006600' : '#cc6600',
                border: '1px solid currentColor'
              }}>
                {modelStatus.role} | {modelStatus.state}
                {modelStatus.state === 'ready' && modelStatus.sizeVramBytes && 
                  ` (${(modelStatus.sizeVramBytes / 1e9).toFixed(1)} GB)`}
              </span>
            )}
          </div>
          <div>
            {tokensPerSec && <span>{tokensPerSec}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
