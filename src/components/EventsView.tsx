'use client';
import { useState, useEffect } from 'react';
import { Trash2, RefreshCw, CalendarClock } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';
import { useToast } from '@/context/ToastContext';

interface EventInfo {
  name: string; status: string; type: string;
  executeAt: string | null; intervalValue: string | null;
  intervalField: string | null; body: string;
}
interface Props { db: string; }

const STATUS_COLORS: Record<string, string> = {
  ENABLED:  'bg-green-500/10 text-green-400 border-green-500/20',
  DISABLED: 'bg-zinc-800 text-zinc-500 border-zinc-700',
  SLAVESIDE_DISABLED: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

export default function EventsView({ db }: Props) {
  const { connId } = useConn();
  const { toast } = useToast();
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/databases/${encodeURIComponent(db)}/events?conn=${connId}`);
      const d = await r.json();
      setEvents(d.events || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [db, connId]);

  async function drop(name: string) {
    if (!confirm(`Drop event "${name}"?`)) return;
    const r = await fetch(`/api/databases/${encodeURIComponent(db)}/events?conn=${connId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const d = await r.json();
    if (d.error) toast(d.error, 'error');
    else { toast(`Event "${name}" dropped`); load(); }
  }

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Events</h2>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">{db} · {events.length} {events.length === 1 ? 'event' : 'events'}</p>
        </div>
        <button onClick={load} disabled={loading} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-sm gap-2">
            <div className="w-4 h-4 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" /> Loading…
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 gap-3">
            <CalendarClock className="w-10 h-10 text-zinc-800" />
            <p className="text-sm text-zinc-600">No events in {db}</p>
            <p className="text-xs text-zinc-700">Events are MySQL/MariaDB only</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {events.map(ev => (
              <div key={ev.name}>
                <div
                  onClick={() => setExpanded(expanded === ev.name ? null : ev.name)}
                  className="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800/30 cursor-pointer group transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-sm text-zinc-200">{ev.name}</span>
                    <span className="ml-3 text-xs text-zinc-500">
                      {ev.type === 'RECURRING'
                        ? `every ${ev.intervalValue} ${ev.intervalField}`
                        : ev.executeAt ? `at ${ev.executeAt}` : ''}
                    </span>
                  </div>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${STATUS_COLORS[ev.status] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                    {ev.status}
                  </span>
                  <span className="text-[10px] text-zinc-600 uppercase">{ev.type}</span>
                  <button
                    onClick={e => { e.stopPropagation(); drop(ev.name); }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {expanded === ev.name && (
                  <div className="px-6 pb-4 bg-zinc-900/40">
                    <pre className="text-xs font-mono text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-x-auto whitespace-pre">
                      {ev.body || '(empty)'}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
