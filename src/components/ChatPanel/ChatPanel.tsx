import { useState, useEffect } from 'react';
import { ChatMessage, ChatStreamChunk, ModelStatus, MentionResult } from '../../lib/types';
import { cancelChatMessage, sendChatMessage, preloadModel, listSessions, getSessionMessages, createSession, addMessage, updateSessionSummary, searchMentions } from '../../lib/tauri-commands';
import { listen } from '@tauri-apps/api/event';
import { DiffReviewPanel } from '../DiffReviewPanel/DiffReviewPanel';
import { FileText, X, Plus, Send, Brain, Code, Loader2, Square } from 'lucide-react';

export function ChatPanel(props: { workspaceRoot: string, activeFilePath?: string, activeLineNumber?: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [useReasoning, setUseReasoning] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [tokensPerSec, setTokensPerSec] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [approvedFiles, setApprovedFiles] = useState<Set<string>>(new Set());
  const [rejectedFiles, setRejectedFiles] = useState<Set<string>>(new Set());
  
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionResult[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const [addedContext, setAddedContext] = useState<MentionResult[]>([]);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [showContextSearch, setShowContextSearch] = useState(false);
  const [contextSearchQuery, setContextSearchQuery] = useState('');

  useEffect(() => {
    async function loadSession() {
      try {
        const sessions = await listSessions(props.workspaceRoot);
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
    if (!isLoadingModel) {
      preloadModel(useReasoning ? 'reasoning' : 'coder').catch(console.error);
    }
  };

  const handleToggleModel = async () => {
    if (isStreaming || isLoadingModel) return;
    const nextReasoning = !useReasoning;
    setUseReasoning(nextReasoning);
    
    setIsLoadingModel(true);
    try {
      await preloadModel(nextReasoning ? 'reasoning' : 'coder');
    } catch (e) {
      console.error("Failed to preload model:", e);
    } finally {
      setIsLoadingModel(false);
    }
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

  const stopResponse = async () => {
    if (activeStreamId) {
      await cancelChatMessage(activeStreamId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) {
        sendMessage();
      }
    }
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
        await createSession(currentSessionId, "New Session", props.workspaceRoot);
        setSessionId(currentSessionId);
      } catch (e) {
        console.error("Failed to create session", e);
      }
    }
    
    if (currentSessionId) {
      await addMessage(currentSessionId, 'user', input).catch(console.error);
    }

    const streamId = crypto.randomUUID();
    setActiveStreamId(streamId);
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
      setActiveStreamId(null);
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
        setActiveStreamId(null);
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
        parts.push(<div key={`approved-${lastIndex}`} style={{ color: 'var(--color-accent)', margin: '4px 0' }}>✓ Approved changes to {path}</div>);
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
            color: 'var(--color-text-secondary)', 
            backgroundColor: 'var(--color-base)',
            borderRadius: '0 4px 4px 0',
            fontFamily: "'JetBrains Mono', monospace",
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px', boxSizing: 'border-box', backgroundColor: 'var(--color-surface)', color: 'var(--color-text-primary)' }}>
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
                backgroundColor: isUser ? 'var(--color-accent-subtle)' : 'var(--color-base)',
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
              backgroundColor: 'var(--color-base)',
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
              <span style={{ display: 'inline-block', width: '8px', height: '14px', backgroundColor: 'var(--color-text-primary)', marginLeft: '4px', animation: 'blink 1s step-end infinite' }} />
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
            background: 'var(--color-base)',
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
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-accent-subtle)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span>{m.label}</span>
                <span style={{ fontSize: '0.8em', color: 'var(--color-text-secondary)' }}>{m.kind}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              backgroundColor: 'var(--color-base)', 
              border: '1px solid #333333', 
              borderRadius: '20px',
              padding: '4px',
              width: '100%',
              position: 'relative',
              cursor: (isStreaming || isLoadingModel) ? 'not-allowed' : 'pointer',
              opacity: (isStreaming || isLoadingModel) ? 0.7 : 1,
            }}
            onClick={handleToggleModel}
          >
            <div 
              style={{
                position: 'absolute',
                top: '4px',
                bottom: '4px',
                width: 'calc(50% - 4px)',
                left: useReasoning ? 'calc(50%)' : '4px',
                backgroundColor: 'var(--color-accent-subtle)',
                borderRadius: '16px',
                transition: 'left 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
              }}
            />
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '6px', zIndex: 1, color: !useReasoning ? '#fff' : 'var(--color-text-secondary)', transition: 'color 0.3s' }}>
              {!useReasoning && isLoadingModel ? (
                <Loader2 className="animate-spin" size={14} style={{ marginRight: '6px', animation: 'spin 1s linear infinite' }} />
              ) : (
                <Code size={14} style={{ marginRight: '6px' }} />
              )}
              <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                {(!useReasoning && isLoadingModel) ? 'Loading...' : 'Coder'}
              </span>
            </div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '6px', zIndex: 1, color: useReasoning ? '#fff' : 'var(--color-text-secondary)', transition: 'color 0.3s' }}>
              {useReasoning && isLoadingModel ? (
                <Loader2 className="animate-spin" size={14} style={{ marginRight: '6px', animation: 'spin 1s linear infinite' }} />
              ) : (
                <Brain size={14} style={{ marginRight: '6px' }} />
              )}
              <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                {(useReasoning && isLoadingModel) ? 'Loading...' : 'Reasoning'}
              </span>
            </div>
          </div>
        </div>

        {addedContext.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
            {addedContext.map((c, i) => (
              <div key={i} style={{ 
                backgroundColor: 'var(--color-border)', 
                color: 'var(--color-text-primary)', 
                padding: '4px 10px', 
                borderRadius: '12px', 
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <FileText size={12} /> {c.label}
                <span 
                  style={{ cursor: 'pointer', color: 'var(--color-text-secondary)', marginLeft: '4px', display: 'flex', alignItems: 'center' }} 
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
                backgroundColor: 'var(--color-base)',
                color: 'var(--color-text-primary)',
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
              backgroundColor: showContextSearch ? 'var(--color-border)' : 'var(--color-base)',
              color: 'var(--color-text-primary)',
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
              backgroundColor: 'var(--color-base)', 
              color: 'var(--color-text-primary)', 
              border: '1px solid #333333',
              borderRadius: '18px',
              outline: 'none',
              fontFamily: "'Outfit', sans-serif",
              lineHeight: '1.5',
              boxSizing: 'border-box'
            }}
            value={input} 
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button 
              onClick={stopResponse}
              title="Stop Response"
              style={{ 
                backgroundColor: '#cc3333',
                color: 'white',
                border: 'none',
                padding: '0 16px',
                height: '36px',
                borderRadius: '18px',
                cursor: 'pointer',
                outline: 'none',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button 
              onClick={sendMessage}
              disabled={(!input.trim() && addedContext.length === 0)} 
              title="Send Message"
              style={{ 
                backgroundColor: '#007acc',
                color: 'white',
                border: 'none',
                padding: '0 16px',
                height: '36px',
                borderRadius: '18px',
                cursor: (!input.trim() && addedContext.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (!input.trim() && addedContext.length === 0) ? 0.6 : 1,
                outline: 'none',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Send size={16} />
            </button>
          )}
        </div>
        
        {/* Model Status Pill */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '4px', color: 'var(--color-text-secondary)' }}>
          <div>
            {modelStatus && (
              <span style={{ 
                padding: '2px 6px', 
                borderRadius: '12px', 
                backgroundColor: modelStatus.state === 'ready' ? '#1e3320' : '#332b1e',
                color: modelStatus.state === 'ready' ? 'var(--color-accent)' : '#ff9800',
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
