import { useState, useEffect } from 'react';
import { RepoStatus, GitFile } from '../../lib/types';
import { getRepoStatus, stageFile, unstageFile, commit, getFileHeadContent, readFile } from '../../lib/tauri-commands';
import { GitBranch, Plus, Minus } from 'lucide-react';

interface SourceControlPanelProps {
    workspaceRoot: string;
    onFileSelect: (path: string, content: string, isDiff?: boolean, originalContent?: string) => void;
}

export function SourceControlPanel({ workspaceRoot, onFileSelect }: SourceControlPanelProps) {
    const [status, setStatus] = useState<RepoStatus | null>(null);
    const [commitMessage, setCommitMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const refreshStatus = async () => {
        try {
            const result = await getRepoStatus(workspaceRoot);
            setStatus(result);
        } catch (e) {
            console.error("Failed to get repo status", e);
        }
    };

    useEffect(() => {
        refreshStatus();
    }, [workspaceRoot]);

    const handleStage = async (file: GitFile) => {
        try {
            await stageFile(workspaceRoot, file.path);
            refreshStatus();
        } catch (err) {
            console.error(err);
        }
    };

    const handleUnstage = async (file: GitFile) => {
        try {
            await unstageFile(workspaceRoot, file.path);
            refreshStatus();
        } catch (err) {
            console.error(err);
        }
    };

    const handleCommit = async () => {
        if (!commitMessage.trim()) return;
        setLoading(true);
        try {
            await commit(workspaceRoot, commitMessage);
            setCommitMessage('');
            await refreshStatus();
        } catch (e) {
            console.error("Failed to commit", e);
        } finally {
            setLoading(false);
        }
    };

    const handleFileClick = async (file: GitFile) => {
        try {
            const original = await getFileHeadContent(workspaceRoot, file.path).catch(() => '');
            const modified = await readFile(file.path).catch(() => '');
            onFileSelect(file.path, modified, true, original);
        } catch (e) {
            console.error("Failed to get diff", e);
        }
    };

    if (!status) {
        return <div style={{ padding: '8px' }}>Loading Git status...</div>;
    }

    const renderFileList = (title: string, files: GitFile[], onAction: (f: GitFile) => void, actionIcon: React.ReactNode, actionTitle: string) => {
        if (files.length === 0) return null;
        return (
            <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', padding: '4px 8px', background: '#333', color: '#ccc' }}>
                    {title} ({files.length})
                </div>
                <div>
                    {files.map(f => (
                        <div 
                            key={f.path} 
                            style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '4px 8px', 
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                            onClick={() => handleFileClick(f)}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-accent-subtle)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                <span style={{ color: f.status === 'M' ? '#e2c08d' : f.status === 'D' ? '#f14c4c' : '#73c991', width: '12px', textAlign: 'center' }}>
                                    {f.status}
                                </span>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {f.path.split('/').pop()}
                                </span>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onAction(f); }}
                                style={{ background: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                title={actionTitle}
                            >
                                {actionIcon}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: '#ccc', background: 'var(--color-surface)' }}>
            <div style={{ padding: '8px', borderBottom: '1px solid #333' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>SOURCE CONTROL</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <GitBranch size={12} /> {status.branch} {status.ahead > 0 && `↑${status.ahead}`} {status.behind > 0 && `↓${status.behind}`}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <textarea 
                        value={commitMessage}
                        onChange={e => setCommitMessage(e.target.value)}
                        placeholder="Message (Cmd+Enter to commit)"
                        style={{ 
                            width: '100%', 
                            minHeight: '60px', 
                            background: '#3c3c3c', 
                            color: '#ccc',
                            border: '1px solid #333',
                            padding: '4px',
                            boxSizing: 'border-box',
                            resize: 'vertical'
                        }}
                        onKeyDown={e => {
                            if (e.metaKey && e.key === 'Enter') {
                                handleCommit();
                            }
                        }}
                    />
                    <button 
                        onClick={handleCommit}
                        disabled={loading || !commitMessage.trim() || status.staged.length === 0}
                        style={{
                            background: '#0e639c',
                            color: '#fff',
                            border: 'none',
                            padding: '4px',
                            cursor: (loading || !commitMessage.trim() || status.staged.length === 0) ? 'not-allowed' : 'pointer',
                            opacity: (loading || !commitMessage.trim() || status.staged.length === 0) ? 0.5 : 1
                        }}
                    >
                        Commit
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {renderFileList('Staged Changes', status.staged, handleUnstage, <Minus size={14} />, 'Unstage Changes')}
                {renderFileList('Changes', status.unstaged, handleStage, <Plus size={14} />, 'Stage Changes')}
                {renderFileList('Untracked', status.untracked, handleStage, <Plus size={14} />, 'Stage Changes')}
            </div>
        </div>
    );
}
