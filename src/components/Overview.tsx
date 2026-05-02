'use client';
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Server, Database, HardDrive, Zap, Clock, Activity, BarChart2, AlertTriangle } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';

interface DbRow {
  database: string;
  tableCount: number;
  totalSize: number;
  dataSize: number;
  indexSize: number;
  estimatedRows: number;
}
interface OverviewData {
  server: {
    version: string; uptime: number; maxConnections: number; openConnections: number;
    cacheHitRate?: number;
    totalCommits?: number;
    totalRollbacks?: number;
    deadlocks?: number;
    tempBytes?: number;
  };
  databases: DbRow[];
}

function formatBytes(n: number): string {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function StatCard({ label, value, sub, icon: Icon, accent = false }: {
  label: string; value: string; sub?: string; icon: React.ElementType; accent?: boolean;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg shrink-0 ${accent ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800 text-zinc-400'}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide">{label}</div>
        <div className="text-xl font-semibold text-white mt-0.5 tabular-nums">{value}</div>
        {sub && <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

const BAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-cyan-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-pink-500', 'bg-orange-500', 'bg-teal-500',
];

export default function Overview() {
  const { connId } = useConn();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const r = await fetch(`/api/stats/overview?conn=${connId}`);
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setData(d);
      setLastRefresh(new Date());
    } finally { setLoading(false); }
  }, [connId]);

  useEffect(() => { load(); }, [load]);

  const totalSize = data?.databases.reduce((s, d) => s + d.totalSize, 0) ?? 0;
  const totalTables = data?.databases.reduce((s, d) => s + d.tableCount, 0) ?? 0;
  const maxSize = data ? Math.max(...data.databases.map(d => d.totalSize), 1) : 1;

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#09090b]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 sticky top-0 bg-[#09090b] z-10">
        <div>
          <h2 className="text-sm font-semibold text-white">Overview</h2>
          {lastRefresh && <p className="text-xs text-zinc-600 mt-0.5">Updated {lastRefresh.toLocaleTimeString()}</p>}
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="m-6 p-3 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl text-sm">{error}</div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center h-32 text-zinc-600 text-sm gap-2">
          <div className="w-4 h-4 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
          Loading…
        </div>
      )}

      {data && (
        <div className="p-6 space-y-6">
          {/* Server stats */}
          <div>
            <p className="text-[11px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Server</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Version"      value={data.server.version} icon={Server} />
              <StatCard label="Uptime"       value={formatUptime(data.server.uptime)} icon={Clock} accent />
              <StatCard label="Connections"  value={`${data.server.openConnections}`}
                sub={`of ${data.server.maxConnections} max`} icon={Zap} accent />
              <StatCard label="Total Size"   value={formatBytes(totalSize)}
                sub={`${totalTables} tables`} icon={HardDrive} />
            </div>
          </div>

          {/* PostgreSQL health stats */}
          {data.server.cacheHitRate !== undefined && (
            <div>
              <p className="text-[11px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Health</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  label="Cache Hit Rate"
                  value={`${data.server.cacheHitRate ?? 0}%`}
                  sub="buffer cache efficiency"
                  icon={Activity}
                  accent={data.server.cacheHitRate != null && data.server.cacheHitRate >= 95}
                />
                <StatCard
                  label="Commits"
                  value={(data.server.totalCommits ?? 0).toLocaleString()}
                  sub="total since start"
                  icon={BarChart2}
                />
                <StatCard
                  label="Rollbacks"
                  value={(data.server.totalRollbacks ?? 0).toLocaleString()}
                  sub="total since start"
                  icon={BarChart2}
                />
                <StatCard
                  label="Deadlocks"
                  value={(data.server.deadlocks ?? 0).toLocaleString()}
                  sub={data.server.tempBytes ? `${formatBytes(data.server.tempBytes)} temp` : 'total since start'}
                  icon={AlertTriangle}
                  accent={(data.server.deadlocks ?? 0) > 0}
                />
              </div>
            </div>
          )}

          {/* Databases */}
          <div>
            <p className="text-[11px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Databases</p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-4 py-3 text-left font-medium text-zinc-500">Database</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-500 w-40">Size</th>
                    <th className="px-4 py-3 text-right font-medium text-zinc-500">Tables</th>
                    <th className="px-4 py-3 text-right font-medium text-zinc-500">Est. Rows</th>
                    <th className="px-4 py-3 text-right font-medium text-zinc-500">Data</th>
                    <th className="px-4 py-3 text-right font-medium text-zinc-500">Indexes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.databases.map((db, i) => (
                    <tr key={db.database} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${BAR_COLORS[i % BAR_COLORS.length]}`} />
                          <Database className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          <span className="font-medium text-zinc-200">{db.database}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${BAR_COLORS[i % BAR_COLORS.length]} opacity-70`}
                              style={{ width: `${(db.totalSize / maxSize) * 100}%` }}
                            />
                          </div>
                          <span className="text-zinc-400 tabular-nums text-right w-16">{formatBytes(db.totalSize)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-400 tabular-nums">{db.tableCount || '—'}</td>
                      <td className="px-4 py-3 text-right text-zinc-500 tabular-nums">
                        {db.estimatedRows ? `~${db.estimatedRows.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500 tabular-nums">{db.dataSize ? formatBytes(db.dataSize) : '—'}</td>
                      <td className="px-4 py-3 text-right text-zinc-500 tabular-nums">{db.indexSize ? formatBytes(db.indexSize) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
