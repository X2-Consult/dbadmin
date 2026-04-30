'use client';
import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Pencil, CheckCircle2, AlertCircle, Loader2, Database, Server, Lock } from 'lucide-react';
import type { DbType, SslMode } from '@/lib/connections';
import { useConn } from '@/context/ConnectionContext';
import { useToast } from '@/context/ToastContext';

interface ConnInfo { id: string; name: string; type: DbType; host: string; port: number; user: string; database?: string; readonly?: boolean; sslMode?: SslMode; sshHost?: string; sshPort?: number; sshUser?: string; }

const TYPE_DEFAULTS: Record<DbType, { port: number; label: string; color: string }> = {
  mariadb:  { port: 3306,  label: 'MariaDB',    color: 'text-amber-400' },
  mysql:    { port: 3306,  label: 'MySQL',       color: 'text-orange-400' },
  postgres: { port: 5432,  label: 'PostgreSQL',  color: 'text-sky-400' },
};

const EMPTY_FORM = {
  name: '', type: 'mariadb' as DbType,
  host: '127.0.0.1', port: 3306,
  user: '', password: '', noPassword: false, database: '',
  sslMode: 'disable' as SslMode,
  readonly: false,
  sshHost: '', sshPort: 22, sshUser: '', sshPassword: '', sshKey: '',
};

interface Props { onClose: () => void; }

export default function ConnectionPanel({ onClose }: Props) {
  const { connId, setConnId } = useConn();
  const { toast } = useToast();
  const [connections, setConnections] = useState<ConnInfo[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
      const r = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, _testOnly: true }),
      });
      const d = await r.json();
      if (d.error) setTestResult({ ok: false, message: d.error });
      else {
        setTestResult({ ok: true, message: 'Connected successfully' });
        if (d.connection) await fetch(`/api/connections/${d.connection.id}`, { method: 'DELETE' });
      }
    } finally { setTesting(false); }
  }

  async function saveConn() {
    setSaving(true);
    setSaveError('');
    setTestResult(null);
    const { noPassword, ...formData } = form;
    const body = editingId ? { ...formData, id: editingId, noPassword } : { ...formData, noPassword };
    const r = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.error) { setSaveError(d.error); setSaving(false); return; }
    await loadConnections();
    setAdding(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaving(false);
    toast('Connection saved');
  }

  function editConn(c: ConnInfo) {
    setEditingId(c.id);
    setForm({
      name: c.name, type: c.type,
      host: c.host, port: c.port,
      user: c.user, password: '', noPassword: false,
      database: c.database ?? '',
      sslMode: c.sslMode ?? 'disable',
      readonly: c.readonly ?? false,
      sshHost: c.sshHost ?? '', sshPort: c.sshPort ?? 22,
      sshUser: c.sshUser ?? '', sshPassword: '', sshKey: '',
    });
    setAdding(true);
    setTestResult(null);
    setSaveError('');
  }

  async function deleteConn(id: string) {
    if (!confirm('Remove this connection?')) return;
    await fetch(`/api/connections/${id}`, { method: 'DELETE' });
    if (connId === id) setConnId('default');
    await loadConnections();
    toast('Connection removed');
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
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
                    {c.readonly && <Lock className="w-3 h-3 text-amber-400 shrink-0" aria-label="Read-only" />}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[11px] font-medium ${meta.color}`}>{meta.label}</span>
                    <span className="text-zinc-700">·</span>
                    <span className="text-xs text-zinc-500 truncate font-mono">{c.user}@{c.host}{c.database ? `/${c.database}` : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); editConn(c); }}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {c.id !== 'default' && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteConn(c.id); }}
                      className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {adding ? (
            <div className="border border-zinc-700 rounded-xl p-4 space-y-3 bg-zinc-800/30">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{editingId ? 'Edit Connection' : 'New Connection'}</h3>

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
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-zinc-400">Password</label>
                    <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer select-none">
                      <input type="checkbox" checked={form.noPassword}
                        onChange={e => setForm(f => ({ ...f, noPassword: e.target.checked, password: '' }))}
                        className="w-3 h-3 accent-zinc-400" />
                      No password
                    </label>
                  </div>
                  <input type="password" value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    disabled={form.noPassword}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    placeholder={form.noPassword ? 'No password' : editingId ? 'Leave blank to keep current' : ''} />
                </div>
                {form.type === 'postgres' && (
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Database <span className="text-zinc-600">(required for PostgreSQL)</span></label>
                    <input value={form.database} onChange={e => setForm(f => ({ ...f, database: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors"
                      placeholder="postgres" />
                  </div>
                )}

                <div className="col-span-2">
                  <label className="block text-xs font-medium text-zinc-400 mb-1">SSL mode</label>
                  <div className="flex gap-2">
                    {(['disable', 'require', 'verify'] as SslMode[]).map(mode => (
                      <button key={mode} onClick={() => setForm(f => ({ ...f, sslMode: mode }))}
                        className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${
                          form.sslMode === mode
                            ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                            : 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                        }`}>
                        {mode}
                      </button>
                    ))}
                  </div>
                  {form.sslMode === 'require' && (
                    <p className="text-[10px] text-zinc-600 mt-1">Encrypts traffic, skips certificate verification (self-signed certs OK).</p>
                  )}
                  {form.sslMode === 'verify' && (
                    <p className="text-[10px] text-zinc-600 mt-1">Encrypts traffic and verifies the server certificate against trusted CAs.</p>
                  )}
                </div>

                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="readonly" checked={form.readonly} onChange={e => setForm(f => ({ ...f, readonly: e.target.checked }))}
                    className="w-3.5 h-3.5 accent-amber-500" />
                  <label htmlFor="readonly" className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-amber-400" /> Read-only — disable all INSERT / UPDATE / DELETE / DDL
                  </label>
                </div>

                <div className="col-span-2 border-t border-zinc-800 pt-3">
                  <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">SSH Tunnel <span className="text-zinc-700 font-normal normal-case">(optional)</span></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">SSH Host</label>
                      <input value={form.sshHost} onChange={e => setForm(f => ({ ...f, sshHost: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                        placeholder="bastion.example.com" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">SSH Port</label>
                      <input type="number" value={form.sshPort} onChange={e => setForm(f => ({ ...f, sshPort: parseInt(e.target.value) || 22 }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">SSH User</label>
                      <input value={form.sshUser} onChange={e => setForm(f => ({ ...f, sshUser: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                        placeholder="ubuntu" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">SSH Password</label>
                      <input type="password" value={form.sshPassword} onChange={e => setForm(f => ({ ...f, sshPassword: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                        placeholder="or use private key below" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-zinc-400 mb-1">SSH Private Key <span className="text-zinc-600">(PEM/OpenSSH)</span></label>
                      <textarea value={form.sshKey} onChange={e => setForm(f => ({ ...f, sshKey: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                        rows={3} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
                    </div>
                  </div>
                </div>
              </div>

              {testResult && (
                <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
                  testResult.ok ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
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
                  <button onClick={() => { setAdding(false); setEditingId(null); setForm(EMPTY_FORM); setTestResult(null); setSaveError(''); }}
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
