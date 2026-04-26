'use client';
import { useState, useEffect } from 'react';
import { Trash2, ChevronDown, ChevronRight, RefreshCw, Workflow } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';
import { useToast } from '@/context/ToastContext';

interface Routine { name: string; type: string; language: string; }

interface Props { db: string; }

const TYPE_COLORS: Record<string, string> = {
  FUNCTION:  'bg-purple-500/10 text-purple-400 border-purple-500/20',
  PROCEDURE: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

export default function RoutinesView({ db }: Props) {
  const { connId } = useConn();
  const { toast } = useToast();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [loadingBody, setLoadingBody] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/databases/${encodeURIComponent(db)}/routines?conn=${connId}`);
      const d = await r.json();
      setRoutines(d.routines || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [db, connId]);

  async function toggleExpand(r: Routine) {
    const key = `${r.type}:${r.name}`;
    if (expanded === key) { setExpanded(null); return; }
    setExpanded(key);
    if (!bodies[key]) {
      setLoadingBody(key);
      const res = await fetch(
        `/api/databases/${encodeURIComponent(db)}/routines/${encodeURIComponent(r.name)}?conn=${connId}&type=${r.type}`
      );
      const d = await res.json();
      setBodies(b => ({ ...b, [key]: d.body || '' }));
      setLoadingBody(null);
    }
  }

  async function drop(r: Routine) {
    if (!confirm(`Drop ${r.type.toLowerCase()} "${r.name}"?`)) return;
    const res = await fetch(
      `/api/databases/${encodeURIComponent(db)}/routines/${encodeURIComponent(r.name)}?conn=${connId}`,
      { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: r.type }) }
    );
    const d = await res.json();
    if (d.error) toast(d.error, 'error');
    else { toast(`${r.type} "${r.name}" dropped`); load(); }
  }

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Routines</h2>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">{db} · {routines.length} {routines.length === 1 ? 'routine' : 'routines'}</p>
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
        ) : routines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 gap-3">
            <Workflow className="w-10 h-10 text-zinc-800" />
            <p className="text-sm text-zinc-600">No routines in {db}</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {routines.map(r => {
              const key = `${r.type}:${r.name}`;
              const isOpen = expanded === key;
              return (
                <div key={key}>
                  <div
                    onClick={() => toggleExpand(r)}
                    className="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800/30 cursor-pointer group transition-colors"
                  >
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
                    <span className="font-mono text-sm text-zinc-200 flex-1">{r.name}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${TYPE_COLORS[r.type] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                      {r.type}
                    </span>
                    <span className="text-[11px] text-zinc-600 uppercase">{r.language}</span>
                    <button
                      onClick={e => { e.stopPropagation(); drop(r); }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="px-6 pb-4 bg-zinc-900/40">
                      {loadingBody === key ? (
                        <div className="flex items-center gap-2 py-3 text-xs text-zinc-600">
                          <div className="w-3 h-3 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" /> Loading definition…
                        </div>
                      ) : (
                        <pre className="text-xs font-mono text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-x-auto whitespace-pre">
                          {bodies[key] || '(empty)'}
                        </pre>
                      )}
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
