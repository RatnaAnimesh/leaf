import { useEffect, useState } from 'react';
import { readDirectory, createFile, createDir, renameFile, deleteFile } from '../../lib/tauri-commands';
import { FileNode } from '../../lib/types';
import { listen } from '@tauri-apps/api/event';
import { Folder, FileText, ChevronRight } from 'lucide-react';

interface FileExplorerProps {
  workspaceRoot: string;
  onFileSelect: (path: string) => void;
}

interface Column {
  dirPath: string;
  nodes: FileNode[];
  selectedChildPath: string | null;
}

export function FileExplorer({ workspaceRoot, onFileSelect }: FileExplorerProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, targetPath: string, targetNode?: FileNode } | null>(null);

  // Soothing Dark Theme Colors
  const colors = {
    bgPanel: '#252526',
    border: '#333333',
    textPrimary: '#cccccc',
    textSecondary: '#888888',
    highlight: '#37373d',
    accent: '#3794ff',
  };

  useEffect(() => {
    if (workspaceRoot) {
      loadDir(workspaceRoot).then(nodes => {
        setColumns([{ dirPath: workspaceRoot, nodes, selectedChildPath: null }]);
      });
    }
  }, [workspaceRoot]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unlisten = listen('fs-changed', (_event) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        refreshTree();
      }, 250);
    });

    return () => {
      unlisten.then((f) => f());
      clearTimeout(timeout);
    };
  }, [workspaceRoot, columns]);

  const loadDir = async (path: string) => {
    try {
      const result = await readDirectory(path);
      if (result.warnings && result.warnings.length > 0) {
        result.warnings.forEach(w => console.warn(w));
      }
      return result.nodes;
    } catch (e) {
      console.error('Failed to read dir', e);
      return [];
    }
  };

  const refreshTree = async () => {
    if (!workspaceRoot || columns.length === 0) return;
    
    // Naively re-fetch all active columns
    const newColumns = await Promise.all(columns.map(async (col) => {
      const nodes = await loadDir(col.dirPath);
      return { ...col, nodes };
    }));
    
    setColumns(newColumns);
  };

  const handleNodeClick = async (colIndex: number, node: FileNode) => {
    const newColumns = columns.slice(0, colIndex + 1);
    newColumns[colIndex].selectedChildPath = node.path;
    
    if (node.is_dir) {
      const children = await loadDir(node.path);
      newColumns.push({ dirPath: node.path, nodes: children, selectedChildPath: null });
      setColumns(newColumns);
    } else {
      setColumns(newColumns);
      onFileSelect(node.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, targetPath: string, targetNode?: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, targetPath, targetNode });
  };

  const closeContextMenu = () => setContextMenu(null);

  useEffect(() => {
    window.addEventListener('click', closeContextMenu);
    return () => window.removeEventListener('click', closeContextMenu);
  }, []);

  const handleCreateFile = async () => {
    if (!contextMenu) return;
    const name = window.prompt("New File Name:");
    if (name) {
      try {
        await createFile(`${contextMenu.targetPath}/${name}`);
        refreshTree();
      } catch (e) {
        alert(e);
      }
    }
  };

  const handleCreateDir = async () => {
    if (!contextMenu) return;
    const name = window.prompt("New Folder Name:");
    if (name) {
      try {
        await createDir(`${contextMenu.targetPath}/${name}`);
        refreshTree();
      } catch (e) {
        alert(e);
      }
    }
  };

  const handleRename = async () => {
    if (!contextMenu || !contextMenu.targetNode) return;
    const name = window.prompt("Rename to:", contextMenu.targetNode.name);
    if (name && name !== contextMenu.targetNode.name) {
      try {
        const newPath = `${contextMenu.targetPath}/${name}`;
        await renameFile(contextMenu.targetNode.path, newPath);
        refreshTree();
      } catch (e) {
        alert(e);
      }
    }
  };

  const handleDelete = async () => {
    if (!contextMenu || !contextMenu.targetNode) return;
    if (window.confirm(`Are you sure you want to delete ${contextMenu.targetNode.name}?`)) {
      try {
        await deleteFile(contextMenu.targetNode.path);
        refreshTree();
      } catch (e) {
        alert(e);
      }
    }
  };

  return (
    <div style={{ display: 'flex', overflowX: 'auto', height: '100%', backgroundColor: colors.bgPanel }}>
      {columns.map((col, colIndex) => (
        <div 
          key={col.dirPath} 
          style={{ minWidth: 200, maxWidth: 250, flex: 1, borderRight: `1px solid ${colors.border}`, overflowY: 'auto' }}
          onContextMenu={(e) => handleContextMenu(e, col.dirPath)}
        >
          {col.nodes.map(node => {
            const isSelected = col.selectedChildPath === node.path;
            return (
              <div 
                key={node.path}
                onClick={() => handleNodeClick(colIndex, node)}
                onContextMenu={(e) => handleContextMenu(e, col.dirPath, node)}
                style={{ 
                  padding: '6px 8px', 
                  cursor: 'pointer', 
                  userSelect: 'none', 
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: isSelected ? colors.highlight : 'transparent',
                  color: isSelected ? '#fff' : colors.textPrimary,
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#2a2d2e'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', gap: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', opacity: 0.8, color: node.is_dir ? colors.accent : colors.textSecondary }}>
                    {node.is_dir ? <Folder size={16} fill={node.is_dir ? colors.accent : 'none'} fillOpacity={0.2} /> : <FileText size={16} />}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
                </div>
                {node.is_dir && <span style={{ color: colors.textSecondary, marginLeft: 8, display: 'flex', alignItems: 'center' }}><ChevronRight size={16} /></span>}
              </div>
            );
          })}
        </div>
      ))}
      
      {contextMenu && (
        <div style={{
          position: 'fixed',
          top: contextMenu.y,
          left: contextMenu.x,
          backgroundColor: '#333333',
          border: `1px solid ${colors.border}`,
          borderRadius: '4px',
          padding: '4px 0',
          zIndex: 1000,
          minWidth: '150px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
          color: colors.textPrimary,
          fontSize: '0.9em',
        }}>
          <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={handleCreateFile} onMouseEnter={e => e.currentTarget.style.backgroundColor = colors.accent} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>New File</div>
          <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={handleCreateDir} onMouseEnter={e => e.currentTarget.style.backgroundColor = colors.accent} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>New Folder</div>
          {contextMenu.targetNode && (
            <>
              <div style={{ height: '1px', backgroundColor: colors.border, margin: '4px 0' }} />
              <div style={{ padding: '6px 12px', cursor: 'pointer' }} onClick={handleRename} onMouseEnter={e => e.currentTarget.style.backgroundColor = colors.accent} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Rename</div>
              <div style={{ padding: '6px 12px', cursor: 'pointer', color: '#ff6b6b' }} onClick={handleDelete} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#ff6b6b'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#ff6b6b'; }}>Delete</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
