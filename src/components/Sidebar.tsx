'use client';
import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Database, Table2, Users, BarChart2, Activity, LogOut, Layers, ChevronsUpDown, Eye, Lock, HardDrive, Search, Bookmark, BookOpen, Plus, Trash2, Cpu, Workflow, Zap, CalendarClock, Settings2, Network, Gauge, GitCompare, SearchCode } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useConn } from '@/context/ConnectionContext';
import ConnectionPanel from './ConnectionPanel';

interface Props {
  selected: { db: string; table: string } | null;
  onSelect: (db: string, table: string) => void;
  activeView: string;
  onView: (view: string) => void;
  onSearch: () => void;
  onCreateTable: (db: string) => void;
  onDropDb: (db: string) => void;
  onCreateDb: () => void;
  onDbView: (db: string, view: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  mariadb:  'text-amber-400',
  mysql:    'text-orange-400',
  postgres: 'text-sky-400',
};
const TYPE_LABELS: Record<string, string> = {
  mariadb: 'MariaDB', mysql: 'MySQL', postgres: 'PostgreSQL',
};

export default function Sidebar({ selected, onSelect, activeView, onView, onSearch, onCreateTable, onDropDb, onCreateDb, onDbView }: Props) {
  const { connId, setConnId } = useConn();
  const [databases, setDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<Record<string, string[]>>({});
  const [views, setViews] = useState<Record<string, string[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingDbs, setLoadingDbs] = useState(true);
  const [loadingTables, setLoadingTables] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [showConnPanel, setShowConnPanel] = useState(false);
  const [connInfo, setConnInfo] = useState<{ name: string; type: string; readonly?: boolean } | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.json())
      .then(d => {
        const c = (d.connections || []).find((c: { id: string }) => c.id === connId);
        if (c) setConnInfo({ name: c.name, type: c.type, readonly: c.readonly });
      });
  }, [connId]);

  useEffect(() => {
    setDatabases([]);
    setTables({});
    setViews({});
    setExpanded(new Set());
    setLoadingDbs(true);
    setError('');
    fetch(`/api/databases?conn=${connId}`)
      .then(r => r.json())
      .then(d => { setDatabases(d.databases || []); setLoadingDbs(false); })
      .catch(() => { setError('Connection failed'); setLoadingDbs(false); });
  }, [connId]);

  async function toggleDb(db: string) {
    const next = new Set(expanded);
    if (next.has(db)) { next.delete(db); setExpanded(next); return; }
    next.add(db);
    setExpanded(next);
    if (!tables[db]) {
      setLoadingTables(prev => new Set(prev).add(db));
      const [tableRes, viewRes] = await Promise.all([
        fetch(`/api/databases/${encodeURIComponent(db)}/tables?conn=${connId}`).then(r => r.json()),
        fetch(`/api/databases/${encodeURIComponent(db)}/views?conn=${connId}`).then(r => r.json()),
      ]);
      setTables(prev => ({ ...prev, [db]: tableRes.tables || [] }));
      setViews(prev => ({ ...prev, [db]: viewRes.views || [] }));
      setLoadingTables(prev => { const s = new Set(prev); s.delete(db); return s; });
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const topNav = [
    { id: 'overview', label: 'Overview',   icon: BarChart2 },
    { id: 'live',     label: 'Live Stats', icon: Activity  },
    { id: 'history',  label: 'History',    icon: Activity  },
  ];

  return (
    <>
      <aside className="w-52 bg-zinc-900 flex flex-col h-full border-r border-zinc-800 shrink-0">
        {/* Connection selector */}
        <button
          onClick={() => setShowConnPanel(true)}
          className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-800 hover:bg-zinc-800/60 transition-colors group"
        >
          <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-zinc-200 truncate">{connInfo?.name || 'DB Admin'}</span>
              {connInfo?.readonly && <Lock className="w-3 h-3 text-amber-400 shrink-0" aria-label="Read-only" />}
            </div>
            {connInfo && (
              <div className={`text-[10px] font-medium ${TYPE_COLORS[connInfo.type] || 'text-zinc-400'}`}>
                {TYPE_LABELS[connInfo.type] || connInfo.type}
              </div>
            )}
          </div>
          <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0" />
        </button>

        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {/* Search button */}
          <button
            onClick={onSearch}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors border border-zinc-800 mb-1"
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 text-left text-xs">Search tables…</span>
            <kbd className="text-[9px] bg-zinc-800 text-zinc-600 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
          </button>

          {[
            { id: 'overview',   label: 'Overview',   icon: BarChart2  },
            { id: 'live',       label: 'Live Stats', icon: Activity   },
            { id: 'processes',  label: 'Processes',  icon: Cpu        },
            { id: 'variables',  label: 'Variables',  icon: Settings2  },
            { id: 'saved',      label: 'Saved',      icon: Bookmark   },
            { id: 'backup',     label: 'Backup',     icon: HardDrive  },
            { id: 'slow',       label: 'Top Queries',icon: Gauge      },
            { id: 'schemadiff', label: 'Schema Diff',icon: GitCompare },
            { id: 'help',       label: 'Help',       icon: BookOpen   },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => onView(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                activeView === id ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
              }`}>
              <Icon className="w-4 h-4 shrink-0" />{label}
            </button>
          ))}

          <div className="pt-3 pb-1 px-3 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Databases</span>
            {!connInfo?.readonly && (
              <button
                onClick={onCreateDb}
                title="Create database"
                className="p-0.5 rounded text-zinc-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {loadingDbs && (
            <div className="px-3 py-2 text-xs text-zinc-600 flex items-center gap-2">
              <div className="w-3 h-3 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
              Connecting…
            </div>
          )}
          {error && <div className="px-3 py-1 text-xs text-red-400">{error}</div>}

          {databases.map(db => (
            <div key={db}>
              <div className="flex items-center group/db">
                <button onClick={() => toggleDb(db)}
                  className="flex-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-left transition-colors">
                  {expanded.has(db)
                    ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
                  <Database className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="truncate text-sm text-zinc-300 group-hover/db:text-zinc-100">{db}</span>
                  {loadingTables.has(db) && (
                    <div className="ml-auto w-3 h-3 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin shrink-0" />
                  )}
                </button>
                {!connInfo?.readonly && (
                  <>
                    <button
                      onClick={() => onCreateTable(db)}
                      title="Create table"
                      className="opacity-0 group-hover/db:opacity-100 p-1 rounded text-zinc-600 hover:text-blue-400 hover:bg-blue-500/10 transition-all shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onDropDb(db); }}
                      title="Drop database"
                      className="opacity-0 group-hover/db:opacity-100 p-1 mr-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>

              {expanded.has(db) && (
                <>
                  {[
                    { id: 'routines', label: 'Routines', icon: Workflow },
                    { id: 'triggers', label: 'Triggers', icon: Zap },
                    { id: 'events',   label: 'Events',   icon: CalendarClock },
                    { id: 'views',    label: 'Views',    icon: Eye },
                    { id: 'search',   label: 'Search Data', icon: SearchCode },
                    { id: 'er',       label: 'ER Diagram',  icon: Network },
                  ].map(({ id, label, icon: Icon }) => (
                    <button key={id}
                      onClick={() => onDbView(db, id)}
                      className={`w-full flex items-center gap-1.5 pl-7 pr-3 py-1 rounded-lg text-left transition-colors text-xs ${
                        activeView === `db-${id}` && selected?.db === db
                          ? 'bg-zinc-800 text-zinc-300'
                          : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50'
                      }`}
                    >
                      <Icon className="w-3 h-3 shrink-0" />{label}
                    </button>
                  ))}
                  {(tables[db] || []).map(t => (
                    <button key={`t:${t}`}
                      onClick={() => { onSelect(db, t); onView('table'); }}
                      className={`w-full flex items-center gap-1.5 pl-8 pr-3 py-1 rounded-lg text-left transition-colors ${
                        selected?.db === db && selected?.table === t && activeView === 'table'
                          ? 'bg-blue-600/15 text-blue-400'
                          : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
                      }`}>
                      <Table2 className="w-3 h-3 shrink-0" />
                      <span className="truncate text-xs">{t}</span>
                    </button>
                  ))}
                  {(views[db] || []).map(v => (
                    <button key={`v:${v}`}
                      onClick={() => { onSelect(db, v); onView('table'); }}
                      className={`w-full flex items-center gap-1.5 pl-8 pr-3 py-1 rounded-lg text-left transition-colors ${
                        selected?.db === db && selected?.table === v && activeView === 'table'
                          ? 'bg-purple-600/15 text-purple-400'
                          : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800'
                      }`}>
                      <Eye className="w-3 h-3 shrink-0 text-purple-500/70" />
                      <span className="truncate text-xs italic">{v}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          ))}
        </nav>

        <div className="px-2 py-2 border-t border-zinc-800 space-y-0.5">
          <button onClick={() => onView('users')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
              activeView === 'users' ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
            }`}>
            <Users className="w-4 h-4 shrink-0" />Users
          </button>
          <button onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <LogOut className="w-4 h-4 shrink-0" />Sign out
          </button>
        </div>
      </aside>

      {showConnPanel && <ConnectionPanel onClose={() => setShowConnPanel(false)} />}
    </>
  );
}
