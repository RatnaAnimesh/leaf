import { createContext, useContext, useState, ReactNode } from 'react';

export interface OpenTab {
  path: string;
  content: string;
  savedContent: string;
  cursorPosition: { lineNumber: number; column: number };
  scrollTop: number;
  isDiff?: boolean;
  originalContent?: string;
}

export interface EditorState {
  openTabs: OpenTab[];
  activeTabPath: string | null;
}

interface EditorContextType {
  state: EditorState;
  openFile: (path: string, content: string, isDiff?: boolean, originalContent?: string) => void;
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

  const openFile = (path: string, content: string, isDiff?: boolean, originalContent?: string) => {
    setState((prev) => {
      const existing = prev.openTabs.find((t) => t.path === path && t.isDiff === isDiff);
      if (existing) {
        return { ...prev, activeTabPath: path };
      }
      // If we are opening a diff view for a file that is already open (or vice versa),
      // we might want to either replace the tab or just add it. Let's replace any tab with the same path for simplicity.
      const newTabs = prev.openTabs.filter(t => t.path !== path);
      
      return {
        ...prev,
        openTabs: [
          ...newTabs,
          {
            path,
            content,
            savedContent: content,
            cursorPosition: { lineNumber: 1, column: 1 },
            scrollTop: 0,
            isDiff,
            originalContent,
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
