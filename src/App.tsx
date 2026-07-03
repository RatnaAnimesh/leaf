import { useEffect, useState, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { FileExplorer } from './components/FileExplorer/FileExplorer';
import { SourceControlPanel } from './components/FileExplorer/SourceControlPanel';
import { ChatPanel } from './components/ChatPanel/ChatPanel';
import { CodeEditor } from './components/Editor/CodeEditor';
import { TerminalDrawer } from './components/TerminalDrawer/TerminalDrawer';
import { Folder, GitBranch, X, Circle } from 'lucide-react';
import { EditorProvider, useEditor } from './lib/EditorContext';
import { loadWorkspaceConfig, saveWorkspaceConfig, readFile, writeFile, startWatchingWorkspace, addRecentWorkspace } from './lib/tauri-commands';
import { WorkspaceConfig } from './lib/types';
import { WelcomeScreen } from './components/WelcomeScreen/WelcomeScreen';

interface LeafIDEProps {
  workspaceRoot: string;
}

function LeafIDE({ workspaceRoot }: LeafIDEProps) {
  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<'explorer' | 'git'>('explorer');
  const { state, openFile, closeFile, updateTabContent, updateTabSavedContent, updateTabViewState, setActiveTab } = useEditor();

  useEffect(() => {
    loadWorkspaceConfig(workspaceRoot).then(setConfig);
    startWatchingWorkspace(workspaceRoot).catch(console.error);
    addRecentWorkspace(workspaceRoot).catch(console.error);
  }, []);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Cmd+Shift+L for chat toggle
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setChatCollapsed(prev => !prev);
      }
      
      // Cmd+` for terminal toggle
      if (e.metaKey && e.key === '`') {
        e.preventDefault();
        setTerminalOpen(prev => !prev);
      }
      
      // Cmd+S for save
      if (e.metaKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (state.activeTabPath) {
          const activeTab = state.openTabs.find(t => t.path === state.activeTabPath);
          if (activeTab && activeTab.content !== activeTab.savedContent) {
            try {
              await writeFile(activeTab.path, activeTab.content);
              updateTabSavedContent(activeTab.path, activeTab.content);
            } catch (err) {
              console.error("Failed to save file", err);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, updateTabSavedContent]);

  const handleLayoutChange = useCallback((layout: any, type: 'main' | 'left') => {
    if (!config) return;
    
    // Debounce this in a real app, doing naive set here for Phase 1
    // Actually spec requested 300ms debounce
    const newConfig = { ...config };
    if (type === 'main') {
      newConfig.mainSplit = layout;
    } else {
      newConfig.leftSplit = layout;
    }
    setConfig(newConfig);
    
    // We should use a timeout for the save
    if ((window as any).saveTimeout) clearTimeout((window as any).saveTimeout);
    (window as any).saveTimeout = setTimeout(() => {
      saveWorkspaceConfig(workspaceRoot, newConfig);
    }, 300);
  }, [config]);

  if (!config) return <div>Loading layout...</div>;

  const getLanguage = (path: string) => {
    const ext = path.substring(path.lastIndexOf('.'));
    const map: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript',
      '.js': 'javascript', '.jsx': 'javascript',
      '.rs': 'rust',
      '.py': 'python',
      '.json': 'json',
      '.md': 'markdown',
      '.toml': 'toml',
      '.css': 'css',
      '.html': 'html',
    };
    return map[ext] || 'plaintext';
  };

  const activeTab = state.openTabs.find(t => t.path === state.activeTabPath);

  // Soothing Dark Theme Colors
  const colors = {
    bgDark: '#1e1e1e', // Base background
    bgPanel: '#252526', // Panel background
    border: '#333333',
    textPrimary: '#cccccc',
    textSecondary: '#888888',
    highlight: '#2a2d2e',
    accent: '#3794ff',
  };

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'row', backgroundColor: colors.bgDark, color: colors.textPrimary, overflow: 'hidden' }}>
      
      {/* Activity Bar */}
      <div style={{ width: '48px', minWidth: '48px', display: 'flex', flexDirection: 'column', borderRight: `1px solid ${colors.border}`, backgroundColor: colors.bgDark, alignItems: 'center', paddingTop: '12px', gap: '8px' }}>
        <button 
          style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: leftTab === 'explorer' ? colors.textPrimary : colors.textSecondary, border: 'none', cursor: 'pointer', borderLeft: leftTab === 'explorer' ? `2px solid ${colors.accent}` : '2px solid transparent', transition: 'color 0.2s ease' }}
          title="Explorer"
          onClick={() => setLeftTab('explorer')}
        >
          <Folder size={24} strokeWidth={1.5} />
        </button>
        <button 
          style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: leftTab === 'git' ? colors.textPrimary : colors.textSecondary, border: 'none', cursor: 'pointer', borderLeft: leftTab === 'git' ? `2px solid ${colors.accent}` : '2px solid transparent', transition: 'color 0.2s ease' }}
          title="Source Control"
          onClick={() => setLeftTab('git')}
        >
          <GitBranch size={24} strokeWidth={1.5} />
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <PanelGroup direction="horizontal" onLayout={(sizes) => handleLayoutChange(sizes, 'main')}>
        <Panel defaultSize={config.mainSplit[0] || 50} minSize={20} maxSize={70}>
          <PanelGroup direction="vertical" onLayout={(sizes) => handleLayoutChange(sizes, 'left')}>
            <Panel defaultSize={config.leftSplit[0] || 50} minSize={20}>
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: colors.bgPanel }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  {leftTab === 'explorer' && (
                    <FileExplorer workspaceRoot={workspaceRoot} onFileSelect={async (p) => {
                      if (!state.openTabs.find(t => t.path === p && !t.isDiff)) {
                        try {
                          const content = await readFile(p);
                          openFile(p, content);
                        } catch (e) {
                          console.error("Read err", e);
                        }
                      } else {
                        setActiveTab(p);
                      }
                    }} />
                  )}
                  {leftTab === 'git' && (
                    <SourceControlPanel workspaceRoot={workspaceRoot} onFileSelect={(p, content, isDiff, originalContent) => {
                      openFile(p, content, isDiff, originalContent);
                    }} />
                  )}
                </div>
              </div>
            </Panel>
            <PanelResizeHandle style={{ height: '2px', background: colors.border, cursor: 'row-resize' }} />
            <Panel 
              defaultSize={chatCollapsed ? 0 : (config.leftSplit[1] || 50)} 
              minSize={15} 
              collapsible={true}
            >
              {!chatCollapsed && <ChatPanel activeFilePath={activeTab?.path} activeLineNumber={activeTab?.cursorPosition?.lineNumber} />}
            </Panel>
          </PanelGroup>
        </Panel>
        
        <PanelResizeHandle style={{ width: '2px', background: colors.border, cursor: 'col-resize' }} />
        
        <Panel defaultSize={config.mainSplit[1] || 50} minSize={30}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={terminalOpen ? 70 : 100}>
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: colors.bgDark }}>
                <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border}`, background: colors.bgDark }}>
                  {state.openTabs.map(tab => (
                    <div 
                      key={tab.path} 
                      style={{ 
                        padding: '8px 16px', 
                        cursor: 'pointer', 
                        background: tab.path === state.activeTabPath ? colors.bgPanel : 'transparent',
                        color: tab.path === state.activeTabPath ? colors.textPrimary : colors.textSecondary,
                        borderRight: `1px solid ${colors.border}`,
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      onClick={() => setActiveTab(tab.path)}
                    >
                      {tab.path.split('/').pop()}
                      {tab.content !== tab.savedContent && <Circle size={8} fill={colors.accent} color={colors.accent} style={{ marginLeft: 8 }} />}
                      <button onClick={(e) => { e.stopPropagation(); closeFile(tab.path); }} style={{ marginLeft: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: colors.textSecondary, cursor: 'pointer', padding: 2, borderRadius: 4 }}>
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  {activeTab ? (
                    <CodeEditor
                      filePath={activeTab.path}
                      content={activeTab.content}
                      language={activeTab.isDiff ? 'diff' : getLanguage(activeTab.path)}
                      onChange={(newContent) => updateTabContent(activeTab.path, newContent)}
                      onViewStateChange={(pos, scroll) => updateTabViewState(activeTab.path, pos, scroll)}
                      initialViewState={{ cursorPosition: activeTab.cursorPosition, scrollTop: activeTab.scrollTop }}
                      isDiff={activeTab.isDiff}
                      originalContent={activeTab.originalContent}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      No file open
                    </div>
                  )}
                </div>
              </div>
            </Panel>
            
            {terminalOpen && (
              <>
                <PanelResizeHandle style={{ height: '2px', background: colors.border, cursor: 'row-resize' }} />
                <Panel defaultSize={30} minSize={10}>
                  <TerminalDrawer 
                    onClose={() => setTerminalOpen(false)}
                    onSendToChat={(text) => {
                      // Note: We need a way to send this text to the chat panel.
                      // For now, we will dispatch a custom event that ChatPanel can listen to.
                      window.dispatchEvent(new CustomEvent('send-to-chat', { detail: text }));
                    }}
                  />
                </Panel>
              </>
            )}
          </PanelGroup>
        </Panel>
      </PanelGroup>
      </div>
    </div>
  );
}

export default function App() {
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);

  if (!workspaceRoot) {
    return <WelcomeScreen onOpenFolder={setWorkspaceRoot} />;
  }

  return (
    <EditorProvider>
      <LeafIDE workspaceRoot={workspaceRoot} />
    </EditorProvider>
  );
}
