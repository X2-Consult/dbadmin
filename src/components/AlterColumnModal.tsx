'use client';
import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';
import { useToast } from '@/context/ToastContext';

const MYSQL_TYPES = [
  'INT','BIGINT','TINYINT','SMALLINT','FLOAT','DOUBLE','DECIMAL(10,2)',
  'VARCHAR(255)','TEXT','MEDIUMTEXT','LONGTEXT','CHAR(36)',
  'DATE','DATETIME','TIMESTAMP','BOOLEAN','JSON','BLOB',
];
const PG_TYPES = [
  'integer','bigint','smallint','serial','bigserial','float8','numeric(10,2)',
  'varchar(255)','text','char(36)','uuid',
  'date','timestamp','timestamptz','boolean','jsonb','bytea',
];

interface Column {
  Field: string; Type: string; Null: string; Key: string; Default: unknown; Extra: string;
}
interface Props {
  db: string; table: string; column: Column;
  onClose: () => void; onAltered: () => void;
}

export default function AlterColumnModal({ db, table, column, onClose, onAltered }: Props) {
  const { connId } = useConn();
  const { toast } = useToast();
  const [isPg, setIsPg] = useState(false);
  const [newName, setNewName] = useState(column.Field);
  const [type, setType] = useState(column.Type);
  const [notNull, setNotNull] = useState(column.Null === 'NO');
  const [defaultVal, setDefaultVal] = useState(column.Default !== null ? String(column.Default) : '');
  const [autoIncrement, setAutoIncrement] = useState(column.Extra?.includes('auto_increment') ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/connections').then(r => r.json()).then(d => {
      const c = (d.connections || []).find((c: { id: string }) => c.id === connId);
      setIsPg(c?.type === 'postgres');
    });
  }, [connId]);

  const typeList = isPg ? PG_TYPES : MYSQL_TYPES;

  async function save() {
    setSaving(true);
    setError('');
    try {
      const r = await fetch(
        `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/columns/${encodeURIComponent(column.Field)}?conn=${connId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newName, type, notNull, defaultVal, autoIncrement }),
        }
      );
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      toast(`Column "${column.Field}" altered`);
      onAltered();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-white">Alter Column</h2>
            <p className="text-xs text-zinc-500 mt-0.5 font-mono">{db}.{table}.{column.Field}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Column name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Type</label>
              <div className="flex gap-2">
                <select
                  value={typeList.includes(type) ? type : type}
                  onChange={e => setType(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 transition-colors"
                >
                  {typeList.map(t => <option key={t} value={t}>{t}</option>)}
                  {!typeList.includes(type) && <option value={type}>{type}</option>}
                </select>
                <input
                  value={type}
                  onChange={e => setType(e.target.value)}
                  className="w-36 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="custom type"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Default value</label>
              <input
                value={defaultVal}
                onChange={e => setDefaultVal(e.target.value)}
                placeholder="NULL"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={notNull} onChange={e => setNotNull(e.target.checked)} className="accent-blue-500" />
                NOT NULL
              </label>
              {!isPg && (
                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={autoIncrement} onChange={e => setAutoIncrement(e.target.checked)} className="accent-green-500" />
                  AUTO_INCREMENT
                </label>
              )}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 font-mono">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !newName.trim() || !type.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Alter Column
          </button>
        </div>
      </div>
    </div>
  );
}
