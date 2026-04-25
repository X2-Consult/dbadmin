'use client';
import { useState, useEffect } from 'react';
import { Trash2, Plus, X, ShieldCheck, ShieldAlert, User } from 'lucide-react';

interface DbUser {
  User: string; Host: string; plugin: string; password_expired: string; account_locked: string;
}

const FORM_FIELDS = [
  { key: 'user',     label: 'Username',                  type: 'text'     },
  { key: 'host',     label: 'Host (% = any)',             type: 'text'     },
  { key: 'password', label: 'Password',                   type: 'password' },
  { key: 'grants',   label: 'Privileges (e.g. ALL PRIVILEGES)', type: 'text' },
] as const;

export default function UserManager() {
  const [users, setUsers] = useState<DbUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ user: '', host: '%', password: '', grants: 'ALL PRIVILEGES' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function load() {
    setLoading(true);
    const r = await fetch('/api/users');
    const d = await r.json();
    if (d.error) setError(d.error);
    else setUsers(d.users || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function deleteUser(user: string, host: string) {
    if (!confirm(`Drop user '${user}'@'${host}'?`)) return;
    await fetch('/api/users', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, host }),
    });
    load();
  }

  async function createUser() {
    setSaving(true);
    setSaveError('');
    const r = await fetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: form.user, host: form.host, password: form.password, grants: form.grants ? [form.grants] : [] }),
    });
    const d = await r.json();
    if (d.error) { setSaveError(d.error); setSaving(false); return; }
    setSaving(false);
    setCreating(false);
    setForm({ user: '', host: '%', password: '', grants: 'ALL PRIVILEGES' });
    load();
  }

  return (
    <div className="overflow-auto p-6 bg-[#09090b] min-h-full">
      <div className="max-w-3xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Users</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Manage MariaDB user accounts</p>
          </div>
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> Create User
          </button>
        </div>

        {error && (
          <div className="p-3 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-zinc-600 text-sm py-8 justify-center">
            <div className="w-4 h-4 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['User', 'Host', 'Plugin', 'Pwd Expired', 'Locked', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={i} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                          <User className="w-3 h-3 text-zinc-400" />
                        </div>
                        <span className="font-mono text-zinc-200 font-medium">{u.User || <span className="italic text-zinc-500">anonymous</span>}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-400">{u.Host}</td>
                    <td className="px-4 py-3 text-zinc-500">{u.plugin}</td>
                    <td className="px-4 py-3">
                      {u.password_expired === 'Y'
                        ? <span className="flex items-center gap-1 text-amber-400"><ShieldAlert className="w-3 h-3" />Yes</span>
                        : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {u.account_locked === 'Y'
                        ? <span className="flex items-center gap-1 text-red-400"><ShieldAlert className="w-3 h-3" />Locked</span>
                        : <span className="flex items-center gap-1 text-green-500"><ShieldCheck className="w-3 h-3" />Active</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => deleteUser(u.User, u.Host)}
                        className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">Create User</h3>
              <button onClick={() => setCreating(false)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {FORM_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    value={form[f.key]}
                    onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors"
                  />
                </div>
              ))}
            </div>
            {saveError && (
              <div className="mx-5 mb-2 p-3 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg">{saveError}</div>
            )}
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-zinc-800">
              <button onClick={() => setCreating(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={createUser} disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 transition-colors font-medium">
                {saving ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
