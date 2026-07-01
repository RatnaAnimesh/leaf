import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { spawn, IPty } from 'tauri-pty';
import '@xterm/xterm/css/xterm.css';

interface TerminalTabProps {
    isActive: boolean;
    onExit: () => void;
}

export const TerminalTab = React.forwardRef<{ getOutput: () => string }, TerminalTabProps>(({ isActive, onExit }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const ptyRef = useRef<IPty | null>(null);

    React.useImperativeHandle(ref, () => ({
        getOutput: () => {
            if (!terminalRef.current) return '';
            
            // Extract the last 50 lines from xterm's buffer directly
            const buffer = terminalRef.current.buffer.active;
            const lines: string[] = [];
            const endY = buffer.cursorY + buffer.viewportY;
            const startY = Math.max(0, endY - 50);

            for (let i = startY; i <= endY; i++) {
                const line = buffer.getLine(i);
                if (line) {
                    // isWrapped indicates if the line continues to the next, but translating to plain text
                    // translateToString strips ANSI codes automatically.
                    lines.push(line.translateToString(true).trimEnd());
                }
            }

            return lines.join('\n');
        }
    }));

    useEffect(() => {
        if (!containerRef.current) return;

        const term = new Terminal({
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 12,
            cursorBlink: true,
            theme: {
                background: '#1e1e1e',
                foreground: '#cccccc'
            }
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new WebLinksAddon());

        term.open(containerRef.current);
        fitAddon.fit();

        terminalRef.current = term;
        fitAddonRef.current = fitAddon;

        let shell = 'zsh'; 
        const pty = spawn(shell, [], {
            cols: term.cols,
            rows: term.rows,
            cwd: '.', // defaults to workspaceRoot in Tauri context
            env: {}
        });

        ptyRef.current = pty;

        const dataDisposable = pty.onData((data) => {
            const str = new TextDecoder().decode(data);
            term.write(str);
        });

        const exitDisposable = pty.onExit(() => {
            onExit();
        });

        const inputDisposable = term.onData((data) => {
            pty.write(data);
        });

        const resizeHandler = () => {
            if (fitAddonRef.current && ptyRef.current && terminalRef.current) {
                fitAddonRef.current.fit();
                ptyRef.current.resize(terminalRef.current.cols, terminalRef.current.rows);
            }
        };

        window.addEventListener('resize', resizeHandler);

        return () => {
            window.removeEventListener('resize', resizeHandler);
            inputDisposable.dispose();
            dataDisposable.dispose();
            exitDisposable.dispose();
            pty.kill();
            term.dispose();
        };
    }, []);

    useEffect(() => {
        if (isActive && fitAddonRef.current && ptyRef.current && terminalRef.current) {
            setTimeout(() => {
                fitAddonRef.current?.fit();
                if (terminalRef.current) {
                    ptyRef.current?.resize(terminalRef.current.cols, terminalRef.current.rows);
                }
            }, 10);
        }
    }, [isActive]);

    return (
        <div 
            style={{ 
                height: '100%', 
                width: '100%', 
                display: isActive ? 'block' : 'none',
                overflow: 'hidden',
                padding: '4px'
            }} 
            ref={containerRef} 
        />
    );
});
