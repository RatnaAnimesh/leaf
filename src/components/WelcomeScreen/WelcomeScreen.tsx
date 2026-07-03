import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { gitClone, getRecentWorkspaces } from '../../lib/tauri-commands';

interface WelcomeScreenProps {
  onOpenFolder: (path: string) => void;
}

export function WelcomeScreen({ onOpenFolder }: WelcomeScreenProps) {
  const [splashVisible, setSplashVisible] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [fadeSplash, setFadeSplash] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloneUrl, setCloneUrl] = useState('');
  const [isCloning, setIsCloning] = useState(false);

  useEffect(() => {
    getRecentWorkspaces().then(setRecentWorkspaces).catch(console.error);
    // Start animation: text fades out, dot expands
    const t1 = setTimeout(() => {
      setAnimating(true);
    }, 800);

    // After dot covers screen, fade the entire splash overlay
    const t2 = setTimeout(() => {
      setFadeSplash(true);
    }, 2000);

    // Remove splash overlay from DOM
    const t3 = setTimeout(() => {
      setSplashVisible(false);
    }, 2500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const handleOpenProject = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === 'string') {
        onOpenFolder(selected);
      }
    } catch (err) {
      console.error('Failed to open directory:', err);
    }
  };

  const handleCloneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneUrl.trim()) return;
    
    try {
      const parentDir = await open({
        directory: true,
        multiple: false,
        title: 'Select Destination Folder for Clone',
      });
      
      if (parentDir && typeof parentDir === 'string') {
        setIsCloning(true);
        const newPath = await gitClone(cloneUrl.trim(), parentDir);
        setIsCloning(false);
        onOpenFolder(newPath);
      }
    } catch (err) {
      setIsCloning(false);
      console.error('Failed to clone repository:', err);
      alert(`Clone failed: ${err}`);
    }
  };

  return (
    <div style={{ 
      position: 'relative', 
      width: '100vw', 
      height: '100vh', 
      background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)', 
      color: '#e6edf3', 
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    }}>
      
      {/* Actual Welcome Screen Content */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100%',
        opacity: splashVisible ? 0 : 1,
        transition: 'opacity 0.8s ease-in-out',
      }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: showRecent ? '400px' : '320px', transition: 'width 0.3s ease' }}>
          {showCloneModal ? (
            <form onSubmit={handleCloneSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input 
                autoFocus
                placeholder="https://github.com/user/repo.git" 
                value={cloneUrl}
                onChange={e => setCloneUrl(e.target.value)}
                disabled={isCloning}
                style={{ 
                  padding: '12px 16px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: '#fff',
                  fontSize: '1rem',
                  outline: 'none'
                }} 
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  type="submit"
                  disabled={isCloning || !cloneUrl.trim()}
                  style={{ flex: 1, padding: '10px', background: '#238636', color: '#fff', border: 'none', borderRadius: '6px', cursor: isCloning ? 'wait' : 'pointer' }}
                >
                  {isCloning ? 'Cloning...' : 'Clone'}
                </button>
                <button 
                  type="button"
                  onClick={() => setShowCloneModal(false)}
                  disabled={isCloning}
                  style={{ flex: 1, padding: '10px', background: 'rgba(255, 255, 255, 0.1)', color: '#c9d1d9', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : showRecent ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#fff' }}>Recent Workspaces</h3>
              {recentWorkspaces.length === 0 ? (
                <div style={{ color: '#8b949e', fontStyle: 'italic', padding: '10px 0' }}>No recent workspaces found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '250px', overflowY: 'auto' }}>
                  {recentWorkspaces.map(path => (
                    <div 
                      key={path}
                      onClick={() => onOpenFolder(path)}
                      style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', cursor: 'pointer', wordBreak: 'break-all', fontSize: '0.9rem' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(56, 139, 253, 0.15)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                    >
                      {path}
                    </div>
                  ))}
                </div>
              )}
              <button 
                onClick={() => setShowRecent(false)}
                style={{ marginTop: '10px', padding: '8px', background: 'transparent', color: '#58a6ff', border: '1px solid rgba(56, 139, 253, 0.4)', borderRadius: '4px', cursor: 'pointer' }}
              >
                Back to Menu
              </button>
            </div>
          ) : (
            <>
              <button 
                onClick={handleOpenProject}
                style={{ 
                  padding: '14px 24px', 
                  backgroundColor: 'rgba(56, 139, 253, 0.15)', 
                  color: '#58a6ff', 
                  border: '1px solid rgba(56, 139, 253, 0.4)', 
                  borderRadius: '8px', 
                  cursor: 'pointer', 
                  fontSize: '1rem',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.2s ease',
                  backdropFilter: 'blur(10px)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = 'rgba(56, 139, 253, 0.25)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(56, 139, 253, 0.15)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'rgba(56, 139, 253, 0.15)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                Open a Project
              </button>
              <button 
                onClick={() => setShowCloneModal(true)}
                style={{ 
                  padding: '14px 24px', 
                  backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                  color: '#c9d1d9', 
                  border: '1px solid rgba(255, 255, 255, 0.1)', 
                  borderRadius: '8px', 
                  cursor: 'pointer', 
                  fontSize: '1rem',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.2s ease',
                  backdropFilter: 'blur(10px)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
                Clone Repository
              </button>
              <button 
                onClick={() => setShowRecent(true)}
                style={{ 
                  padding: '14px 24px', 
                  backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                  color: '#c9d1d9', 
                  border: '1px solid rgba(255, 255, 255, 0.1)', 
                  borderRadius: '8px', 
                  cursor: 'pointer', 
                  fontSize: '1rem',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.2s ease',
                  backdropFilter: 'blur(10px)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                Recent Workspaces
              </button>
            </>
          )}
        </div>
      </div>

      {/* Animated Splash Screen Overlay */}
      {splashVisible && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#0d1117',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          opacity: fadeSplash ? 0 : 1,
          transition: 'opacity 0.5s ease-in-out',
          pointerEvents: animating ? 'none' : 'auto',
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ 
              fontFamily: "'Dancing Script', cursive", 
              fontSize: '8rem', 
              color: '#ffffff',
              opacity: animating ? 0 : 1,
              transition: 'opacity 0.4s ease-in-out'
            }}>leaf</span>
            <div style={{ 
              display: 'inline-block',
              width: '1.2rem',
              height: '1.2rem',
              backgroundColor: '#4caf50',
              borderRadius: '50%',
              marginLeft: '0.2rem',
              transformOrigin: 'center center',
              transition: 'transform 1.2s cubic-bezier(0.5, 0, 0.2, 1)',
              transform: animating ? 'scale(200)' : 'scale(1)'
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
