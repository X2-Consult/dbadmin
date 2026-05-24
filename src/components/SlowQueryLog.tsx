'use client';
import { useState, useEffect } from 'react';
import { Gauge, RefreshCw, Loader2, AlertCircle, Clock, Hash, Info, RotateCcw, Filter } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';

interface NoisePattern { re: RegExp; label: string; }

const PG_NOISE_PATTERNS: NoisePattern[] = [
  // backup / pg_dump
  { re: /^\s*set\s+/i,              label: 'SET statement (backup config)' },
  { re: /^\s*show\s+/i,             label: 'SHOW statement' },
  { re: /^\s*lock\s+table/i,        label: 'LOCK TABLE (backup)' },
  { re: /^\s*copy\s+/i,             label: 'COPY (data export)' },
  { re: /^\s*begin\s*$/i,           label: 'BEGIN (transaction boundary)' },
  { re: /^\s*commit\s*$/i,          label: 'COMMIT (transaction boundary)' },
  { re: /^\s*rollback\s*$/i,        label: 'ROLLBACK (transaction boundary)' },
  { re: /pg_catalog\./i,            label: 'pg_catalog reference' },
  { re: /information_schema\./i,    label: 'information_schema reference' },
  { re: /pg_get_constraintdef/i,    label: 'pg_get_constraintdef (DDL extraction)' },
  { re: /pg_get_indexdef/i,         label: 'pg_get_indexdef (DDL extraction)' },
  { re: /pg_get_expr/i,             label: 'pg_get_expr (DDL extraction)' },
  { re: /pg_get_functiondef/i,      label: 'pg_get_functiondef (DDL extraction)' },
  { re: /pg_get_triggerdef/i,       label: 'pg_get_triggerdef (DDL extraction)' },
  { re: /\bpg_class\b/i,            label: 'pg_class (catalog table)' },
  { re: /\bpg_namespace\b/i,        label: 'pg_namespace (catalog table)' },
  { re: /\bpg_attribute\b/i,        label: 'pg_attribute (catalog table)' },
  { re: /\bpg_constraint\b/i,       label: 'pg_constraint (catalog table)' },
  { re: /\bpg_index\b/i,            label: 'pg_index (catalog table)' },
  { re: /\bpg_proc\b/i,             label: 'pg_proc (catalog table)' },
  { re: /\bpg_type\b/i,             label: 'pg_type (catalog table)' },
  { re: /\bpg_am\b/i,               label: 'pg_am (catalog table)' },
  { re: /\bpg_trigger\b/i,          label: 'pg_trigger (catalog table)' },
  // internal app queries
  { re: /\bpg_stat_\w/i,            label: 'pg_stat_* (app: server stats)' },
  { re: /\bpg_settings\b/i,         label: 'pg_settings (app: server config)' },
  { re: /\bpg_roles\b/i,            label: 'pg_roles (app: user manager)' },
  { re: /\bpg_database\b/i,         label: 'pg_database (app: overview)' },
  { re: /\bpg_indexes\b/i,          label: 'pg_indexes (app: structure browser)' },
  { re: /\bpg_terminate_backend\b/i,label: 'pg_terminate_backend (app: process list)' },
  { re: /\bpg_postmaster_start_time\b/i, label: 'pg_postmaster_start_time (app: uptime)' },
  { re: /\bpg_database_size\b/i,    label: 'pg_database_size (app: overview)' },
  { re: /\bpg_relation_size\b/i,    label: 'pg_relation_size (app: overview)' },
  { re: /\bpg_indexes_size\b/i,     label: 'pg_indexes_size (app: overview)' },
  { re: /^\s*select\s+version\s*\(\s*\)/i, label: 'SELECT version() (app: server info)' },
];

const MYSQL_NOISE_PATTERNS: NoisePattern[] = [
  // backup / mysqldump / xtrabackup
  { re: /^\s*show\s+/i,             label: 'SHOW statement (backup/app)' },
  { re: /^\s*flush\s+/i,            label: 'FLUSH (backup)' },
  { re: /^\s*set\s+(names|@@|character_set|collation|global|session)/i, label: 'SET config (backup)' },
  { re: /information_schema\./i,    label: 'information_schema reference' },
  { re: /SQL_NO_CACHE/i,            label: 'SQL_NO_CACHE (mysqldump)' },
  { re: /^\s*select\s+@@/i,         label: 'SELECT @@ (config query)' },
  { re: /^\s*lock\s+tables/i,       label: 'LOCK TABLES (backup)' },
  { re: /^\s*unlock\s+tables/i,     label: 'UNLOCK TABLES (backup)' },
  { re: /^\s*start\s+transaction/i, label: 'START TRANSACTION (backup)' },
  { re: /performance_schema\./i,    label: 'performance_schema reference' },
  // internal app queries
  { re: /^\s*describe\s+/i,         label: 'DESCRIBE (app: structure browser)' },
  { re: /\bmysql\.user\b/i,         label: 'mysql.user (app: user manager)' },
];

function getMatchedPatterns(query: string, isPg: boolean): string[] {
  const patterns = isPg ? PG_NOISE_PATTERNS : MYSQL_NOISE_PATTERNS;
  return patterns.filter(p => p.re.test(query)).map(p => p.label);
}

function isBackupNoise(query: string, isPg: boolean): boolean {
  return getMatchedPatterns(query, isPg).length > 0;
}

type Period = 'hour' | 'day' | 'week' | 'all';

interface SlowQuery {
  query: string;
  calls: number;
  avgMs: number;
  maxMs: number;
  totalMs: number;
}

function NoiseTag({ matched }: { matched: string[] }) {
  if (matched.length === 0) return null;
  return (
    <div className="relative group/noise shrink-0" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 cursor-default">
        <Filter className="w-2.5 h-2.5 text-zinc-500" />
        <span className="text-[10px] text-zinc-500">{matched.length}</span>
      </div>
      <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover/noise:block z-50 w-64 pointer-events-none">
        <div className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2.5 shadow-xl">
          <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Matched noise patterns</p>
          <ul className="space-y-0.5">
            {matched.map((label, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-300">
                <span className="text-zinc-600 mt-0.5 shrink-0">·</span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const PERIODS: { value: Period; label: string }[] = [
  { value: 'hour', label: 'Last hour' },
  { value: 'day',  label: 'Last 24h' },
  { value: 'week', label: 'Last 7d' },
  { value: 'all',  label: 'All time' },
];

export default function SlowQueryLog() {
  const { connId } = useConn();
  const [isPg, setIsPg] = useState(false);
  const [queries, setQueries] = useState<SlowQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<keyof SlowQuery>('avgMs');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>('all');
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [filterNoise, setFilterNoise] = useState(true);

  async function resetStats() {
    setResetting(true);
    setConfirmReset(false);
    try {
      const r = await fetch(`/api/server/slow-queries?conn=${connId}`, { method: 'POST' });
      const d = await r.json();
      if (!d.error) load();
    } finally {
      setResetting(false);
    }
  }

  async function load(p = period) {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/server/slow-queries?conn=${connId}&period=${p}`);
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setQueries(d.queries || []);
      setIsPg(d.isPg ?? false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [connId, period]);

  const visible = filterNoise ? queries.filter(q => !isBackupNoise(q.query, isPg)) : queries;
  const sorted = [...visible].sort((a, b) => Number(b[sortBy]) - Number(a[sortBy]));
  const hiddenCount = queries.length - visible.length;

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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="w-5 h-5 text-orange-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Top Queries</h2>
        </div>
        <div className="flex items-center gap-2">
          {!isPg && (
            <div className="flex items-center gap-1 bg-zinc-800/60 rounded-lg p-1">
              {PERIODS.map(p => (
                <button key={p.value} onClick={() => setPeriod(p.value)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    period === p.value
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {isPg && (
            confirmReset ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-zinc-400">Reset all stats?</span>
                <button onClick={resetStats} disabled={resetting}
                  className="px-2 py-1 rounded-md text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">
                  {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes, reset'}
                </button>
                <button onClick={() => setConfirmReset(false)}
                  className="px-2 py-1 rounded-md text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)}
                title="Reset pg_stat_statements"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )
          )}
          <button
            onClick={() => setFilterNoise(v => !v)}
            title={filterNoise ? 'Backup noise hidden — click to show all' : 'Show all queries — click to hide backup noise'}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors ${
              filterNoise
                ? 'bg-orange-500/15 text-orange-400 border border-orange-500/25 hover:bg-orange-500/25'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Filter className="w-3 h-3" />
            {filterNoise ? 'Noise filtered' : 'Show all'}
          </button>
          <button onClick={() => load()} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isPg && (
        <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-3 py-2 mb-4">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-600" />
          pg_stat_statements accumulates since last reset — time filtering is not available. Use the reset button above to clear stats and start fresh.
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-zinc-500 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />Loading…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error.includes('pg_stat_statements')
            ? 'pg_stat_statements is not enabled. Run: CREATE EXTENSION pg_stat_statements; — and add shared_preload_libraries = \'pg_stat_statements\' to postgresql.conf, then restart PostgreSQL.'
            : error.includes('performance_schema')
            ? 'performance_schema is not available. Enable it by adding performance_schema=ON to my.cnf and restarting MySQL/MariaDB.'
            : error}
        </div>
      )}

      {!loading && !error && queries.length === 0 && (
        <div className="text-xs text-zinc-600 py-8 text-center">No query stats available</div>
      )}

      {!loading && filterNoise && hiddenCount > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-600 mb-3">
          <Filter className="w-3 h-3" />
          {hiddenCount} backup/system {hiddenCount === 1 ? 'query' : 'queries'} hidden
          <button onClick={() => setFilterNoise(false)} className="text-zinc-500 hover:text-zinc-300 underline underline-offset-2 ml-0.5">show</button>
        </div>
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
            {sorted.map((q, i) => {
              const matched = getMatchedPatterns(q.query, isPg);
              return (
              <div key={i} className="border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/40 transition-colors text-left"
                >
                  <span className="text-xs text-zinc-600 w-5 text-right shrink-0">#{i + 1}</span>
                  {matched.length > 0 && <NoiseTag matched={matched} />}
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
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
