'use client';
import { useState } from 'react';
import { X, Key } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';

interface Column { Field: string; Type: string; Key: string; }
interface Props {
  db: string; table: string;
  row: Record<string, unknown> | null;
  structure: Column[];
  pkColumns: string[];
  onClose: () => void;
  onSaved: () => void;
}

export default function RowEditor({ db, table, row, structure, pkColumns, onClose, onSaved }: Props) {
  const { connId } = useConn();
  const isEdit = !!row;
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!row) return {};
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null ? '' : String(v)]));
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fields = structure.length > 0
    ? structure
    : Object.keys(row || {}).map(Field => ({ Field, Type: 'text', Key: '' }));

  async function save() {
    setSaving(true);
    setError('');
    try {
      const url = `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}?conn=${connId}`;
      if (isEdit) {
        const pk = Object.fromEntries(pkColumns.map(k => [k, row![k]]));
        const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, __pk: pk }) });
        const d = await r.json();
        if (d.error) { setError(d.error); return; }
      } else {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
        const d = await r.json();
        if (d.error) { setError(d.error); return; }
      }
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-white">{isEdit ? 'Edit Row' : 'Insert Row'}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{db}.{table}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {fields.map(col => (
            <div key={col.Field}>
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-1.5">
                {col.Key === 'PRI' && <Key className="w-3 h-3 text-amber-500" />}
                <span className="text-zinc-300">{col.Field}</span>
                <span className="text-zinc-600 font-normal">{col.Type}</span>
              </label>
              <input
                type="text"
                value={values[col.Field] ?? ''}
                onChange={e => setValues(v => ({ ...v, [col.Field]: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors font-mono"
                placeholder="NULL"
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="mx-5 mb-2 p-3 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg">{error}</div>
        )}

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-zinc-800">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 transition-colors font-medium">
            {saving ? 'Saving…' : isEdit ? 'Update Row' : 'Insert Row'}
          </button>
        </div>
      </div>
    </div>
  );
}
