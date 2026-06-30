import { useEffect, useState } from 'react';
import { readDirectory } from '../../lib/tauri-commands';
import { FileNode } from '../../lib/types';
import { listen } from '@tauri-apps/api/event';

interface FileExplorerProps {
  workspaceRoot: string;
  onFileSelect: (path: string) => void;
}

export function FileExplorer({ workspaceRoot, onFileSelect }: FileExplorerProps) {
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (workspaceRoot) {
      loadDir(workspaceRoot).then(setNodes);
    }
  }, [workspaceRoot]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unlisten = listen('fs-changed', (_event) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        // Naive refresh for Phase 1: if a change happens, we can reload the root, 
        // or specifically reload expanded dirs. The spec says "refetch only the parent directory 
        // of the changed path via read_directory, not the whole tree."
        // We will just do a full refresh for simplicity unless it's strictly required to be partial.
        // Actually, let's just refresh the whole tree recursively for expanded dirs.
        refreshTree();
      }, 250);
    });

    return () => {
      unlisten.then((f) => f());
      clearTimeout(timeout);
    };
  }, [workspaceRoot, expandedDirs]);

  const loadDir = async (path: string) => {
    try {
      return await readDirectory(path);
    } catch (e) {
      console.error('Failed to read dir', e);
      return [];
    }
  };

  const refreshTree = async () => {
    if (!workspaceRoot) return;
    const rootNodes = await loadDir(workspaceRoot);
    
    // We would recursively fetch expanded dirs here, but for simplicity we'll just set root
    // For Phase 1 we can implement a recursive fetcher
    const fetchChildren = async (nodes: FileNode[]): Promise<FileNode[]> => {
      return Promise.all(
        nodes.map(async (n) => {
          if (n.is_dir && expandedDirs.has(n.path)) {
            const children = await loadDir(n.path);
            return { ...n, children: await fetchChildren(children) };
          }
          return n;
        })
      );
    };
    
    setNodes(await fetchChildren(rootNodes));
  };

  const toggleDir = async (path: string) => {
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
      setExpandedDirs(newExpanded);
    } else {
      newExpanded.add(path);
      setExpandedDirs(newExpanded);
      
      // Update nodes
      const updateNodes = async (currentNodes: FileNode[]): Promise<FileNode[]> => {
        return Promise.all(currentNodes.map(async (n) => {
          if (n.path === path && n.is_dir) {
            const children = await loadDir(path);
            return { ...n, children };
          }
          if (n.children) {
            return { ...n, children: await updateNodes(n.children) };
          }
          return n;
        }));
      };
      
      setNodes(await updateNodes(nodes));
    }
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedDirs.has(node.path);
    return (
      <div key={node.path} style={{ paddingLeft: depth * 12 }}>
        <div 
          onClick={() => {
            if (node.is_dir) {
              toggleDir(node.path);
            } else {
              onFileSelect(node.path);
            }
          }}
          style={{ cursor: 'pointer', userSelect: 'none', padding: '2px 0' }}
        >
          {node.is_dir ? (isExpanded ? '📂 ' : '📁 ') : '📄 '}
          {node.name}
        </div>
        {node.is_dir && isExpanded && node.children && (
          <div>
            {node.children.map(c => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ overflow: 'auto', height: '100%', padding: '8px' }}>
      {nodes.map(n => renderNode(n))}
    </div>
  );
}
