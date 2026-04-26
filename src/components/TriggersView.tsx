'use client';
import { useState, useEffect } from 'react';
import { Trash2, ChevronDown, ChevronRight, RefreshCw, Zap } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';
import { useToast } from '@/context/ToastContext';

interface Trigger { name: string; event: string; table: string; timing: string; body: string; }
interface Props { db: string; }

const EVENT_COLORS: Record<string, string> = {
  INSERT: 'bg-green-500/10 text-green-400 border-green-500/20',
  UPDATE: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  DELETE: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function TriggersView({ db }: Props) {
  const { connId } = useConn();
  const { toast } = useToast();
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/databases/${encodeURIComponent(db)}/triggers?conn=${connId}`);
      const d = await r.json();
      setTriggers(d.triggers || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [db, connId]);

  async function drop(t: Trigger) {
    if (!confirm(`Drop trigger "${t.name}" on ${t.table}?`)) return;
    const r = await fetch(`/api/databases/${encodeURIComponent(db)}/triggers?conn=${connId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: t.name, table: t.table }),
    });
    const d = await r.json();
    if (d.error) toast(d.error, 'error');
    else { toast(`Trigger "${t.name}" dropped`); load(); }
  }

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Triggers</h2>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">{db} · {triggers.length} {triggers.length === 1 ? 'trigger' : 'triggers'}</p>
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
        ) : triggers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 gap-3">
            <Zap className="w-10 h-10 text-zinc-800" />
            <p className="text-sm text-zinc-600">No triggers in {db}</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {triggers.map(t => {
              const isOpen = expanded === t.name;
              return (
                <div key={t.name}>
                  <div
                    onClick={() => setExpanded(isOpen ? null : t.name)}
                    className="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800/30 cursor-pointer group transition-colors"
                  >
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-sm text-zinc-200">{t.name}</span>
                      <span className="ml-2 text-xs text-zinc-500">on <span className="text-zinc-300 font-mono">{t.table}</span></span>
                    </div>
                    <span className="text-[10px] text-zinc-500 uppercase">{t.timing}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${EVENT_COLORS[t.event] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                      {t.event}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); drop(t); }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="px-6 pb-4 bg-zinc-900/40">
                      <pre className="text-xs font-mono text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-x-auto whitespace-pre">
                        {t.body || '(empty)'}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
