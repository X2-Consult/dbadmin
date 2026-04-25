'use client';
import { useState, useEffect } from 'react';
import { Key, Hash, Type } from 'lucide-react';

interface Column {
  Field: string; Type: string; Null: string; Key: string; Default: unknown; Extra: string;
}
interface Index {
  Key_name: string; Column_name: string; Non_unique: number; Index_type: string;
}
interface Props { db: string; table: string; }

const KEY_BADGES: Record<string, { label: string; color: string }> = {
  PRI: { label: 'PRIMARY', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  UNI: { label: 'UNIQUE',  color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  MUL: { label: 'INDEX',   color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
};

export default function StructureView({ db, table }: Props) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [indexes, setIndexes] = useState<Index[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/structure`)
      .then(r => r.json())
      .then(d => { setColumns(d.columns || []); setIndexes(d.indexes || []); })
      .finally(() => setLoading(false));
  }, [db, table]);

  if (loading) return (
    <div className="flex items-center justify-center h-32 text-zinc-600 text-sm gap-2 bg-[#09090b]">
      <div className="w-4 h-4 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
      Loading…
    </div>
  );

  return (
    <div className="overflow-auto p-6 space-y-6 bg-[#09090b]">
      <div>
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Columns</h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'].map(h => (
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {indexes.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Indexes</h3>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['Name', 'Column', 'Type', 'Unique'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {indexes.map((idx, i) => (
                  <tr key={i} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-zinc-300 font-medium">{idx.Key_name}</td>
                    <td className="px-4 py-3 text-zinc-400">{idx.Column_name}</td>
                    <td className="px-4 py-3 text-zinc-500">{idx.Index_type}</td>
                    <td className="px-4 py-3">
                      {idx.Non_unique === 0
                        ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-green-500/10 text-green-400 border-green-500/20">YES</span>
                        : <span className="text-zinc-600">—</span>}
                    </td>
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
