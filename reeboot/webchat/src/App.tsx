import { useState, useCallback } from 'react';
import Chat from './pages/Chat';
import Channels from './pages/Channels';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Skills from './pages/Skills';

type Tab = 'chat' | 'channels' | 'logs' | 'settings' | 'skills';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [errorBadgeCount, setErrorBadgeCount] = useState(0);
  const [errorBadgeVisible, setErrorBadgeVisible] = useState(false);

  const incrementErrorBadge = useCallback(() => {
    if (activeTab !== 'logs') {
      setErrorBadgeCount((c) => c + 1);
      setErrorBadgeVisible(true);
    }
  }, [activeTab]);

  const clearErrorBadge = useCallback(() => {
    setErrorBadgeCount(0);
    setErrorBadgeVisible(false);
  }, []);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'logs') clearErrorBadge();
  }, [clearErrorBadge]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'chat',
      label: 'Chat',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: 'channels',
      label: 'Channels',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
          <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
          <circle cx="12" cy="12" r="2" />
          <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
          <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
        </svg>
      ),
    },
    {
      id: 'logs',
      label: 'Logs',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
    {
      id: 'skills',
      label: 'Skills',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-16 bg-muted border-r border-border">
        <div className="flex flex-col items-center py-4 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              title={tab.label}
              className={`relative flex items-center justify-center w-11 h-11 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#4f9cf9] text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-border'
              }`}
            >
              {tab.icon}
              {tab.id === 'logs' && errorBadgeVisible && errorBadgeCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center font-bold">
                  {errorBadgeCount > 9 ? '9+' : errorBadgeCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'chat' && <div className="h-full animate-fade-in"><Chat /></div>}
        {activeTab === 'channels' && <div className="h-full animate-fade-in"><Channels /></div>}
        {activeTab === 'logs' && <div className="h-full animate-fade-in"><Logs onIncrementErrorBadge={incrementErrorBadge} /></div>}
        {activeTab === 'settings' && <div className="h-full animate-fade-in"><Settings /></div>}
        {activeTab === 'skills' && <div className="h-full animate-fade-in"><Skills /></div>}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around h-16 bg-background border-t border-border z-50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`relative flex flex-col items-center justify-center gap-1 w-full h-full ${
              activeTab === tab.id
                ? 'text-[#4f9cf9]'
                : 'text-muted-foreground'
            }`}
          >
            {tab.icon}
            <span className="text-[10px]">{tab.label}</span>
            {tab.id === 'logs' && errorBadgeVisible && errorBadgeCount > 0 && (
              <span className="absolute top-0 right-6 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center font-bold">
                {errorBadgeCount > 9 ? '9+' : errorBadgeCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
