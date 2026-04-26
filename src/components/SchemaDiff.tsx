'use client';
import { useState, useEffect } from 'react';
import { GitCompare, Loader2, AlertCircle, Plus, Minus, RefreshCw } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';

interface ConnInfo { id: string; name: string; type: string }

interface DiffResult {
  onlyInA: string[];
  onlyInB: string[];
  modified: Array<{
    table: string;
    addedColumns: string[];
    removedColumns: string[];
    changedColumns: Array<{ name: string; typeA: string; typeB: string }>;
  }>;
}

export default function SchemaDiff() {
  const { connId } = useConn();
  const [connections, setConnections] = useState<ConnInfo[]>([]);
  const [databases, setDatabases] = useState<{ a: string[]; b: string[] }>({ a: [], b: [] });
  const [connA, setConnA] = useState('default');
  const [connB, setConnB] = useState('default');
  const [dbA, setDbA] = useState('');
  const [dbB, setDbB] = useState('');
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/connections').then(r => r.json()).then(d => setConnections(d.connections || []));
  }, []);

  useEffect(() => {
    if (connA) {
      fetch(`/api/databases?conn=${connA}`).then(r => r.json()).then(d => {
        setDatabases(prev => ({ ...prev, a: d.databases || [] }));
        setDbA(d.databases?.[0] || '');
      });
    }
  }, [connA]);

  useEffect(() => {
    if (connB) {
      fetch(`/api/databases?conn=${connB}`).then(r => r.json()).then(d => {
        setDatabases(prev => ({ ...prev, b: d.databases || [] }));
        setDbB(d.databases?.[0] || '');
      });
    }
  }, [connB]);

  async function runDiff() {
    if (!dbA || !dbB) return;
    setLoading(true);
    setError('');
    setDiff(null);
    try {
      const r = await fetch('/api/databases/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connA, dbA, connB, dbB }),
      });
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setDiff(d);
    } finally {
      setLoading(false);
    }
  }

  const hasChanges = diff && (diff.onlyInA.length || diff.onlyInB.length || diff.modified.length);

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-5">
        <GitCompare className="w-5 h-5 text-violet-400" />
        <h2 className="text-sm font-semibold text-zinc-100">Schema Diff</h2>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {[
          { label: 'Database A', conn: connA, setConn: setConnA, db: dbA, setDb: setDbA, dbs: databases.a, side: 'A' },
          { label: 'Database B', conn: connB, setConn: setConnB, db: dbB, setDb: setDbB, dbs: databases.b, side: 'B' },
        ].map(({ label, conn, setConn, db, setDb, dbs, side }) => (
          <div key={side} className="border border-zinc-800 rounded-xl p-3 space-y-2">
            <span className="text-xs font-medium text-zinc-400">{label}</span>
            <select value={conn} onChange={e => setConn(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-violet-500 transition-colors">
              {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={db} onChange={e => setDb(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-violet-500 transition-colors">
              {dbs.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        ))}
      </div>

      <button
        onClick={runDiff}
        disabled={loading || !dbA || !dbB}
        className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors mb-5"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        Compare schemas
      </button>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {diff && !hasChanges && (
        <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl p-4">
          ✓ Schemas are identical
        </div>
      )}

      {diff && hasChanges ? (
        <div className="space-y-4">
          {diff.onlyInA.length > 0 && (
            <Section title={`Only in ${dbA} (${diff.onlyInA.length})`} color="red">
              {diff.onlyInA.map(t => (
                <div key={t} className="flex items-center gap-2 text-xs text-red-300 py-1">
                  <Minus className="w-3 h-3 text-red-400 shrink-0" />
                  <span className="font-mono">{t}</span>
                </div>
              ))}
            </Section>
          )}

          {diff.onlyInB.length > 0 && (
            <Section title={`Only in ${dbB} (${diff.onlyInB.length})`} color="green">
              {diff.onlyInB.map(t => (
                <div key={t} className="flex items-center gap-2 text-xs text-green-300 py-1">
                  <Plus className="w-3 h-3 text-green-400 shrink-0" />
                  <span className="font-mono">{t}</span>
                </div>
              ))}
            </Section>
          )}

          {diff.modified.length > 0 && (
            <Section title={`Modified tables (${diff.modified.length})`} color="amber">
              {diff.modified.map(m => (
                <div key={m.table} className="mb-3 last:mb-0">
                  <div className="text-xs font-mono font-medium text-amber-300 mb-1">{m.table}</div>
                  {m.addedColumns.map(c => (
                    <div key={c} className="flex items-center gap-2 text-xs text-green-400 pl-3 py-0.5">
                      <Plus className="w-3 h-3 shrink-0" /> column <span className="font-mono">{c}</span> added
                    </div>
                  ))}
                  {m.removedColumns.map(c => (
                    <div key={c} className="flex items-center gap-2 text-xs text-red-400 pl-3 py-0.5">
                      <Minus className="w-3 h-3 shrink-0" /> column <span className="font-mono">{c}</span> removed
                    </div>
                  ))}
                  {m.changedColumns.map(c => (
                    <div key={c.name} className="text-xs text-amber-300 pl-3 py-0.5">
                      ~ <span className="font-mono">{c.name}</span>{' '}
                      <span className="text-red-400 line-through">{c.typeA}</span>{' '}
                      → <span className="text-green-400">{c.typeB}</span>
                    </div>
                  ))}
                </div>
              ))}
            </Section>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: 'red' | 'green' | 'amber'; children: React.ReactNode }) {
  const colors = {
    red: 'border-red-500/20 bg-red-500/5',
    green: 'border-green-500/20 bg-green-500/5',
    amber: 'border-amber-500/20 bg-amber-500/5',
  };
  const textColors = { red: 'text-red-400', green: 'text-green-400', amber: 'text-amber-400' };
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${textColors[color]}`}>{title}</div>
      {children}
    </div>
  );
}
