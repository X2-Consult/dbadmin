'use client';
import { useState, useEffect } from 'react';
import { Eye, Plus, Trash2, RefreshCw, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';
import { useToast } from '@/context/ToastContext';
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface Props { db: string }

export default function ViewsView({ db }: Props) {
  const { connId } = useConn();
  const { toast } = useToast();
  const [views, setViews] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQuery, setNewQuery] = useState('SELECT 1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/databases/${encodeURIComponent(db)}/views?conn=${connId}`);
    const d = await r.json();
    setViews(d.views || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [db, connId]);

  async function toggleView(name: string) {
    if (expanded === name) { setExpanded(null); return; }
    setExpanded(name);
    if (!bodies[name]) {
      const r = await fetch(`/api/databases/${encodeURIComponent(db)}/views/${encodeURIComponent(name)}?conn=${connId}`);
      const d = await r.json();
      setBodies(prev => ({ ...prev, [name]: d.body || '' }));
    }
  }

  async function dropView(name: string) {
    if (!confirm(`Drop view "${name}"?`)) return;
    const r = await fetch(`/api/databases/${encodeURIComponent(db)}/views/${encodeURIComponent(name)}?conn=${connId}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.error) { toast(d.error, 'error'); return; }
    toast(`View "${name}" dropped`);
    setViews(v => v.filter(x => x !== name));
    if (expanded === name) setExpanded(null);
  }

  async function saveView() {
    if (!newName.trim() || !newQuery.trim()) return;
    setSaving(true);
    setError('');
    const r = await fetch(`/api/databases/${encodeURIComponent(db)}/views?conn=${connId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), query: newQuery.trim() }),
    });
    const d = await r.json();
    setSaving(false);
    if (d.error) { setError(d.error); return; }
    toast(`View "${newName.trim()}" created`);
    setShowCreate(false);
    setNewName('');
    setNewQuery('SELECT 1');
    setBodies(prev => ({ ...prev, [newName.trim()]: newQuery.trim() }));
    await load();
  }

  async function updateView(name: string) {
    const query = bodies[name];
    if (!query) return;
    setSaving(true);
    const r = await fetch(`/api/databases/${encodeURIComponent(db)}/views?conn=${connId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, query }),
    });
    const d = await r.json();
    setSaving(false);
    if (d.error) { toast(d.error, 'error'); return; }
    toast(`View "${name}" updated`);
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5 text-purple-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Views</h2>
          <span className="text-xs text-zinc-600 font-mono">{db}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowCreate(s => !s)}
            className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New view
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-4 border border-purple-500/30 rounded-xl bg-purple-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Create view</h3>
            <button onClick={() => setShowCreate(false)} className="text-zinc-600 hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="view_name"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
          />
          <div className="h-40 border border-zinc-700 rounded-lg overflow-hidden">
            <MonacoEditor
              language="sql"
              value={newQuery}
              onChange={v => setNewQuery(v || '')}
              theme="vs-dark"
              options={{ minimap: { enabled: false }, fontSize: 12, lineNumbers: 'off', scrollBeyondLastLine: false, padding: { top: 8 } }}
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800 rounded-lg transition-colors">Cancel</button>
            <button onClick={saveView} disabled={saving || !newName.trim()}
              className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-lg transition-colors font-medium">
              {saving ? 'Creating…' : 'Create view'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-600 py-8">
          <div className="w-3 h-3 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />Loading…
        </div>
      ) : views.length === 0 ? (
        <div className="text-xs text-zinc-600 py-8 text-center">No views in {db}</div>
      ) : (
        <div className="space-y-1">
          {views.map(name => (
            <div key={name} className="border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/50 transition-colors group">
                <button onClick={() => toggleView(name)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                  {expanded === name
                    ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
                  <Eye className="w-3.5 h-3.5 text-purple-400/70 shrink-0" />
                  <span className="text-sm text-zinc-200 font-mono italic truncate">{name}</span>
                </button>
                <button
                  onClick={() => dropView(name)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {expanded === name && (
                <div className="border-t border-zinc-800">
                  <div className="h-52">
                    <MonacoEditor
                      language="sql"
                      value={bodies[name] ?? ''}
                      onChange={v => setBodies(prev => ({ ...prev, [name]: v || '' }))}
                      theme="vs-dark"
                      options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, padding: { top: 8 } }}
                    />
                  </div>
                  <div className="flex justify-end gap-2 px-3 py-2 bg-zinc-900/50 border-t border-zinc-800">
                    <button onClick={() => updateView(name)} disabled={saving}
                      className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Save changes
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
