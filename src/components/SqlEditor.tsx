'use client';
import { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Play, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface Props { db?: string; }

interface QueryResult {
  rows?: Record<string, unknown>[];
  affectedRows?: number;
  insertId?: number;
  elapsed: number;
  type: 'select' | 'write';
  error?: string;
}

export default function SqlEditor({ db }: Props) {
  const { connId } = useConn();
  const [sql, setSql] = useState(db ? `SELECT * FROM ` : 'SELECT 1;');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const editorRef = useRef<unknown>(null);

  async function runQuery() {
    const editor = editorRef.current as {
      getSelection: () => unknown;
      getModel: () => { getValueInRange: (s: unknown) => string } | null;
    } | null;
    const selected = editor?.getModel()?.getValueInRange(editor?.getSelection())?.trim();
    const toRun = (selected || sql).trim();
    if (!toRun) return;

    setRunning(true);
    try {
      const r = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: toRun, db, conn: connId }),
      });
      setResult(await r.json());
    } finally { setRunning(false); }
  }

  const columns = result?.rows?.length ? Object.keys(result.rows[0]) : [];

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 shrink-0 bg-zinc-900/50">
        {db && (
          <span className="text-xs font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded-md">
            {db}
          </span>
        )}
        <button
          onClick={runQuery}
          disabled={running}
          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          {running ? 'Running…' : 'Run'}
        </button>
        <span className="text-xs text-zinc-600">Ctrl+Enter to run · select text to run partial query</span>
      </div>

      {/* Editor */}
      <div className="h-52 border-b border-zinc-800 shrink-0">
        <MonacoEditor
          language="sql"
          value={sql}
          onChange={v => setSql(v || '')}
          onMount={editor => {
            editorRef.current = editor;
            editor.addCommand(2048 | 3, runQuery);
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
              {result.affectedRows} row{result.affectedRows !== 1 ? 's' : ''} affected
              {result.insertId ? ` · insert ID: ${result.insertId}` : ''}
              <span className="text-zinc-500 ml-2 flex items-center gap-1 inline-flex">
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
            </div>
            <table className="min-w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-zinc-900 z-10">
                <tr className="border-b border-zinc-800">
                  {columns.map(c => (
                    <th key={c} className="px-3 py-2.5 text-left font-medium text-zinc-400 whitespace-nowrap">
                      {c}
                    </th>
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

        {result?.rows && columns.length === 0 && (
          <div className="m-4 p-3 text-zinc-500 text-sm">Query returned no columns.</div>
        )}
      </div>
    </div>
  );
}
