'use client';
import { useState, useEffect } from 'react';
import { Key, Hash, Type, Plus, Trash2, ExternalLink, Loader2, Pencil } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';
import { useToast } from '@/context/ToastContext';
import AlterColumnModal from './AlterColumnModal';

interface Column {
  Field: string; Type: string; Null: string; Key: string; Default: unknown; Extra: string;
}
interface Index {
  Key_name: string; Column_name: string; Non_unique: number; Index_type: string;
}
interface ForeignKey {
  columnName: string; referencedTable: string; referencedColumn: string; constraintName: string;
}
interface Props { db: string; table: string; }

const KEY_BADGES: Record<string, { label: string; color: string }> = {
  PRI: { label: 'PRIMARY', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  UNI: { label: 'UNIQUE',  color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  MUL: { label: 'INDEX',   color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
};

export default function StructureView({ db, table }: Props) {
  const { connId } = useConn();
  const { toast } = useToast();
  const [columns, setColumns] = useState<Column[]>([]);
  const [indexes, setIndexes] = useState<Index[]>([]);
  const [foreignKeys, setForeignKeys] = useState<ForeignKey[]>([]);
  const [loading, setLoading] = useState(true);

  const [alterColumn, setAlterColumn] = useState<Column | null>(null);
  const [showAddIndex, setShowAddIndex] = useState(false);
  const [idxName, setIdxName] = useState('');
  const [idxCols, setIdxCols] = useState('');
  const [idxUnique, setIdxUnique] = useState(false);
  const [idxSaving, setIdxSaving] = useState(false);

  const baseUrl = `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}`;

  function loadStructure() {
    setLoading(true);
    fetch(`${baseUrl}/structure?conn=${connId}`)
      .then(r => r.json())
      .then(d => {
        setColumns(d.columns || []);
        setIndexes(d.indexes || []);
        setForeignKeys(d.foreignKeys || []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadStructure(); }, [db, table, connId]);

  async function createIndex() {
    const cols = idxCols.split(',').map(s => s.trim()).filter(Boolean);
    if (!idxName.trim() || cols.length === 0) return;
    setIdxSaving(true);
    try {
      const r = await fetch(`${baseUrl}/indexes?conn=${connId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: idxName.trim(), columns: cols, unique: idxUnique }),
      });
      const d = await r.json();
      if (d.error) { toast(d.error, 'error'); return; }
      toast('Index created');
      setShowAddIndex(false);
      setIdxName('');
      setIdxCols('');
      setIdxUnique(false);
      loadStructure();
    } finally { setIdxSaving(false); }
  }

  async function dropIndex(name: string) {
    if (!confirm(`Drop index "${name}"?`)) return;
    const r = await fetch(`${baseUrl}/indexes?conn=${connId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const d = await r.json();
    if (d.error) toast(d.error, 'error');
    else { toast('Index dropped'); loadStructure(); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-32 text-zinc-600 text-sm gap-2 bg-[#09090b]">
      <div className="w-4 h-4 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
      Loading…
    </div>
  );

  return (
    <div className="overflow-auto p-6 space-y-6 bg-[#09090b]">
      {alterColumn && (
        <AlterColumnModal
          db={db} table={table} column={alterColumn}
          onClose={() => setAlterColumn(null)}
          onAltered={() => { setAlterColumn(null); loadStructure(); }}
        />
      )}

      {/* Columns */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Columns</h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Field', 'Type', 'Null', 'Key', 'Default', 'Extra', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-zinc-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((col, i) => {
                const badge = KEY_BADGES[col.Key];
                return (
                  <tr key={col.Field} className={`border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors ${i === columns.length - 1 ? 'border-0' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {col.Key === 'PRI' && <Key className="w-3 h-3 text-amber-500 shrink-0" />}
                        {col.Key === 'MUL' && <Hash className="w-3 h-3 text-blue-400 shrink-0" />}
                        <span className="font-mono text-zinc-200 font-medium">{col.Field}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Type className="w-3 h-3 text-zinc-600 shrink-0" />
                        <span className="font-mono text-zinc-400">{col.Type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{col.Null}</td>
                    <td className="px-4 py-3">
                      {badge && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${badge.color}`}>
                          {badge.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-500">
                      {col.Default === null ? <span className="text-zinc-700 italic">NULL</span> : String(col.Default)}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{col.Extra}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => setAlterColumn(col)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-zinc-600 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                        title="Alter column"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Indexes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Indexes</h3>
          <button
            onClick={() => setShowAddIndex(v => !v)}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add index
          </button>
        </div>

        {showAddIndex && (
          <div className="mb-3 p-3 bg-zinc-800/40 border border-zinc-700 rounded-xl space-y-2">
            <div className="flex gap-2 flex-wrap items-end">
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Index name</label>
                <input
                  autoFocus
                  value={idxName}
                  onChange={e => setIdxName(e.target.value)}
                  placeholder="idx_name"
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500 w-36 transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Columns (comma-separated)</label>
                <input
                  value={idxCols}
                  onChange={e => setIdxCols(e.target.value)}
                  placeholder="col1, col2"
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500 w-48 transition-colors"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer pb-1.5">
                <input type="checkbox" checked={idxUnique} onChange={e => setIdxUnique(e.target.checked)} className="accent-blue-500" />
                UNIQUE
              </label>
              <button
                onClick={createIndex}
                disabled={idxSaving || !idxName.trim() || !idxCols.trim()}
                className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                {idxSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Create
              </button>
              <button
                onClick={() => setShowAddIndex(false)}
                className="text-xs text-zinc-500 hover:text-zinc-200 px-2 py-1.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {indexes.length > 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['Name', 'Column', 'Type', 'Unique', ''].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left font-medium text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {indexes.map((idx, i) => (
                  <tr key={i} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 transition-colors group">
                    <td className="px-4 py-3 font-mono text-zinc-300 font-medium">{idx.Key_name}</td>
                    <td className="px-4 py-3 text-zinc-400">{idx.Column_name}</td>
                    <td className="px-4 py-3 text-zinc-500">{idx.Index_type}</td>
                    <td className="px-4 py-3">
                      {idx.Non_unique === 0
                        ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-green-500/10 text-green-400 border-green-500/20">YES</span>
                        : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      {idx.Key_name !== 'PRIMARY' && (
                        <button
                          onClick={() => dropIndex(idx.Key_name)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-600 py-2">No indexes.</p>
        )}
      </div>

      {/* Foreign Keys */}
      {foreignKeys.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Foreign Keys</h3>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['Column', 'References', 'Constraint'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {foreignKeys.map((fk, i) => (
                  <tr key={i} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-zinc-300">{fk.columnName}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-mono text-zinc-400">
                        <ExternalLink className="w-3 h-3 text-zinc-600 shrink-0" />
                        {fk.referencedTable}
                        <span className="text-zinc-600">·</span>
                        {fk.referencedColumn}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 text-[11px]">{fk.constraintName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
