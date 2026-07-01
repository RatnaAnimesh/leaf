import { useState, useEffect } from 'react';
import { ChatMessage, ChatStreamChunk, ModelStatus, MentionResult } from '../../lib/types';
import { sendChatMessage, preloadModel, listSessions, getSessionMessages, createSession, addMessage, updateSessionSummary, searchMentions } from '../../lib/tauri-commands';
import { listen } from '@tauri-apps/api/event';
import { DiffReviewPanel } from '../DiffReviewPanel/DiffReviewPanel';

export function ChatPanel(props: { activeFilePath?: string, activeLineNumber?: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [useReasoning, setUseReasoning] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [tokensPerSec, setTokensPerSec] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [approvedFiles, setApprovedFiles] = useState<Set<string>>(new Set());
  const [rejectedFiles, setRejectedFiles] = useState<Set<string>>(new Set());
  
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionResult[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  useEffect(() => {
    async function loadSession() {
      try {
        const sessions = await listSessions();
        if (sessions.length > 0) {
          const latest = sessions[0];
          setSessionId(latest.id);
          const msgs = await getSessionMessages(latest.id);
          // Convert to our format (role, content)
          setMessages(msgs.map(m => ({ role: m.role, content: m.content })));
        }
      } catch (e) {
        console.error("Failed to load sessions", e);
      }
    }
    loadSession();
  }, []);

  const handleFocus = () => {
    preloadModel(useReasoning ? 'reasoning' : 'coder').catch(console.error);
  };

  useEffect(() => {
    const handleSendToChat = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setInput(prev => prev + (prev ? '\n' : '') + customEvent.detail);
      }
    };
    window.addEventListener('send-to-chat', handleSendToChat);
    return () => window.removeEventListener('send-to-chat', handleSendToChat);
  }, []);

  const handleInputChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    
    // Check for mention trigger
    const match = /(?:^|\s)@([^\s]*)$/.exec(val);
    if (match) {
      setMentionQuery(match[1]);
      try {
        const results = await searchMentions(match[1]);
        setMentionSuggestions(results);
      } catch (err) {
        console.error(err);
      }
    } else {
      setMentionQuery(null);
      setMentionSuggestions([]);
    }
  };

  const insertMention = (label: string) => {
    if (mentionQuery !== null) {
      const match = /(?:^|\s)@([^\s]*)$/.exec(input);
      if (match) {
        const before = input.substring(0, match.index);
        // If there was a space before the @, preserve it
        const prefix = input[match.index] === ' ' ? ' ' : '';
        setInput(before + prefix + '@' + label + ' ');
      }
    }
    setMentionQuery(null);
    setMentionSuggestions([]);
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

    let currentSessionId = sessionId;
    if (!currentSessionId) {
      currentSessionId = crypto.randomUUID();
      try {
        await createSession(currentSessionId, "New Session");
        setSessionId(currentSessionId);
      } catch (e) {
        console.error("Failed to create session", e);
      }
    }
    
    if (currentSessionId) {
      await addMessage(currentSessionId, 'user', input).catch(console.error);
    }

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

        if (currentSessionId) {
          addMessage(currentSessionId, 'assistant', accumulated).catch(console.error);
          
          // Auto-summarization at turn 20 (approx 40 messages)
          const totalMessages = messages.length + 2; // previous + user + this assistant
          if (totalMessages === 40) {
            // Background summarization task
            sendChatMessage(
              "Summarize this conversation briefly in 1-2 sentences. Return ONLY the summary, no intro/outro.",
              [...messages, newMsg, { role: 'assistant', content: accumulated }],
              crypto.randomUUID(),
              null,
              null,
              null,
              false,
              false // multiFileIntent
            ).catch(console.error);
            // Wait, we need to capture the stream for the summary to actually save it.
            // A better way is to call an orchestrator command directly for summarizing, but we can do it by listening to the background stream ID.
            const summaryStreamId = crypto.randomUUID();
            let summaryAccumulated = '';
            listen<ChatStreamChunk>(summaryStreamId, (ev) => {
              if (ev.payload.message?.content) summaryAccumulated += ev.payload.message.content;
              if (ev.payload.done && currentSessionId) {
                updateSessionSummary(currentSessionId, summaryAccumulated).catch(console.error);
              }
            }).then(() => {
              sendChatMessage(
                "Summarize this conversation briefly in 1-2 sentences. Return ONLY the summary.",
                [...messages, newMsg, { role: 'assistant', content: accumulated }],
                summaryStreamId,
                null,
                null,
                null,
                false,
                false // multiFileIntent
              ).catch(console.error);
            });
          }
        }

        setMessages(prev => [...prev, { role: 'assistant', content: accumulated }]);
        setStreamingMessage('');
        setIsStreaming(false);
      }
    });

    resetTimeout();

    try {
      const ext = props.activeFilePath ? props.activeFilePath.split('.').pop() || null : null;
      const multiFileIntent = /(refactor|rename|move|update all|change everywhere|edit these files)/i.test(input);
      
      await sendChatMessage(
        input,
        messages,
        streamId,
        props.activeFilePath || null,
        props.activeLineNumber || null,
        ext,
        useReasoning,
        multiFileIntent
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

    const parts: React.ReactNode[] = [];

    const fileChangeRegex = /<leaf_file_change>\s*<path>(.*?)<\/path>\s*<content>([\s\S]*?)<\/content>\s*<\/leaf_file_change>/g;
    let match;
    let lastIndex = 0;

    while ((match = fileChangeRegex.exec(content)) !== null) {
      const textBefore = content.substring(lastIndex, match.index);
      if (textBefore) {
        parts.push(<span key={`text-${lastIndex}`}>{renderTextWithThink(textBefore)}</span>);
      }

      const path = match[1].trim();
      const newContent = match[2];
      const changeKey = `${path}-${newContent.length}`; // Simple unique key

      if (approvedFiles.has(changeKey)) {
        parts.push(<div key={`approved-${lastIndex}`} style={{ color: 'green', margin: '4px 0' }}>✓ Approved changes to {path}</div>);
      } else if (rejectedFiles.has(changeKey)) {
        parts.push(<div key={`rejected-${lastIndex}`} style={{ color: 'red', margin: '4px 0' }}>✗ Rejected changes to {path}</div>);
      } else {
        parts.push(
          <DiffReviewPanel
            key={`diff-${lastIndex}`}
            path={path}
            newContent={newContent}
            onApprove={() => setApprovedFiles(prev => new Set(prev).add(changeKey))}
            onReject={() => setRejectedFiles(prev => new Set(prev).add(changeKey))}
          />
        );
      }

      lastIndex = fileChangeRegex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(<span key={`text-${lastIndex}`}>{renderTextWithThink(content.substring(lastIndex))}</span>);
    }

    return parts;
  };

  const renderTextWithThink = (text: string) => {
    const parts = text.split(/(<think>[\s\S]*?(?:<\/think>|$))/gi);
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
      <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {mentionQuery !== null && mentionSuggestions.length > 0 && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            maxHeight: '200px',
            overflowY: 'auto',
            background: '#252526',
            border: '1px solid #333',
            borderBottom: 'none',
            borderRadius: '4px 4px 0 0',
            zIndex: 10
          }}>
            {mentionSuggestions.map((m, idx) => (
              <div 
                key={idx}
                onClick={() => insertMention(m.label)}
                style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between' }}
                onMouseEnter={e => e.currentTarget.style.background = '#2a2d2e'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span>{m.label}</span>
                <span style={{ fontSize: '0.8em', color: '#888' }}>{m.kind}</span>
              </div>
            ))}
          </div>
        )}
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
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a message... (Use @ to mention files/symbols)"
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
