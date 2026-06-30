import { createContext, useContext, useState, ReactNode } from 'react';

export interface OpenTab {
  path: string;
  content: string;
  savedContent: string;
  cursorPosition: { lineNumber: number; column: number };
  scrollTop: number;
}

export interface EditorState {
  openTabs: OpenTab[];
  activeTabPath: string | null;
}

interface EditorContextType {
  state: EditorState;
  openFile: (path: string, content: string) => void;
  closeFile: (path: string) => void;
  setActiveTab: (path: string) => void;
  updateTabContent: (path: string, content: string) => void;
  updateTabSavedContent: (path: string, content: string) => void;
  updateTabViewState: (path: string, position: { lineNumber: number; column: number }, scrollTop: number) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState>({
    openTabs: [],
    activeTabPath: null,
  });

  const openFile = (path: string, content: string) => {
    setState((prev) => {
      const existing = prev.openTabs.find((t) => t.path === path);
      if (existing) {
        return { ...prev, activeTabPath: path };
      }
      return {
        ...prev,
        openTabs: [
          ...prev.openTabs,
          {
            path,
            content,
            savedContent: content,
            cursorPosition: { lineNumber: 1, column: 1 },
            scrollTop: 0,
          },
        ],
        activeTabPath: path,
      };
    });
  };

  const closeFile = (path: string) => {
    setState((prev) => {
      const newTabs = prev.openTabs.filter((t) => t.path !== path);
      let newActive = prev.activeTabPath;
      if (newActive === path) {
        newActive = newTabs.length > 0 ? newTabs[newTabs.length - 1].path : null;
      }
      return { ...prev, openTabs: newTabs, activeTabPath: newActive };
    });
  };

  const setActiveTab = (path: string) => {
    setState((prev) => ({ ...prev, activeTabPath: path }));
  };

  const updateTabContent = (path: string, content: string) => {
    setState((prev) => ({
      ...prev,
      openTabs: prev.openTabs.map((t) => (t.path === path ? { ...t, content } : t)),
    }));
  };

  const updateTabSavedContent = (path: string, content: string) => {
    setState((prev) => ({
      ...prev,
      openTabs: prev.openTabs.map((t) => (t.path === path ? { ...t, savedContent: content } : t)),
    }));
  };

  const updateTabViewState = (path: string, position: { lineNumber: number; column: number }, scrollTop: number) => {
    setState((prev) => ({
      ...prev,
      openTabs: prev.openTabs.map((t) => 
        t.path === path 
          ? { ...t, cursorPosition: position, scrollTop } 
          : t
      ),
    }));
  };

  return (
    <EditorContext.Provider
      value={{
        state,
        openFile,
        closeFile,
        setActiveTab,
        updateTabContent,
        updateTabSavedContent,
        updateTabViewState,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
}
