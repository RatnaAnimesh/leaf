import { useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { getFullGraph } from '../../lib/tauri-commands';
import { GraphData, GraphNode } from '../../lib/types';
import { X } from 'lucide-react';

interface GraphViewerProps {
  workspaceRoot: string;
  onClose: () => void;
}

export function GraphViewer({ workspaceRoot, onClose }: GraphViewerProps) {
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
    <div className="absolute inset-0 z-50 flex flex-col bg-[#1e1e2e] text-[#cdd6f4]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#313244] bg-[#181825]">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <span className="text-[#cba6f7]">⚛</span> Codebase Knowledge Graph
        </h2>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-[#313244] rounded text-[#a6adc8] hover:text-[#cdd6f4] transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Graph Area */}
      <div className="flex-1 relative bg-[#11111b] overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-[#a6adc8] flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#cba6f7]"></div>
              <span>Loading massive codebase graph...</span>
            </div>
          </div>
        )}
        
        {!loading && data && (
          <ForceGraph2D
            ref={graphRef}
            graphData={data}
            nodeLabel="label"
            nodeColor={(node: any) => {
              const n = node as GraphNode;
              return n.group === 'file' ? '#89b4fa' : '#a6e3a1'; // blue for files, green for symbols
            }}
            nodeRelSize={6}
            linkColor={() => '#45475a'} // subtle edge color
            linkWidth={1}
            linkDirectionalArrowLength={3.5}
            linkDirectionalArrowRelPos={1}
            onEngineStop={() => {
              // Zoom to fit once layout stabilizes
              if (graphRef.current) {
                graphRef.current.zoomToFit(400);
              }
            }}
            onNodeClick={(node) => {
              // Center on node when clicked
              if (graphRef.current) {
                graphRef.current.centerAt(node.x, node.y, 1000);
                graphRef.current.zoom(8, 2000);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
