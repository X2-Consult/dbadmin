'use client';
import { useState, useEffect } from 'react';
import { Gauge, RefreshCw, Loader2, AlertCircle, Clock, Hash } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';

interface SlowQuery {
  query: string;
  calls: number;
  avgMs: number;
  maxMs: number;
  totalMs: number;
}

export default function SlowQueryLog() {
  const { connId } = useConn();
  const [queries, setQueries] = useState<SlowQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<keyof SlowQuery>('avgMs');
  const [expanded, setExpanded] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/server/slow-queries?conn=${connId}`);
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setQueries(d.queries || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [connId]);

  const sorted = [...queries].sort((a, b) => Number(b[sortBy]) - Number(a[sortBy]));

  const cols: { key: keyof SlowQuery; label: string }[] = [
    { key: 'avgMs', label: 'Avg (ms)' },
    { key: 'maxMs', label: 'Max (ms)' },
    { key: 'calls', label: 'Calls' },
    { key: 'totalMs', label: 'Total (ms)' },
  ];

  function barWidth(val: number, max: number) {
    return Math.max(2, Math.round((val / Math.max(max, 1)) * 100));
  }
  const maxAvg = Math.max(...queries.map(q => q.avgMs), 1);

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Gauge className="w-5 h-5 text-orange-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Top Queries</h2>
          <span className="text-xs text-zinc-600">by performance_schema / pg_stat_statements</span>
        </div>
        <button onClick={load} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-zinc-500 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />Loading…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error.includes('performance_schema') || error.includes('pg_stat_statements')
            ? 'Performance schema / pg_stat_statements not available. Enable performance_schema or install the pg_stat_statements extension.'
            : error}
        </div>
      )}

      {!loading && !error && queries.length === 0 && (
        <div className="text-xs text-zinc-600 py-8 text-center">No query stats available</div>
      )}

      {!loading && sorted.length > 0 && (
        <>
          <div className="flex items-center gap-1 mb-3">
            <span className="text-xs text-zinc-500 mr-2">Sort by:</span>
            {cols.map(c => (
              <button key={c.key} onClick={() => setSortBy(c.key)}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                  sortBy === c.key ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                }`}>
                {c.label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            {sorted.map((q, i) => (
              <div key={i} className="border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/40 transition-colors text-left"
                >
                  <span className="text-xs text-zinc-600 w-5 text-right shrink-0">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-200 font-mono truncate">
                      {q.query.trim().slice(0, 120)}{q.query.length > 120 ? '…' : ''}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1">
                      <div className="h-1.5 rounded-full bg-orange-500/70 transition-all" style={{ width: `${barWidth(q.avgMs, maxAvg)}%`, maxWidth: '200px' }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs">
                    <span className="flex items-center gap-1 text-orange-400"><Clock className="w-3 h-3" />{q.avgMs}ms avg</span>
                    <span className="text-zinc-600 flex items-center gap-1"><Hash className="w-3 h-3" />{q.calls.toLocaleString()}</span>
                    <span className="text-zinc-600 text-[11px]">{q.maxMs}ms max</span>
                  </div>
                </button>
                {expanded === i && (
                  <div className="border-t border-zinc-800 bg-zinc-900/50 px-4 py-3">
                    <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap break-all">{q.query}</pre>
                    <div className="flex gap-6 mt-3 text-xs text-zinc-500">
                      <span>Avg: <span className="text-orange-400">{q.avgMs}ms</span></span>
                      <span>Max: <span className="text-red-400">{q.maxMs}ms</span></span>
                      <span>Calls: <span className="text-zinc-300">{q.calls.toLocaleString()}</span></span>
                      <span>Total: <span className="text-zinc-300">{q.totalMs.toLocaleString()}ms</span></span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
