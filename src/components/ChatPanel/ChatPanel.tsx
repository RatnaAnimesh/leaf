import { useState } from 'react';
import { ChatMessage, ChatStreamChunk } from '../../lib/types';
import { sendChatMessage } from '../../lib/tauri-commands';
import { listen } from '@tauri-apps/api/event';

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const MODEL = 'qwen2.5-coder:14b'; // Hardcoded for Phase 1

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;
    
    const newMsg: ChatMessage = { role: 'user', content: input };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);
    setStreamingMessage('');

    const streamId = crypto.randomUUID();
    let accumulated = '';

    const unlisten = await listen<ChatStreamChunk>(streamId, (event) => {
      if (event.payload.message?.content) {
        accumulated += event.payload.message.content;
        setStreamingMessage(accumulated);
      }
      if (event.payload.done) {
        unlisten();
        setMessages(prev => [...prev, { role: 'assistant', content: accumulated }]);
        setStreamingMessage('');
        setIsStreaming(false);
      }
    });

    try {
      await sendChatMessage(MODEL, updatedMessages, streamId);
    } catch (e) {
      console.error('Chat error', e);
      setIsStreaming(false);
      unlisten();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px', boxSizing: 'border-box' }}>
      <div style={{ flex: 1, overflow: 'auto', marginBottom: '8px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '8px' }}>
            <strong>{m.role === 'user' ? 'You' : 'Model'}:</strong>
            <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>{m.content}</p>
          </div>
        ))}
        {isStreaming && (
          <div>
            <strong>Model:</strong>
            <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>{streamingMessage}</p>
          </div>
        )}
      </div>
      <div style={{ display: 'flex' }}>
        <input 
          style={{ flex: 1, padding: '4px' }}
          value={input} 
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
          disabled={isStreaming}
        />
        <button onClick={sendMessage} disabled={isStreaming} style={{ marginLeft: '4px' }}>Send</button>
      </div>
    </div>
  );
}
