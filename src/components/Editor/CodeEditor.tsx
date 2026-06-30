import { useRef } from 'react';
import Editor from '@monaco-editor/react';

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
}

export function CodeEditor({ filePath, content, onChange, language, onViewStateChange, initialViewState }: CodeEditorProps) {
  const editorRef = useRef<any>(null);

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
      }}
    />
  );
}
