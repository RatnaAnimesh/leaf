import { useRef, useEffect } from 'react';
import Editor, { DiffEditor, useMonaco } from '@monaco-editor/react';

interface CodeEditorProps {
  filePath: string;
  content: string;
  onChange: (newContent: string) => void;
  language: string;
  onViewStateChange?: (position: { lineNumber: number; column: number }, scrollTop: number) => void;
  initialViewState?: {
    cursorPosition: { lineNumber: number; column: number };
    scrollTop: number;
  };
  isDiff?: boolean;
  originalContent?: string;
}

export function CodeEditor({ filePath, content, onChange, language, onViewStateChange, initialViewState, isDiff, originalContent }: CodeEditorProps) {
  const editorRef = useRef<any>(null);
  const monaco = useMonaco();

  useEffect(() => {
    if (monaco) {
      monaco.editor.defineTheme('greenhouse-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: '', background: '111513' }
        ],
        colors: {
          'editor.background': '#111513',
          'editor.foreground': '#E4E8E5',
          'editor.lineHighlightBackground': '#161C1A',
          'editorLineNumber.foreground': '#8B9992',
          'editor.selectionBackground': '#1A211E',
          'editorCursor.foreground': '#7C9E8B',
          'editorIndentGuide.background': '#161C1A',
          'editorIndentGuide.activeBackground': '#8B9992',
        }
      });
    }
  }, [monaco]);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;

    if (initialViewState) {
      editor.setPosition(initialViewState.cursorPosition);
      editor.setScrollTop(initialViewState.scrollTop);
    }

    editor.onDidChangeCursorPosition(() => {
      reportViewState();
    });
    
    editor.onDidScrollChange(() => {
      reportViewState();
    });
  };

  const reportViewState = () => {
    if (editorRef.current && onViewStateChange) {
      const position = editorRef.current.getPosition();
      const scrollTop = editorRef.current.getScrollTop();
      if (position) {
        onViewStateChange(
          { lineNumber: position.lineNumber, column: position.column },
          scrollTop
        );
      }
    }
  };

  if (isDiff && originalContent !== undefined) {
    return (
      <DiffEditor
        original={originalContent}
        modified={content}
        language={language}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          readOnly: true,
          renderSideBySide: true,
          fontFamily: "'JetBrains Mono', monospace",
        }}
        theme="greenhouse-dark"
      />
    );
  }

  return (
    <Editor
      path={filePath}
      value={content}
      language={language}
      onChange={(val) => {
        if (val !== undefined) onChange(val);
      }}
      onMount={handleEditorDidMount}
      options={{
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontFamily: "'JetBrains Mono', monospace",
      }}
      theme="greenhouse-dark"
    />
  );
}
