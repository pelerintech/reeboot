type Tab = 'chat' | 'channels' | 'logs' | 'settings' | 'skills';

interface TabConfig {
  id: Tab;
  label: string;
  icon: string;
}

const tabs: TabConfig[] = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'channels', label: 'Channels', icon: '📡' },
  { id: 'logs', label: 'Logs', icon: '📋' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'skills', label: 'Skills', icon: '🧩' },
];

interface NavigationProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  variant?: 'sidebar' | 'bottom';
}

export default function Navigation({ activeTab, onTabChange, variant = 'sidebar' }: NavigationProps) {
  if (variant === 'bottom') {
    return (
      <nav className="flex items-center justify-around h-14 bg-gray-950 border-t border-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center w-full h-full gap-0.5 ${
              activeTab === tab.id
                ? 'text-blue-400'
                : 'text-gray-400'
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="text-[10px]">{tab.label}</span>
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col items-center w-[50px] bg-gray-950 border-r border-gray-800 py-4 gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          title={tab.label}
          className={`flex items-center justify-center w-10 h-10 rounded-lg text-lg transition-colors ${
            activeTab === tab.id
              ? 'bg-blue-600/20 text-blue-400'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
        >
          {tab.icon}
        </button>
      ))}
    </nav>
  );
}
