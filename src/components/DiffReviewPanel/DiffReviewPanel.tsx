import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DiffEditor } from '@monaco-editor/react';

interface DiffReviewPanelProps {
  path: string;
  newContent: string;
  onApprove: () => void;
  onReject: () => void;
}

export function DiffReviewPanel({ path, newContent, onApprove, onReject }: DiffReviewPanelProps) {
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOriginal() {
      try {
        const content: string = await invoke('read_file', { path });
        setOriginalContent(content);
      } catch (e) {
        // File might not exist
        setOriginalContent('');
      } finally {
        setLoading(false);
      }
    }
    loadOriginal();
  }, [path]);

  const handleApprove = async () => {
    try {
      await invoke('write_file', { path, content: newContent });
      onApprove();
    } catch (e) {
      console.error("Failed to write file", e);
      alert("Failed to write file: " + e);
    }
  };

  if (loading) {
    return <div style={{ padding: '8px', border: '1px solid #ccc', margin: '8px 0' }}>Loading diff for {path}...</div>;
  }

  return (
    <div style={{ border: '1px solid #007acc', borderRadius: '4px', margin: '8px 0', overflow: 'hidden' }}>
      <div style={{ backgroundColor: '#f3f3f3', padding: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccc' }}>
        <strong style={{ fontSize: '0.9em' }}>{path}</strong>
        <div>
          <button onClick={handleApprove} style={{ marginRight: '8px', backgroundColor: 'var(--color-accent)', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Approve</button>
          <button onClick={onReject} style={{ backgroundColor: '#f44336', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>Reject</button>
        </div>
      </div>
      <div style={{ height: '300px' }}>
        <DiffEditor
          original={originalContent}
          modified={newContent}
          language={path.split('.').pop() === 'ts' || path.split('.').pop() === 'tsx' ? 'typescript' : path.split('.').pop() === 'rs' ? 'rust' : 'javascript'}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            renderSideBySide: false, // Unified diff
          }}
        />
      </div>
    </div>
  );
}
