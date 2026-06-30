import { useEffect, useState, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { FileExplorer } from './components/FileExplorer/FileExplorer';
import { ChatPanel } from './components/ChatPanel/ChatPanel';
import { CodeEditor } from './components/Editor/CodeEditor';
import { EditorProvider, useEditor } from './lib/EditorContext';
import { loadWorkspaceConfig, saveWorkspaceConfig, readFile, writeFile, startWatchingWorkspace } from './lib/tauri-commands';
import { WorkspaceConfig } from './lib/types';

function LeafIDE() {
  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const workspaceRoot = '.'; // Default for Phase 1
  const { state, openFile, closeFile, updateTabContent, updateTabSavedContent, updateTabViewState, setActiveTab } = useEditor();

  useEffect(() => {
    loadWorkspaceConfig(workspaceRoot).then(setConfig);
    startWatchingWorkspace(workspaceRoot).catch(console.error);
  }, []);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Cmd+Shift+L for chat toggle
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setChatCollapsed(prev => !prev);
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
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <PanelGroup direction="horizontal" onLayout={(sizes) => handleLayoutChange(sizes, 'main')}>
        <Panel defaultSize={config.mainSplit[0]} minSize={20} maxSize={50}>
          <PanelGroup direction="vertical" onLayout={(sizes) => handleLayoutChange(sizes, 'left')}>
            <Panel defaultSize={config.leftSplit[0]} minSize={20}>
              <FileExplorer workspaceRoot={workspaceRoot} onFileSelect={async (p) => {
                if (!state.openTabs.find(t => t.path === p)) {
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
            </Panel>
            <PanelResizeHandle style={{ height: '4px', background: '#ccc', cursor: 'row-resize' }} />
            <Panel 
              defaultSize={chatCollapsed ? 0 : config.leftSplit[1]} 
              minSize={15} 
              collapsible={true}
            >
              {!chatCollapsed && <ChatPanel />}
            </Panel>
          </PanelGroup>
        </Panel>
        
        <PanelResizeHandle style={{ width: '4px', background: '#ccc', cursor: 'col-resize' }} />
        
        <Panel defaultSize={config.mainSplit[1]} minSize={40}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #ccc', background: '#f5f5f5' }}>
              {state.openTabs.map(tab => (
                <div 
                  key={tab.path} 
                  style={{ 
                    padding: '8px 16px', 
                    cursor: 'pointer', 
                    background: tab.path === state.activeTabPath ? '#fff' : 'transparent',
                    borderRight: '1px solid #ccc',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  onClick={() => setActiveTab(tab.path)}
                >
                  {tab.path.split('/').pop()}
                  {tab.content !== tab.savedContent && <span style={{ marginLeft: 4, width: 8, height: 8, borderRadius: '50%', background: 'black' }} />}
                  <button onClick={(e) => { e.stopPropagation(); closeFile(tab.path); }} style={{ marginLeft: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}>x</button>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {activeTab ? (
                <CodeEditor
                  filePath={activeTab.path}
                  content={activeTab.content}
                  language={getLanguage(activeTab.path)}
                  onChange={(newContent) => updateTabContent(activeTab.path, newContent)}
                  onViewStateChange={(pos, scroll) => updateTabViewState(activeTab.path, pos, scroll)}
                  initialViewState={{ cursorPosition: activeTab.cursorPosition, scrollTop: activeTab.scrollTop }}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  No file open
                </div>
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}

export default function App() {
  return (
    <EditorProvider>
      <LeafIDE />
    </EditorProvider>
  );
}
