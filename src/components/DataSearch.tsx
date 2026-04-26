'use client';
import { useState } from 'react';
import { Search, Loader2, Table2, Hash, AlertCircle, ArrowRight } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';

interface Props {
  db: string;
  onNavigate: (db: string, table: string) => void;
}

interface Hit {
  table: string;
  column: string;
  value: string;
  pk: Record<string, unknown>;
}

export default function DataSearch({ db, onNavigate }: Props) {
  const { connId } = useConn();
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  async function search() {
    if (!term.trim()) return;
    setLoading(true);
    setError('');
    setSearched(false);
    try {
      const r = await fetch(`/api/databases/${encodeURIComponent(db)}/search?conn=${connId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: term.trim() }),
      });
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setHits(d.hits || []);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  const grouped = hits.reduce<Record<string, Hit[]>>((acc, h) => {
    (acc[h.table] ??= []).push(h);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-5">
        <Search className="w-5 h-5 text-blue-400" />
        <h2 className="text-sm font-semibold text-zinc-100">Search Data</h2>
        <span className="text-xs text-zinc-600 font-mono">{db}</span>
      </div>

      <div className="flex gap-2 mb-5">
        <input
          value={term}
          onChange={e => setTerm(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search all text columns…"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
          autoFocus
        />
        <button
          onClick={search}
          disabled={loading || !term.trim()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-zinc-500 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Searching all tables…
        </div>
      )}

      {searched && !loading && hits.length === 0 && (
        <div className="text-xs text-zinc-600 py-8 text-center">No results found for <span className="text-zinc-400 font-mono">"{term}"</span></div>
      )}

      {Object.entries(grouped).map(([table, tableHits]) => (
        <div key={table} className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Table2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-sm font-medium text-zinc-200">{table}</span>
            <span className="text-xs text-zinc-600">{tableHits.length} match{tableHits.length !== 1 ? 'es' : ''}</span>
            <button
              onClick={() => onNavigate(db, table)}
              className="ml-auto flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Open table <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <table className="min-w-full text-xs">
              <thead className="bg-zinc-900">
                <tr className="border-b border-zinc-800">
                  <th className="px-3 py-2 text-left text-zinc-500 font-medium w-32">Column</th>
                  <th className="px-3 py-2 text-left text-zinc-500 font-medium">Value</th>
                  <th className="px-3 py-2 text-left text-zinc-500 font-medium w-48">Primary key</th>
                </tr>
              </thead>
              <tbody>
                {tableHits.map((h, i) => (
                  <tr key={i} className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-3 py-2 text-purple-400 font-mono">{h.column}</td>
                    <td className="px-3 py-2 text-zinc-200 max-w-xs">
                      <Highlight text={h.value} term={term} />
                    </td>
                    <td className="px-3 py-2 text-zinc-500 font-mono text-[11px]">
                      {Object.entries(h.pk).map(([k, v]) => (
                        <span key={k} className="mr-2"><Hash className="w-2.5 h-2.5 inline" />{k}={String(v)}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function Highlight({ text, term }: { text: string; term: string }) {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return <span className="truncate block">{text}</span>;
  return (
    <span className="truncate block">
      {text.slice(0, idx)}
      <mark className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">{text.slice(idx, idx + term.length)}</mark>
      {text.slice(idx + term.length)}
    </span>
  );
}
