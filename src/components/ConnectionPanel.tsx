'use client';
import { useState, useEffect } from 'react';
import { X, Plus, Trash2, CheckCircle2, AlertCircle, Loader2, Database, Server } from 'lucide-react';
import type { DbType } from '@/lib/connections';
import { useConn } from '@/context/ConnectionContext';

interface ConnInfo { id: string; name: string; type: DbType; host: string; port: number; user: string; database?: string; }

const TYPE_DEFAULTS: Record<DbType, { port: number; label: string; color: string }> = {
  mariadb:  { port: 3306,  label: 'MariaDB',    color: 'text-amber-400' },
  mysql:    { port: 3306,  label: 'MySQL',       color: 'text-orange-400' },
  postgres: { port: 5432,  label: 'PostgreSQL',  color: 'text-sky-400' },
};

const EMPTY_FORM = { name: '', type: 'mariadb' as DbType, host: '127.0.0.1', port: 3306, user: '', password: '', database: '', ssl: false };

interface Props { onClose: () => void; }

export default function ConnectionPanel({ onClose }: Props) {
  const { connId, setConnId } = useConn();
  const [connections, setConnections] = useState<ConnInfo[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveError, setSaveError] = useState('');

  async function loadConnections() {
    const r = await fetch('/api/connections');
    const d = await r.json();
    setConnections(d.connections || []);
  }

  useEffect(() => { loadConnections(); }, []);

  function onTypeChange(type: DbType) {
    setForm(f => ({ ...f, type, port: TYPE_DEFAULTS[type].port }));
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    setSaveError('');
    try {
      // POST creates the pool, test it
      const r = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, _testOnly: true }),
      });
      const d = await r.json();
      if (d.error) setTestResult({ ok: false, message: d.error });
      else setTestResult({ ok: true, message: d.connection ? 'Connected successfully' : 'Connection OK' });
      // If test succeeded, remove from saved (we just want to test, not save yet)
      if (d.connection) {
        await fetch(`/api/connections/${d.connection.id}`, { method: 'DELETE' });
      }
    } finally { setTesting(false); }
  }

  async function saveConn() {
    setSaving(true);
    setSaveError('');
    setTestResult(null);
    const r = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const d = await r.json();
    if (d.error) { setSaveError(d.error); setSaving(false); return; }
    await loadConnections();
    setAdding(false);
    setForm(EMPTY_FORM);
    setSaving(false);
  }

  async function deleteConn(id: string) {
    if (!confirm('Remove this connection?')) return;
    await fetch(`/api/connections/${id}`, { method: 'DELETE' });
    if (connId === id) setConnId('default');
    await loadConnections();
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-white">Connections</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Manage database connections</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {/* Connection list */}
          {connections.map(c => {
            const meta = TYPE_DEFAULTS[c.type];
            const isActive = c.id === connId;
            return (
              <div key={c.id}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  isActive ? 'border-blue-500/40 bg-blue-500/5' : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
                }`}
                onClick={() => { setConnId(c.id); onClose(); }}
              >
                <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                  <Server className={`w-4 h-4 ${meta.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-100 truncate">{c.name}</span>
                    {isActive && <span className="text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded-full shrink-0">Active</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[11px] font-medium ${meta.color}`}>{meta.label}</span>
                    <span className="text-zinc-700">·</span>
                    <span className="text-xs text-zinc-500 truncate font-mono">{c.user}@{c.host}:{c.port}{c.database ? `/${c.database}` : ''}</span>
                  </div>
                </div>
                {c.id !== 'default' && (
                  <button
                    onClick={e => { e.stopPropagation(); deleteConn(c.id); }}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add connection form */}
          {adding ? (
            <div className="border border-zinc-700 rounded-xl p-4 space-y-3 bg-zinc-800/30">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">New Connection</h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Display name</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors"
                    placeholder="My Database" />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Type</label>
                  <div className="flex gap-2">
                    {(Object.keys(TYPE_DEFAULTS) as DbType[]).map(t => (
                      <button key={t} onClick={() => onTypeChange(t)}
                        className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
                          form.type === t
                            ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                            : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                        }`}>
                        <span className={TYPE_DEFAULTS[t].color}>{TYPE_DEFAULTS[t].label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Host</label>
                  <input value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors"
                    placeholder="127.0.0.1" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Port</label>
                  <input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Username</label>
                  <input value={form.user} onChange={e => setForm(f => ({ ...f, user: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors"
                    placeholder="root" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Password</label>
                  <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors" />
                </div>
                {form.type === 'postgres' && (
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Database <span className="text-zinc-600">(required for PostgreSQL)</span></label>
                    <input value={form.database} onChange={e => setForm(f => ({ ...f, database: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors"
                      placeholder="postgres" />
                  </div>
                )}
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="ssl" checked={form.ssl} onChange={e => setForm(f => ({ ...f, ssl: e.target.checked }))}
                    className="w-3.5 h-3.5 accent-blue-500" />
                  <label htmlFor="ssl" className="text-xs text-zinc-400">Use SSL (skip certificate verification)</label>
                </div>
              </div>

              {testResult && (
                <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
                  testResult.ok
                    ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}>
                  {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                  {testResult.message}
                </div>
              )}
              {saveError && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg text-xs bg-red-500/10 border border-red-500/20 text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />{saveError}
                </div>
              )}

              <div className="flex justify-between items-center pt-1">
                <button onClick={testConnection} disabled={testing || !form.host || !form.user}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
                  {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                  Test connection
                </button>
                <div className="flex gap-2">
                  <button onClick={() => { setAdding(false); setTestResult(null); setSaveError(''); }}
                    className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveConn} disabled={saving || !form.name || !form.host || !form.user}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-40 transition-colors font-medium">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Save &amp; Connect
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-zinc-700 rounded-xl text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors">
              <Plus className="w-4 h-4" /> Add connection
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
