import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Map,
  Building2,
  TrendingUp,
  Zap,
  CheckSquare,
  BriefcaseBusiness,
  Bot,
  Download,
  Moon,
  Sun,
  Cloud,
  CloudOff,
  Flag,
  ArrowDownToLine,
  RefreshCw,
  Globe,
} from 'lucide-react';

const NAV = [
  { to: '/dashboard',          label: 'Dashboard',           Icon: LayoutDashboard },
  { to: '/territories',        label: 'Territories',         Icon: Map },
  { to: '/accounts',           label: 'Accounts',            Icon: Building2 },
  { to: '/msx-accounts',       label: 'MSX Accounts',        Icon: Globe },
  { to: '/opportunities',      label: 'Opportunities',       Icon: TrendingUp },
  { to: '/milestones',         label: 'Milestones',          Icon: Flag },
  { to: '/activities',         label: 'Activities',          Icon: Zap },
  { to: '/tasks',              label: 'Activity Management', Icon: CheckSquare },
  { to: '/se-work',            label: 'SE Work',             Icon: BriefcaseBusiness },
  { to: '/chat',               label: 'Assistant',           Icon: Bot },
  { to: '/msx-import',         label: 'MSX Import',          Icon: Download },
];

interface BackupStatus {
  connected: boolean;
  backupDir: string | null;
  lastBackup: string | null;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Layout() {
  const [dark, setDark] = useState(() =>
    localStorage.getItem('theme') === 'dark' ||
    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [updateStatus, setUpdateStatus] = useState<{
    status: 'available' | 'downloading' | 'downloaded';
    version?: string;
    percent?: number;
  } | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.getBackupStatus) return;
    electronAPI.getBackupStatus().then(setBackupStatus);
  }, []);

  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.onUpdateStatus) return;
    electronAPI.onUpdateStatus((data: any) => setUpdateStatus(data));
  }, []);

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-purple-950 text-purple-100 flex flex-col">
        <div className="px-5 py-[26px] border-b border-purple-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-700 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">SE</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white leading-tight">SE Work Manager</h1>
              <p className="text-xs text-purple-400 mt-0.5">Customer & Task Hub</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-3 px-2">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all mb-0.5 ${
                  isActive
                    ? 'bg-fuchsia-600/80 text-white shadow-sm'
                    : 'text-purple-300/80 hover:bg-purple-900/80 hover:text-purple-50'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        {/* Auto-update banner */}
        {updateStatus && updateStatus.status !== 'downloaded' && (
          <div className="px-3 pb-2">
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs bg-amber-500/20 text-amber-300">
              <ArrowDownToLine size={13} className="mt-0.5 flex-shrink-0 animate-bounce" />
              <span>
                Downloading update…
                {updateStatus.percent != null && (
                  <><br /><span className="text-amber-400">{updateStatus.percent}%</span></>
                )}
              </span>
            </div>
          </div>
        )}
        {updateStatus?.status === 'downloaded' && (
          <div className="px-3 pb-2">
            <button
              onClick={() => (window as any).electronAPI?.installUpdate()}
              className="w-full flex items-start gap-2 px-3 py-2 rounded-lg text-xs bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors text-left cursor-pointer"
            >
              <RefreshCw size={13} className="mt-0.5 flex-shrink-0" />
              <span>
                Update ready<br />
                <span className="text-green-400 underline">Restart to install</span>
              </span>
            </button>
          </div>
        )}
        {/* OneDrive backup status */}
        {backupStatus !== null && (
          <div className="px-3 pb-2">
            <div
              className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                backupStatus.connected
                  ? 'bg-purple-900/50 text-purple-300'
                  : 'bg-amber-900/40 text-amber-300'
              }`}
            >
              {backupStatus.connected
                ? <Cloud size={13} className="mt-0.5 flex-shrink-0 text-green-400" />
                : <CloudOff size={13} className="mt-0.5 flex-shrink-0" />}
              <span>
                {backupStatus.connected
                  ? (<>OneDrive backup{backupStatus.lastBackup ? <><br /><span className="text-slate-400">{formatRelative(backupStatus.lastBackup)}</span></> : ' enabled'}</>)
                  : 'OneDrive not detected'}
              </span>
            </div>
          </div>
        )}
        {/* Dark mode toggle */}
        <div className="px-3 py-3 border-t border-purple-900/60">
          <button
            onClick={() => setDark(d => !d)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-purple-300/80 hover:bg-purple-900/80 hover:text-purple-50 text-sm font-medium transition-all cursor-pointer"
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
            {dark ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
