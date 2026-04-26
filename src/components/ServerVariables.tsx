'use client';
import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Search, Settings2 } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';

interface Variable { name: string; value: string; category: string; description: string; }

export default function ServerVariables() {
  const { connId } = useConn();
  const [variables, setVariables] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/server/variables?conn=${connId}`);
      const d = await r.json();
      setVariables(d.variables || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [connId]);

  const categories = useMemo(() => {
    const s = new Set(variables.map(v => v.category).filter(Boolean));
    return Array.from(s).sort();
  }, [variables]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return variables.filter(v =>
      (!category || v.category === category) &&
      (!q || v.name.toLowerCase().includes(q) || v.value.toLowerCase().includes(q))
    );
  }, [variables, search, category]);

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Server Variables</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{filtered.length.toLocaleString()} of {variables.length.toLocaleString()} variables</p>
        </div>
        <button onClick={load} disabled={loading} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex gap-2 px-6 py-3 border-b border-zinc-800 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search variables…"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        {categories.length > 0 && (
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-sm gap-2">
            <div className="w-4 h-4 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 gap-3">
            <Settings2 className="w-10 h-10 text-zinc-800" />
            <p className="text-sm text-zinc-600">No variables match</p>
          </div>
        ) : (
          <table className="min-w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800">
              <tr>
                {['Variable', 'Value', 'Category', 'Description'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium text-zinc-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.name} className="border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-2 font-mono text-zinc-300 whitespace-nowrap">{v.name}</td>
                  <td className="px-4 py-2 font-mono text-blue-400 max-w-xs truncate">{v.value}</td>
                  <td className="px-4 py-2 text-zinc-600 whitespace-nowrap">{v.category}</td>
                  <td className="px-4 py-2 text-zinc-500 max-w-sm truncate">{v.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
