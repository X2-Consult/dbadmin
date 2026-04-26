'use client';
import { useState, useEffect, useCallback } from 'react';
import { ConnectionProvider } from '@/context/ConnectionContext';
import Sidebar from '@/components/Sidebar';
import TableBrowser from '@/components/TableBrowser';
import SqlEditor from '@/components/SqlEditor';
import StructureView from '@/components/StructureView';
import UserManager from '@/components/UserManager';
import Overview from '@/components/Overview';
import LiveStats from '@/components/LiveStats';
import QueryHistory from '@/components/QueryHistory';
import DDLEditor from '@/components/DDLEditor';
import BackupRestore from '@/components/BackupRestore';
import SavedQueries from '@/components/SavedQueries';
import HelpDocs from '@/components/HelpDocs';
import SearchPalette from '@/components/SearchPalette';
import CreateTable from '@/components/CreateTable';
import CreateDatabase from '@/components/CreateDatabase';
import ErrorBoundary from '@/components/ErrorBoundary';
import DropDatabaseModal from '@/components/DropDatabaseModal';
import TableActions from '@/components/TableActions';
import ImportModal from '@/components/ImportModal';
import ProcessList from '@/components/ProcessList';
import RoutinesView from '@/components/RoutinesView';
import TriggersView from '@/components/TriggersView';
import EventsView from '@/components/EventsView';
import ServerVariables from '@/components/ServerVariables';
import { LayoutList, Code2, Table2, Wrench, Upload } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';

type TableTab = 'data' | 'structure' | 'sql' | 'ddl';

function App() {
  const { connId } = useConn();
  const [selected, setSelected] = useState<{ db: string; table: string } | null>(null);
  const [view, setView] = useState<string>('overview');
  const [tableTab, setTableTab] = useState<TableTab>('data');
  const [replaySql, setReplaySql] = useState<{ sql: string; db?: string } | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [createTableDb, setCreateTableDb] = useState<string | null>(null);
  const [showCreateDb, setShowCreateDb] = useState(false);
  const [dropDbTarget, setDropDbTarget] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [dbView, setDbView] = useState<{ db: string; view: string } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(s => !s);
      }
      if (e.key === 'Escape') setShowSearch(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onSelect(db: string, table: string) {
    setSelected({ db, table });
    setView('table');
    setTableTab('data');
  }

  function handleReplay(sql: string, db?: string) {
    setReplaySql({ sql, db });
    setView('sql');
  }

  const handleSearch = useCallback((db: string, table: string) => {
    onSelect(db, table);
  }, []);

  const tableTabs: { id: TableTab; label: string; icon: React.ReactNode }[] = [
    { id: 'data',      label: 'Data',      icon: <LayoutList className="w-3.5 h-3.5" /> },
    { id: 'structure', label: 'Structure', icon: <Table2 className="w-3.5 h-3.5" /> },
    { id: 'ddl',       label: 'DDL',       icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: 'sql',       label: 'SQL',       icon: <Code2 className="w-3.5 h-3.5" /> },
  ];

  // Pass readonly status from connection to components that need it
  // (connection info is fetched in sidebar; we pass it through context or props)
  // For now, we propagate via connId change effects in the components themselves

  return (
    <div className="flex h-screen bg-[#09090b] overflow-hidden">
      <Sidebar
        selected={selected}
        onSelect={onSelect}
        activeView={view}
        onView={setView}
        onSearch={() => setShowSearch(true)}
        onCreateTable={db => setCreateTableDb(db)}
        onDropDb={db => setDropDbTarget(db)}
        onCreateDb={() => setShowCreateDb(true)}
        onDbView={(db, v) => { setDbView({ db, view: v }); setView(`db-${v}`); }}
      />

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
            <div className="ml-auto flex items-center gap-1 pb-1">
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg transition-colors"
                title="Import CSV into this table"
              >
                <Upload className="w-3.5 h-3.5" /> Import
              </button>
              <TableActions
                db={selected.db}
                table={selected.table}
                onRenamed={newName => setSelected({ db: selected.db, table: newName })}
                onDropped={() => { setSelected(null); setView('overview'); }}
                onTruncated={() => setTableTab('data')}
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <ErrorBoundary>
            {view === 'overview' && <Overview />}
            {view === 'live'     && <LiveStats />}
            {view === 'users'    && <UserManager />}
            {view === 'history'  && <QueryHistory onReplay={handleReplay} />}
            {view === 'saved'    && <SavedQueries onReplay={handleReplay} />}
            {view === 'backup'     && <BackupRestore />}
            {view === 'help'       && <HelpDocs />}
            {view === 'processes'  && <ProcessList />}
            {view === 'variables'  && <ServerVariables />}
            {view === 'db-routines' && dbView && <RoutinesView db={dbView.db} />}
            {view === 'db-triggers' && dbView && <TriggersView db={dbView.db} />}
            {view === 'db-events'   && dbView && <EventsView   db={dbView.db} />}

            {view === 'table' && selected && tableTab === 'data'      && (
              <TableBrowser db={selected.db} table={selected.table} />
            )}
            {view === 'table' && selected && tableTab === 'structure' && (
              <StructureView db={selected.db} table={selected.table} />
            )}
            {view === 'table' && selected && tableTab === 'ddl'       && (
              <DDLEditor db={selected.db} table={selected.table} />
            )}
            {view === 'table' && selected && tableTab === 'sql'       && (
              <SqlEditor db={selected.db} onNavigateHistory={() => setView('history')} />
            )}
            {view === 'sql' && (
              <SqlEditor
                key={replaySql ? `${replaySql.sql}-${connId}` : 'standalone'}
                db={replaySql?.db ?? selected?.db}
                initialSql={replaySql?.sql}
                onNavigateHistory={() => setView('history')}
              />
            )}
          </ErrorBoundary>
        </div>
      </div>
      {showSearch && (
        <SearchPalette onNavigate={handleSearch} onClose={() => setShowSearch(false)} />
      )}

      {createTableDb && (
        <CreateTable
          db={createTableDb}
          onClose={() => setCreateTableDb(null)}
          onCreated={(db, table) => { setCreateTableDb(null); onSelect(db, table); }}
        />
      )}

      {showCreateDb && (
        <CreateDatabase
          onClose={() => setShowCreateDb(false)}
          onCreated={() => setShowCreateDb(false)}
        />
      )}

      {showImport && selected && (
        <ImportModal
          db={selected.db}
          table={selected.table}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); setTableTab('data'); }}
        />
      )}

      {dropDbTarget && (
        <DropDatabaseModal
          db={dropDbTarget}
          onClose={() => setDropDbTarget(null)}
          onDropped={db => {
            setDropDbTarget(null);
            if (selected?.db === db) { setSelected(null); setView('overview'); }
          }}
          onGoBackup={() => { setDropDbTarget(null); setView('backup'); }}
        />
      )}
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
