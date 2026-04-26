'use client';
import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Play, Clock, AlertCircle, CheckCircle2, Search, Download, FlaskConical, RotateCcw, ShieldAlert, Bookmark, Check, BarChart2 } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface Props {
  db?: string;
  initialSql?: string;
  onNavigateHistory?: () => void;
}

interface QueryResult {
  rows?: Record<string, unknown>[];
  affectedRows?: number;
  insertId?: number;
  elapsed: number;
  type: 'select' | 'write';
  error?: string;
  dryRun?: boolean;
}

const DESTRUCTIVE_RE = /^\s*(drop\s|truncate\s|delete\s+from\s|alter\s+table\s)/i;

function rowsToCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map(esc).join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

function downloadCSV(data: string, filename: string) {
  const blob = new Blob([data], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(rows: Record<string, unknown>[], filename: string) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ResultChart({ rows, columns }: { rows: Record<string, unknown>[]; columns: string[] }) {
  const numericCols = columns.filter(c => rows.slice(0, 20).every(r => r[c] === null || !isNaN(Number(r[c]))));
  const labelCols = columns.filter(c => !numericCols.includes(c));
  const [xCol, setXCol] = useState(labelCols[0] ?? columns[0]);
  const [yCol, setYCol] = useState(numericCols[0] ?? columns[1] ?? columns[0]);

  const data = rows.slice(0, 50);
  const values = data.map(r => Number(r[yCol]) || 0);
  const maxVal = Math.max(...values, 1);
  const chartH = 180;
  const barW = Math.max(8, Math.min(40, Math.floor(560 / data.length) - 4));

  return (
    <div className="px-4 py-3 border-t border-zinc-800">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="text-xs text-zinc-500">X axis:</span>
        <select value={xCol} onChange={e => setXCol(e.target.value)}
          className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-200 focus:outline-none">
          {columns.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs text-zinc-500">Y axis:</span>
        <select value={yCol} onChange={e => setYCol(e.target.value)}
          className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-200 focus:outline-none">
          {columns.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs text-zinc-600 ml-auto">{data.length} bars (max 50)</span>
      </div>
      <div className="overflow-x-auto">
        <svg width={Math.max(600, data.length * (barW + 4) + 60)} height={chartH + 50}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(pct => (
            <g key={pct}>
              <line x1="40" y1={chartH * (1 - pct)} x2={data.length * (barW + 4) + 50} y2={chartH * (1 - pct)}
                stroke="#27272a" strokeWidth="1" />
              <text x="35" y={chartH * (1 - pct) + 4} fill="#71717a" fontSize="9" textAnchor="end">
                {Math.round(maxVal * pct)}
              </text>
            </g>
          ))}
          {/* Bars */}
          {data.map((row, i) => {
            const val = Number(row[yCol]) || 0;
            const h = Math.max(1, (val / maxVal) * chartH);
            const x = 44 + i * (barW + 4);
            const label = String(row[xCol] ?? '').slice(0, 8);
            return (
              <g key={i}>
                <rect x={x} y={chartH - h} width={barW} height={h} rx="2" fill="#3b82f6" opacity="0.8" />
                <title>{label}: {val}</title>
                <text x={x + barW / 2} y={chartH + 14} fill="#71717a" fontSize="8" textAnchor="middle"
                  transform={`rotate(-35,${x + barW / 2},${chartH + 14})`}>
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function SqlEditor({ db, initialSql, onNavigateHistory }: Props) {
  const { connId } = useConn();
  const [sql, setSql] = useState(initialSql ?? (db ? `SELECT * FROM ` : 'SELECT 1;'));
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [dryRunMode, setDryRunMode] = useState(false);
  const [confirmPending, setConfirmPending] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(false);
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const editorRef = useRef<unknown>(null);
  const completionsRef = useRef<{ tables: string[]; columns: string[] }>({ tables: [], columns: [] });
  const disposableRef = useRef<{ dispose: () => void } | null>(null);

  useEffect(() => {
    if (!db || !connId) return;
    fetch(`/api/completions?conn=${connId}&db=${encodeURIComponent(db)}`)
      .then(r => r.json())
      .then(d => { completionsRef.current = d; });
  }, [db, connId]);

  useEffect(() => {
    return () => { disposableRef.current?.dispose(); };
  }, []);

  const getActiveSql = () => {
    const editor = editorRef.current as {
      getSelection: () => unknown;
      getModel: () => { getValueInRange: (s: unknown) => string } | null;
    } | null;
    const sel = editor?.getModel()?.getValueInRange(editor?.getSelection())?.trim();
    return (sel || sql).trim();
  };

  async function execute(toRun: string, opts: { explain?: boolean; dryRun?: boolean } = {}) {
    setRunning(true);
    setConfirmPending(null);
    try {
      const r = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: toRun, db, conn: connId, ...opts }),
      });
      setResult(await r.json());
    } finally { setRunning(false); }
  }

  async function runQuery(opts: { explain?: boolean; dryRun?: boolean } = {}) {
    const toRun = getActiveSql();
    if (!toRun) return;

    if (!opts.explain && !opts.dryRun && !dryRunMode && DESTRUCTIVE_RE.test(toRun)) {
      setConfirmPending(toRun);
      return;
    }
    await execute(toRun, { ...opts, dryRun: opts.dryRun ?? dryRunMode });
  }

  async function saveQuery() {
    const name = saveName.trim();
    if (!name) return;
    setSaveStatus('saving');
    await fetch('/api/query/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sql: getActiveSql(), db }),
    });
    setSaveStatus('saved');
    setTimeout(() => { setSaveStatus('idle'); setShowSavePanel(false); setSaveName(''); }, 1200);
  }

  const columns = result?.rows?.length ? Object.keys(result.rows[0]) : [];

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 shrink-0 bg-zinc-900/50 flex-wrap">
        {db && (
          <span className="text-xs font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded-md">
            {db}
          </span>
        )}
        <button
          onClick={() => runQuery()}
          disabled={running}
          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          {running ? 'Running…' : 'Run'}
        </button>

        <button
          onClick={() => runQuery({ explain: true })}
          disabled={running}
          title="Show query execution plan"
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Search className="w-3.5 h-3.5" /> Explain
        </button>

        <button
          onClick={() => setDryRunMode(d => !d)}
          title="Wrap query in a transaction and rollback — see effects without committing"
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
            dryRunMode
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700'
          }`}
        >
          <FlaskConical className="w-3.5 h-3.5" /> Dry run
        </button>

        {result?.rows && result.rows.length > 0 && (
          <>
            <button
              onClick={() => downloadCSV(rowsToCSV(result.rows!), 'query-result.csv')}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={() => downloadJSON(result.rows!, 'query-result.json')}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> JSON
            </button>
            <button
              onClick={() => setShowChart(c => !c)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                showChart ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" /> Chart
            </button>
          </>
        )}

        <button
          onClick={() => { setShowSavePanel(p => !p); setSaveName(''); setSaveStatus('idle'); }}
          title="Save query"
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
            showSavePanel ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" /> Save
        </button>

        {onNavigateHistory && (
          <button
            onClick={onNavigateHistory}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 px-2 py-1.5 rounded-lg transition-colors ml-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" /> History
          </button>
        )}

        <span className="text-xs text-zinc-600 ml-auto">Ctrl+Enter to run · select text for partial</span>
      </div>

      {/* Save query panel */}
      {showSavePanel && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-900/10 border-b border-amber-500/20 shrink-0">
          <Bookmark className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <input
            autoFocus
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveQuery(); if (e.key === 'Escape') setShowSavePanel(false); }}
            placeholder="Query name…"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
          <button
            onClick={saveQuery}
            disabled={!saveName.trim() || saveStatus !== 'idle'}
            className="flex items-center gap-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            {saveStatus === 'saved' ? <><Check className="w-3 h-3" /> Saved</> : 'Save'}
          </button>
          <button onClick={() => setShowSavePanel(false)} className="text-xs text-zinc-500 hover:text-zinc-200 px-2 py-1.5 rounded-lg transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* Destructive confirmation banner */}
      {confirmPending && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-900/20 border-b border-red-500/30 shrink-0">
          <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-xs text-red-300 flex-1">
            This query looks destructive (<code className="font-mono">{confirmPending.slice(0, 60)}{confirmPending.length > 60 ? '…' : ''}</code>).
            Are you sure?
          </span>
          <button
            onClick={() => execute(confirmPending, { dryRun: dryRunMode })}
            className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            Execute anyway
          </button>
          <button
            onClick={() => execute(confirmPending, { dryRun: true })}
            className="text-xs bg-amber-600/80 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            Dry run
          </button>
          <button
            onClick={() => setConfirmPending(null)}
            className="text-xs text-zinc-500 hover:text-zinc-200 px-2 py-1.5 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Editor */}
      <div className="h-52 border-b border-zinc-800 shrink-0">
        <MonacoEditor
          language="sql"
          value={sql}
          onChange={v => setSql(v || '')}
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            editor.addCommand(2048 | 3, () => runQuery());

            disposableRef.current?.dispose();
            disposableRef.current = monaco.languages.registerCompletionItemProvider('sql', {
              triggerCharacters: [' ', '.', '\n'],
              provideCompletionItems: () => {
                const { tables, columns } = completionsRef.current;
                const suggestions = [
                  ...tables.map((t: string) => ({
                    label: t,
                    kind: monaco.languages.CompletionItemKind.Class,
                    insertText: t,
                    detail: 'table',
                    range: undefined as never,
                  })),
                  ...columns.map((c: string) => ({
                    label: c,
                    kind: monaco.languages.CompletionItemKind.Field,
                    insertText: c,
                    detail: 'column',
                    range: undefined as never,
                  })),
                ];
                return { suggestions };
              },
            });
          }}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 22,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
            fontLigatures: true,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            renderLineHighlight: 'line',
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto">
        {result?.error && (
          <div className="m-4 flex items-start gap-2.5 p-3.5 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="font-mono text-xs">{result.error}</span>
          </div>
        )}

        {result && !result.error && result.type === 'write' && (
          <div className="m-4 flex items-center gap-2.5 p-3.5 text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {result.dryRun && <span className="text-amber-400 font-medium mr-2">[Dry run — rolled back]</span>}
              {result.affectedRows} row{result.affectedRows !== 1 ? 's' : ''} affected
              {result.insertId ? ` · insert ID: ${result.insertId}` : ''}
              <span className="text-zinc-500 ml-2 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />{result.elapsed}ms
              </span>
            </span>
          </div>
        )}

        {result?.rows && columns.length > 0 && (
          <div>
            <div className="flex items-center gap-3 px-4 py-2 text-xs text-zinc-500 border-b border-zinc-800">
              <span className="text-zinc-300 font-medium">{result.rows.length.toLocaleString()} rows</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{result.elapsed}ms</span>
              {result.dryRun && <span className="text-amber-400 font-medium">[Dry run — rolled back]</span>}
            </div>
            <table className="min-w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-zinc-900 z-10">
                <tr className="border-b border-zinc-800">
                  {columns.map(c => (
                    <th key={c} className="px-3 py-2.5 text-left font-medium text-zinc-400 whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors">
                    {columns.map(c => (
                      <td key={c} className="px-3 py-2 max-w-xs">
                        {row[c] === null
                          ? <span className="text-zinc-600 italic">NULL</span>
                          : <span className="text-zinc-200 truncate block font-mono">{String(row[c])}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showChart && result?.rows && columns.length > 1 && (
          <ResultChart rows={result.rows as Record<string, unknown>[]} columns={columns} />
        )}

        {result?.rows && columns.length === 0 && (
          <div className="m-4 p-3 text-zinc-500 text-sm">Query returned no columns.</div>
        )}
      </div>
    </div>
  );
}
