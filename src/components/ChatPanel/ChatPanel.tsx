import { useState, useEffect } from 'react';
import { ChatMessage, ChatStreamChunk, ModelStatus, MentionResult } from '../../lib/types';
import { sendChatMessage, preloadModel, listSessions, getSessionMessages, createSession, addMessage, updateSessionSummary, searchMentions } from '../../lib/tauri-commands';
import { listen } from '@tauri-apps/api/event';
import { DiffReviewPanel } from '../DiffReviewPanel/DiffReviewPanel';
import { FileText, X, Plus, Send } from 'lucide-react';

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

  const [addedContext, setAddedContext] = useState<MentionResult[]>([]);
  const [showContextSearch, setShowContextSearch] = useState(false);
  const [contextSearchQuery, setContextSearchQuery] = useState('');

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

  const insertMention = (m: MentionResult) => {
    if (showContextSearch) {
      if (!addedContext.find(c => c.label === m.label)) {
        setAddedContext(prev => [...prev, m]);
      }
      setContextSearchQuery('');
      setShowContextSearch(false);
      setMentionSuggestions([]);
      return;
    }

    if (mentionQuery !== null) {
      const match = /(?:^|\s)@([^\s]*)$/.exec(input);
      if (match) {
        const before = input.substring(0, match.index);
        // If there was a space before the @, preserve it
        const prefix = input[match.index] === ' ' ? ' ' : '';
        setInput(before + prefix + '@' + m.label + ' ');
      }
    }
    setMentionQuery(null);
    setMentionSuggestions([]);
  };

  const sendMessage = async () => {
    if ((!input.trim() && addedContext.length === 0) || isStreaming) return;
    
    let finalInput = input;
    if (addedContext.length > 0) {
      const contextBlock = "Context:\n" + addedContext.map(c => `@${c.label}`).join('\n') + "\n\n";
      finalInput = contextBlock + input;
    }

    const newMsg: ChatMessage = { role: 'user', content: finalInput };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setInput('');
    setAddedContext([]);
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
        parts.push(<div key={`approved-${lastIndex}`} style={{ color: '#4caf50', margin: '4px 0' }}>✓ Approved changes to {path}</div>);
      } else if (rejectedFiles.has(changeKey)) {
        parts.push(<div key={`rejected-${lastIndex}`} style={{ color: '#f44336', margin: '4px 0' }}>✗ Rejected changes to {path}</div>);
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
            padding: '8px', 
            margin: '4px 0', 
            borderLeft: '4px solid #333333', 
            color: '#888888', 
            backgroundColor: '#1e1e1e',
            borderRadius: '0 4px 4px 0',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            fontSize: '0.85em',
          }}>
            {inner}
          </div>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px', boxSizing: 'border-box', backgroundColor: '#252526', color: '#cccccc' }}>
      <div style={{ flex: 1, overflow: 'auto', marginBottom: '8px', paddingRight: '4px' }}>
        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          return (
            <div key={i} style={{ 
              marginBottom: '16px', 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: isUser ? 'flex-end' : 'flex-start' 
            }}>
              <div style={{
                backgroundColor: isUser ? '#2a2d2e' : '#1e1e1e',
                border: '1px solid #333333',
                padding: '10px 14px',
                borderRadius: isUser ? '16px 16px 0 16px' : '16px 16px 16px 0',
                maxWidth: '85%',
                whiteSpace: 'pre-wrap', 
                wordBreak: 'break-word',
                fontSize: '0.9rem',
                lineHeight: '1.4'
              }}>
                {renderMessageContent(m.content)}
              </div>
            </div>
          );
        })}
        {isStreaming && (
          <div style={{ 
            marginBottom: '16px', 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'flex-start' 
          }}>
            <div style={{
              backgroundColor: '#1e1e1e',
              border: '1px solid #333333',
              padding: '10px 14px',
              borderRadius: '16px 16px 16px 0',
              maxWidth: '85%',
              whiteSpace: 'pre-wrap', 
              wordBreak: 'break-word',
              fontSize: '0.9rem',
              lineHeight: '1.4'
            }}>
              {renderMessageContent(streamingMessage)}
              <span style={{ display: 'inline-block', width: '8px', height: '14px', backgroundColor: '#cccccc', marginLeft: '4px', animation: 'blink 1s step-end infinite' }} />
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
            background: '#1e1e1e',
            border: '1px solid #333333',
            borderBottom: 'none',
            borderRadius: '4px 4px 0 0',
            zIndex: 10
          }}>
            {mentionSuggestions.map((m, idx) => (
              <div 
                key={idx}
                onClick={() => insertMention(m)}
                style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid #333333', display: 'flex', justifyContent: 'space-between' }}
                onMouseEnter={e => e.currentTarget.style.background = '#2a2d2e'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span>{m.label}</span>
                <span style={{ fontSize: '0.8em', color: '#888888' }}>{m.kind}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <select 
            value={useReasoning ? 'reasoning' : 'coder'} 
            onChange={(e) => setUseReasoning(e.target.value === 'reasoning')}
            disabled={isStreaming}
            style={{ 
              backgroundColor: '#1e1e1e', 
              color: '#cccccc', 
              border: '1px solid #333333', 
              padding: '4px 12px', 
              borderRadius: '16px',
              cursor: 'pointer',
              outline: 'none',
              fontSize: '0.8rem'
            }}
          >
            <option value="coder">Coder Model (Ornith)</option>
            <option value="reasoning">Reasoning Model (Gemma)</option>
          </select>
        </div>

        {addedContext.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
            {addedContext.map((c, i) => (
              <div key={i} style={{ 
                backgroundColor: '#333333', 
                color: '#cccccc', 
                padding: '4px 10px', 
                borderRadius: '12px', 
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <FileText size={12} /> {c.label}
                <span 
                  style={{ cursor: 'pointer', color: '#888888', marginLeft: '4px', display: 'flex', alignItems: 'center' }} 
                  onClick={() => setAddedContext(prev => prev.filter(item => item.label !== c.label))}
                >
                  <X size={12} />
                </span>
              </div>
            ))}
          </div>
        )}

        {showContextSearch && (
          <div style={{ marginBottom: '8px' }}>
            <input 
              type="text"
              autoFocus
              value={contextSearchQuery}
              onChange={async (e) => {
                const val = e.target.value;
                setContextSearchQuery(val);
                if (val.trim()) {
                  try {
                    const results = await searchMentions(val);
                    setMentionSuggestions(results);
                  } catch (err) {
                    console.error(err);
                  }
                } else {
                  setMentionSuggestions([]);
                }
              }}
              placeholder="Search files/symbols to add..."
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: '#1e1e1e',
                color: '#cccccc',
                border: '1px solid #007acc',
                borderRadius: '8px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
          <button 
            onClick={() => {
              setShowContextSearch(!showContextSearch);
              setContextSearchQuery('');
              setMentionSuggestions([]);
            }}
            disabled={isStreaming}
            title="Add Context"
            style={{
              backgroundColor: showContextSearch ? '#333333' : '#1e1e1e',
              color: '#cccccc',
              border: '1px solid #333333',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              flexShrink: 0,
            }}
          >
            <Plus size={18} />
          </button>
          
          <textarea 
            style={{ 
              flex: 1, 
              padding: '8px 12px', 
              resize: 'none',
              height: '36px',
              minHeight: '36px',
              maxHeight: '150px',
              backgroundColor: '#1e1e1e', 
              color: '#cccccc', 
              border: '1px solid #333333',
              borderRadius: '18px',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: '1.5',
              boxSizing: 'border-box'
            }}
            value={input} 
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a message..."
            disabled={isStreaming}
          />
          <button 
            onClick={sendMessage} 
            disabled={isStreaming} 
            style={{ 
              backgroundColor: '#007acc',
              color: 'white',
              border: 'none',
              padding: '0 16px',
              height: '36px',
              borderRadius: '18px',
              cursor: isStreaming ? 'not-allowed' : 'pointer',
              opacity: isStreaming ? 0.6 : 1,
              outline: 'none',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Send size={16} />
          </button>
        </div>
        
        {/* Model Status Pill */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '4px', color: '#888888' }}>
          <div>
            {modelStatus && (
              <span style={{ 
                padding: '2px 6px', 
                borderRadius: '12px', 
                backgroundColor: modelStatus.state === 'ready' ? '#1e3320' : '#332b1e',
                color: modelStatus.state === 'ready' ? '#4caf50' : '#ff9800',
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
