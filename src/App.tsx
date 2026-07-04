import { useEffect, useState, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { FileExplorer } from './components/FileExplorer/FileExplorer';
import { SourceControlPanel } from './components/FileExplorer/SourceControlPanel';
import { ChatPanel } from './components/ChatPanel/ChatPanel';
import { CodeEditor } from './components/Editor/CodeEditor';
import { TerminalDrawer } from './components/TerminalDrawer/TerminalDrawer';
import { Folder, GitBranch, X, Circle, Network, Home } from 'lucide-react';
import { EditorProvider, useEditor } from './lib/EditorContext';
import { loadWorkspaceConfig, saveWorkspaceConfig, readFile, writeFile, startWatchingWorkspace, addRecentWorkspace, rebuildIndex } from './lib/tauri-commands';
import { WorkspaceConfig } from './lib/types';
import { WelcomeScreen } from './components/WelcomeScreen/WelcomeScreen';
import { GraphViewer } from './components/GraphViewer/GraphViewer';

interface LeafIDEProps {
  workspaceRoot: string;
  onSwitchProject: () => void;
}

function LeafIDE({ workspaceRoot, onSwitchProject }: LeafIDEProps) {
  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [leftTab, setLeftTab] = useState<'explorer' | 'git'>('explorer');
  const { state, openFile, closeFile, updateTabContent, updateTabSavedContent, updateTabViewState, setActiveTab } = useEditor();

  useEffect(() => {
    loadWorkspaceConfig(workspaceRoot).then(setConfig);
    startWatchingWorkspace(workspaceRoot).catch(console.error);
    addRecentWorkspace(workspaceRoot).catch(console.error);
    rebuildIndex(workspaceRoot).catch(console.error);
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

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'row', backgroundColor: 'var(--color-base)', color: 'var(--color-text-primary)', overflow: 'hidden', padding: 'var(--panel-gap)' }}>
      
      {/* Activity Bar */}
      <div className="panel-container" style={{ width: '48px', minWidth: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '12px', gap: '8px', marginRight: 'var(--panel-gap)' }}>
        <button 
          className={`icon-button ${leftTab === 'explorer' ? 'active' : ''}`}
          style={{ width: '36px', height: '36px', background: 'transparent', border: 'none', cursor: 'pointer' }}
          title="Explorer"
          onClick={() => setLeftTab('explorer')}
        >
          <Folder size={20} strokeWidth={1.5} />
        </button>
        <button 
          className={`icon-button ${leftTab === 'git' ? 'active' : ''}`}
          style={{ width: '36px', height: '36px', background: 'transparent', border: 'none', cursor: 'pointer' }}
          title="Source Control"
          onClick={() => setLeftTab('git')}
        >
          <GitBranch size={20} strokeWidth={1.5} />
        </button>
        <button 
          className={`icon-button ${showGraph ? 'active' : ''}`}
          style={{ width: '36px', height: '36px', background: 'transparent', border: 'none', cursor: 'pointer' }}
          title="Knowledge Graph"
          onClick={() => setShowGraph(true)}
        >
          <Network size={20} strokeWidth={1.5} />
        </button>
        <div style={{ flex: 1 }}></div>
        <button 
          className="icon-button"
          style={{ width: '36px', height: '36px', background: 'transparent', border: 'none', cursor: 'pointer', marginBottom: '12px' }}
          title="Switch Project"
          onClick={onSwitchProject}
        >
          <Home size={20} strokeWidth={1.5} />
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {showGraph && <GraphViewer 
          workspaceRoot={workspaceRoot} 
          onClose={() => setShowGraph(false)} 
          onNodeClick={async (node) => {
            if (node.path) {
              if (!state.openTabs.find(t => t.path === node.path && !t.isDiff)) {
                try {
                  const content = await readFile(node.path);
                  openFile(node.path, content, false, undefined, node.line || 1);
                } catch (e) {
                  console.error("Read err", e);
                }
              } else {
                setActiveTab(node.path);
                // Also need a way to jump to line if tab is already open.
                // Our openFile logic handles updating cursor if we call it again.
                // But wait, openFile needs content. If it's already open, we don't want to re-read.
                // Let's just use openFile with empty content, it won't overwrite existing if it finds it, 
                // because EditorContext openFile only updates cursor position if it already exists!
                openFile(node.path, "", false, undefined, node.line || 1);
              }
              setShowGraph(false);
            }
          }}
        />}
        <PanelGroup direction="horizontal" onLayout={(sizes) => handleLayoutChange(sizes, 'main')}>
        <Panel defaultSize={config.mainSplit[0] || 50} minSize={20} maxSize={70}>
          <PanelGroup direction="vertical" onLayout={(sizes) => handleLayoutChange(sizes, 'left')}>
            <Panel defaultSize={config.leftSplit[0] || 50} minSize={20}>
              <div className={`panel-container ${leftTab === 'explorer' || leftTab === 'git' ? 'active-panel' : ''}`} style={{ height: '100%', overflow: 'hidden' }}>
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
            <PanelResizeHandle style={{ height: '1px', cursor: 'row-resize', background: 'var(--color-border)' }} />
            <Panel 
              defaultSize={chatCollapsed ? 0 : (config.leftSplit[1] || 50)} 
              minSize={15} 
              collapsible={true}
            >
              {!chatCollapsed && (
                <div className="panel-container" style={{ height: '100%', overflow: 'hidden' }}>
                  <ChatPanel workspaceRoot={workspaceRoot} activeFilePath={activeTab?.path} activeLineNumber={activeTab?.cursorPosition?.lineNumber} />
                </div>
              )}
            </Panel>
          </PanelGroup>
        </Panel>
        
        <PanelResizeHandle style={{ width: '1px', cursor: 'col-resize', background: 'var(--color-border)' }} />
        
        <Panel defaultSize={config.mainSplit[1] || 50} minSize={30}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={terminalOpen ? 70 : 100}>
              <div className="panel-container active-panel" style={{ height: '100%' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                  {state.openTabs.map(tab => (
                    <div 
                      key={tab.path} 
                      style={{ 
                        padding: '8px 16px', 
                        cursor: 'pointer', 
                        background: tab.path === state.activeTabPath ? 'var(--color-accent-subtle)' : 'transparent',
                        color: tab.path === state.activeTabPath ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        borderRight: '1px solid var(--color-border)',
                        borderBottom: tab.path === state.activeTabPath ? '1px solid var(--color-accent)' : '1px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '13px'
                      }}
                      onClick={() => setActiveTab(tab.path)}
                    >
                      {tab.path.split('/').pop()}
                      {tab.content !== tab.savedContent && <Circle size={8} fill="var(--color-accent)" color="var(--color-accent)" style={{ marginLeft: 8 }} />}
                      <button onClick={(e) => { e.stopPropagation(); closeFile(tab.path); }} style={{ marginLeft: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: 2, borderRadius: 4 }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ flex: 1, overflow: 'hidden', background: 'var(--color-base)' }}>
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-secondary)' }}>
                      No file open
                    </div>
                  )}
                </div>
              </div>
            </Panel>
            
            {terminalOpen && (
              <>
                <PanelResizeHandle style={{ height: '1px', cursor: 'row-resize', background: 'var(--color-border)' }} />
                <Panel defaultSize={30} minSize={10}>
                  <div className="panel-container" style={{ height: '100%', overflow: 'hidden' }}>
                    <TerminalDrawer 
                      onClose={() => setTerminalOpen(false)}
                      onSendToChat={(text) => {
                        window.dispatchEvent(new CustomEvent('send-to-chat', { detail: text }));
                      }}
                    />
                  </div>
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
      <LeafIDE workspaceRoot={workspaceRoot} onSwitchProject={() => setWorkspaceRoot(null)} />
    </EditorProvider>
  );
}
