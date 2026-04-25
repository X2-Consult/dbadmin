'use client';
import { useState } from 'react';
import { ConnectionProvider } from '@/context/ConnectionContext';
import Sidebar from '@/components/Sidebar';
import TableBrowser from '@/components/TableBrowser';
import SqlEditor from '@/components/SqlEditor';
import StructureView from '@/components/StructureView';
import UserManager from '@/components/UserManager';
import Overview from '@/components/Overview';
import LiveStats from '@/components/LiveStats';
import { LayoutList, Code2, Table2 } from 'lucide-react';

type TableTab = 'data' | 'structure' | 'sql';

function App() {
  const [selected, setSelected] = useState<{ db: string; table: string } | null>(null);
  const [view, setView] = useState<string>('overview');
  const [tableTab, setTableTab] = useState<TableTab>('data');

  function onSelect(db: string, table: string) {
    setSelected({ db, table });
    setView('table');
    setTableTab('data');
  }

  const tableTabs: { id: TableTab; label: string; icon: React.ReactNode }[] = [
    { id: 'data',      label: 'Data',      icon: <LayoutList className="w-3.5 h-3.5" /> },
    { id: 'structure', label: 'Structure', icon: <Table2 className="w-3.5 h-3.5" /> },
    { id: 'sql',       label: 'SQL',       icon: <Code2 className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex h-screen bg-[#09090b] overflow-hidden">
      <Sidebar selected={selected} onSelect={onSelect} activeView={view} onView={setView} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {view === 'table' && selected && (
          <div className="flex items-center gap-1 px-4 pt-3 pb-0 bg-[#09090b] border-b border-zinc-800 shrink-0">
            <span className="text-xs text-zinc-500 font-mono mr-2">
              <span className="text-zinc-600">{selected.db}</span>
              <span className="text-zinc-700">.</span>
              <span className="text-zinc-300 font-medium">{selected.table}</span>
            </span>
            {tableTabs.map(t => (
              <button key={t.id} onClick={() => setTableTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  tableTab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {view === 'overview' && <Overview />}
          {view === 'live'     && <LiveStats />}
          {view === 'users'    && <UserManager />}
          {view === 'table' && selected && tableTab === 'data'      && <TableBrowser db={selected.db} table={selected.table} />}
          {view === 'table' && selected && tableTab === 'structure' && <StructureView db={selected.db} table={selected.table} />}
          {view === 'table' && selected && tableTab === 'sql'       && <SqlEditor db={selected.db} />}
          {view === 'sql'   && <SqlEditor db={selected?.db} />}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <ConnectionProvider>
      <App />
    </ConnectionProvider>
  );
}
