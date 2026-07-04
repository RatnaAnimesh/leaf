import { useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { getFullGraph } from '../../lib/tauri-commands';
import { GraphData, GraphNode } from '../../lib/types';
import { X, Network } from 'lucide-react';

interface GraphViewerProps {
  workspaceRoot: string;
  onClose: () => void;
  onNodeClick?: (node: GraphNode) => void;
}

export function GraphViewer({ workspaceRoot, onClose, onNodeClick }: GraphViewerProps) {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const graphRef = useRef<any>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const graphData = await getFullGraph(workspaceRoot);
        setData(graphData);
      } catch (err) {
        console.error("Failed to load graph data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-base)', color: 'var(--color-text-primary)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
        <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Network size={20} style={{ color: 'var(--color-accent)' }} /> Codebase Knowledge Graph
        </h2>
        <button 
          onClick={onClose}
          className="icon-button"
          style={{ width: '32px', height: '32px', padding: 0 }}
        >
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>

      {/* Graph Area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', color: 'var(--color-text-secondary)' }}>
              <div style={{ animation: 'spin 1s linear infinite', borderRadius: '50%', height: '48px', width: '48px', borderTop: '2px solid var(--color-accent)', borderBottom: '2px solid var(--color-accent)' }}></div>
              <span>Loading massive codebase graph...</span>
            </div>
          </div>
        )}
        
        {!loading && data && (
          <ForceGraph2D
            ref={graphRef}
            graphData={data}
            nodeLabel={(node: any) => {
              const n = node as GraphNode;
              return `<div style="text-align: center; background: var(--color-surface); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--color-border); font-size: 12px;">
                <strong>${n.label}</strong>
                ${n.kind ? `<br/><span style="color: var(--color-text-secondary)">${n.kind}</span>` : ''}
                ${n.path ? `<br/><span style="color: var(--color-accent)">${n.path}</span>` : ''}
              </div>`;
            }}
            nodeColor={(node: any) => {
              const n = node as GraphNode;
              return n.group === 'file' ? '#89b4fa' : '#a6e3a1'; // blue for files, green for symbols
            }}
            nodeRelSize={6}
            linkColor={() => 'rgba(255, 255, 255, 0.1)'}
            linkWidth={1}
            cooldownTicks={100}
            onEngineStop={() => {
              // Zoom to fit once layout stabilizes
              if (graphRef.current) {
                graphRef.current.zoomToFit(400);
              }
            }}
            onNodeClick={(node) => {
              if (onNodeClick) {
                onNodeClick(node as GraphNode);
              } else {
                if (graphRef.current) {
                  graphRef.current.centerAt(node.x, node.y, 1000);
                  graphRef.current.zoom(8, 2000);
                }
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
