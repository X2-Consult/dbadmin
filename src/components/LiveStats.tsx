'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, Pause, Play, WifiOff, TrendingUp, Database, Cpu, ArrowDown, ArrowUp } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';

interface Snapshot { stats: Record<string, number>; ts: number; }
interface Rate {
  queries: number; selects: number; inserts: number; updates: number; deletes: number;
  bytesSent: number; bytesReceived: number; slowQueries: number;
  threadsConnected: number; threadsRunning: number; bufferHitRate: number;
}

function fmt(n: number, dec = 1): string {
  if (n < 0) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(dec);
}
function fmtBytes(b: number): string {
  if (b < 1024) return `${b.toFixed(0)} B/s`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB/s`;
  return `${(b / 1048576).toFixed(1)} MB/s`;
}

function MetricCard({
  label, value, sub, icon: Icon, warn = false, accent = false,
}: { label: string; value: string; sub?: string; icon: React.ElementType; warn?: boolean; accent?: boolean }) {
  return (
    <div className={`bg-zinc-900 border rounded-xl p-4 transition-colors ${
      warn ? 'border-amber-500/30 bg-amber-500/5' : accent ? 'border-blue-500/30' : 'border-zinc-800'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">{label}</span>
        <Icon className={`w-3.5 h-3.5 ${warn ? 'text-amber-400' : accent ? 'text-blue-400' : 'text-zinc-600'}`} />
      </div>
      <div className={`text-2xl font-bold tabular-nums ${warn ? 'text-amber-400' : accent ? 'text-blue-400' : 'text-white'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-zinc-600 mt-1">{sub}</div>}
    </div>
  );
}

export default function LiveStats() {
  const { connId } = useConn();
  const [rate, setRate] = useState<Rate | null>(null);
  const [running, setRunning] = useState(true);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState('');
  const prev = useRef<Snapshot | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/stats/live?conn=${connId}`);
      const d = await r.json();
      if (d.error) { setError(d.error); setConnected(false); return; }
      setConnected(true);
      setError('');

      const curr: Snapshot = { stats: d.stats, ts: d.ts };
      if (prev.current) {
        const elapsed = (curr.ts - prev.current.ts) / 1000;
        if (elapsed > 0) {
          const delta = (key: string) => Math.max(0, (curr.stats[key] - (prev.current!.stats[key] ?? 0)) / elapsed);
          const poolReqs = curr.stats['innodb_buffer_pool_read_requests'];
          const poolReads = curr.stats['innodb_buffer_pool_reads'];
          setRate({
            queries: delta('queries'),
            selects: delta('com_select'),
            inserts: delta('com_insert'),
            updates: delta('com_update'),
            deletes: delta('com_delete'),
            bytesSent: delta('bytes_sent'),
            bytesReceived: delta('bytes_received'),
            slowQueries: delta('slow_queries'),
            threadsConnected: curr.stats['threads_connected'],
            threadsRunning: curr.stats['threads_running'],
            bufferHitRate: poolReqs > 0 ? ((poolReqs - poolReads) / poolReqs) * 100 : -1,
          });
        }
      }
      prev.current = curr;
    } catch { setConnected(false); }
  }, [connId]);

  // Reset rate when connection changes
  useEffect(() => { prev.current = null; setRate(null); }, [connId]);

  useEffect(() => {
    if (!running) return;
    poll();
    timerRef.current = setInterval(poll, 2000);

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        prev.current = null;
        poll();
        timerRef.current = setInterval(poll, 2000);
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [running, poll]);

  function toggle() {
    if (running) { if (timerRef.current) clearInterval(timerRef.current); setRunning(false); }
    else { prev.current = null; setRunning(true); }
  }

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#09090b]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 sticky top-0 bg-[#09090b] z-10">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">Live Stats</h2>
          <div className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${
            connected && running
              ? 'bg-green-500/10 text-green-400 border-green-500/20'
              : 'bg-zinc-800 text-zinc-500 border-zinc-700'
          }`}>
            {connected && running
              ? <><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />Live</>
              : <><WifiOff className="w-3 h-3" />Paused</>}
          </div>
          {running && <span className="text-xs text-zinc-600">polls every 2s · pauses when tab is hidden</span>}
        </div>
        <button onClick={toggle}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors">
          {running ? <><Pause className="w-3.5 h-3.5" />Pause</> : <><Play className="w-3.5 h-3.5" />Resume</>}
        </button>
      </div>

      {error && (
        <div className="m-6 p-3 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl text-sm">{error}</div>
      )}

      <div className="p-6 space-y-6">
        {!rate && (
          <div className="flex items-center justify-center gap-2 text-zinc-600 text-sm py-12">
            <Activity className="w-4 h-4 animate-pulse" />
            Waiting for second sample…
          </div>
        )}

        {rate && (
          <>
            <div>
              <p className="text-[11px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Throughput / sec</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <MetricCard label="Queries"  value={fmt(rate.queries)}  icon={TrendingUp} accent />
                <MetricCard label="Selects"  value={fmt(rate.selects)}  icon={Database} />
                <MetricCard label="Inserts"  value={fmt(rate.inserts)}  icon={Database} />
                <MetricCard label="Updates"  value={fmt(rate.updates)}  icon={Database} />
                <MetricCard label="Deletes"  value={fmt(rate.deletes)}  icon={Database}
                  warn={rate.deletes > 10} />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Connections &amp; Threads</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <MetricCard label="Threads Connected" value={String(rate.threadsConnected)} icon={Cpu}
                  warn={rate.threadsConnected > 20} />
                <MetricCard label="Threads Running"   value={String(rate.threadsRunning)}   icon={Cpu}
                  warn={rate.threadsRunning > 5} accent={rate.threadsRunning > 0} />
                <MetricCard label="Slow Queries"      value={fmt(rate.slowQueries, 2)}       icon={Activity}
                  sub="per second" warn={rate.slowQueries > 0.1} />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Network I/O</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <MetricCard label="Sent"     value={fmtBytes(rate.bytesSent)}     icon={ArrowUp} />
                <MetricCard label="Received" value={fmtBytes(rate.bytesReceived)} icon={ArrowDown} />
                <MetricCard
                  label="InnoDB Buffer Hit"
                  value={rate.bufferHitRate < 0 ? '—' : `${rate.bufferHitRate.toFixed(1)}%`}
                  sub={rate.bufferHitRate < 0 ? undefined : rate.bufferHitRate > 99 ? 'excellent' : rate.bufferHitRate > 95 ? 'good' : 'low — check indexes'}
                  icon={Cpu}
                  accent={rate.bufferHitRate >= 95}
                  warn={rate.bufferHitRate > 0 && rate.bufferHitRate < 95}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
