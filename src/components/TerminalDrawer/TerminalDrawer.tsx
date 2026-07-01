import React, { useState, useRef } from 'react';
import { TerminalTab } from './TerminalTab';

interface TerminalDrawerProps {
    onSendToChat: (text: string) => void;
    onClose: () => void;
}

export const TerminalDrawer: React.FC<TerminalDrawerProps> = ({ onSendToChat, onClose }) => {
    const [tabs, setTabs] = useState<{ id: string }[]>([{ id: `tab-1` }]);
    const [activeTabId, setActiveTabId] = useState<string>('tab-1');
    const [tabCounter, setTabCounter] = useState(2);
    
    // Store refs to the TerminalTab components to call getOutput()
    const terminalRefs = useRef<Record<string, { getOutput: () => string } | null>>({});

    const handleNewTab = () => {
        const newId = `tab-${tabCounter}`;
        setTabCounter(c => c + 1);
        setTabs(prev => [...prev, { id: newId }]);
        setActiveTabId(newId);
    };

    const handleCloseTab = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        
        setTabs(prev => {
            const newTabs = prev.filter(t => t.id !== id);
            if (newTabs.length === 0) {
                // If closing the last tab, close the drawer or create a new one
                onClose();
                return [];
            }
            if (activeTabId === id) {
                setActiveTabId(newTabs[newTabs.length - 1].id);
            }
            return newTabs;
        });
        
        // Clean up ref
        delete terminalRefs.current[id];
    };

    const handleSendToChat = () => {
        const activeRef = terminalRefs.current[activeTabId];
        if (activeRef) {
            const output = activeRef.getOutput();
            onSendToChat(output);
        }
    };

    if (tabs.length === 0) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1e1e', borderTop: '1px solid #333' }}>
            {/* Tab Bar */}
            <div style={{ display: 'flex', background: '#252526', color: '#ccc', fontSize: 12, alignItems: 'center' }}>
                <div style={{ display: 'flex', flex: 1, overflowX: 'auto' }}>
                    {tabs.map((tab) => (
                        <div
                            key={tab.id}
                            onClick={() => setActiveTabId(tab.id)}
                            style={{
                                padding: '6px 12px',
                                cursor: 'pointer',
                                background: activeTabId === tab.id ? '#1e1e1e' : 'transparent',
                                borderRight: '1px solid #333',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8
                            }}
                        >
                            zsh
                            <span 
                                onClick={(e) => handleCloseTab(tab.id, e)}
                                style={{
                                    display: 'inline-block',
                                    width: 16, height: 16, 
                                    textAlign: 'center', 
                                    lineHeight: '14px', 
                                    borderRadius: 3,
                                    cursor: 'pointer'
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = '#444')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                                ×
                            </span>
                        </div>
                    ))}
                    <div 
                        onClick={handleNewTab}
                        style={{ padding: '6px 12px', cursor: 'pointer' }}
                    >
                        +
                    </div>
                </div>
                
                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, padding: '0 8px' }}>
                    <button 
                        onClick={handleSendToChat}
                        style={{
                            background: '#0e639c',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 3,
                            padding: '2px 8px',
                            fontSize: 11,
                            cursor: 'pointer'
                        }}
                    >
                        → chat
                    </button>
                    <button 
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            color: '#ccc',
                            border: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Terminal View */}
            <div style={{ flex: 1, position: 'relative' }}>
                {tabs.map(tab => (
                    <TerminalTab 
                        key={tab.id}
                        isActive={activeTabId === tab.id}
                        onExit={() => handleCloseTab(tab.id)}
                        ref={(r) => { terminalRefs.current[tab.id] = r; }}
                    />
                ))}
            </div>
        </div>
    );
};
