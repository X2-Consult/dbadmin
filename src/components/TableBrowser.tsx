'use client';
import { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2, Plus, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import RowEditor from './RowEditor';

interface Props { db: string; table: string; }

export default function TableBrowser({ db, table }: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [inserting, setInserting] = useState(false);
  const [structure, setStructure] = useState<Array<{ Field: string; Type: string; Key: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(
        `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}?page=${page}&pageSize=${pageSize}`
      );
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setRows(d.rows);
      setTotal(d.total);
      if (d.rows.length > 0) setColumns(Object.keys(d.rows[0]));
    } finally { setLoading(false); }
  }, [db, table, page, pageSize]);

  useEffect(() => { setPage(1); }, [db, table]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch(`/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/structure`)
      .then(r => r.json())
      .then(d => setStructure(d.columns || []));
  }, [db, table]);

  const pkColumns = structure.filter(c => c.Key === 'PRI').map(c => c.Field);
  function pkOf(row: Record<string, unknown>) {
    if (pkColumns.length > 0) return Object.fromEntries(pkColumns.map(k => [k, row[k]]));
    return Object.fromEntries(Object.entries(row).slice(0, 1));
  }

  async function deleteRow(row: Record<string, unknown>) {
    if (!confirm('Delete this row?')) return;
    await fetch(
      `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}`,
      { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pkOf(row)) }
    );
    load();
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 tabular-nums">
            {total.toLocaleString()} rows
            {totalPages > 1 && <span className="text-zinc-600"> · page {page}/{totalPages}</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setInserting(true)}
            className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium">
            <Plus className="w-3.5 h-3.5" /> Insert Row
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-3 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg text-sm">{error}</div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-sm gap-2">
            <div className="w-4 h-4 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
            Loading…
          </div>
        ) : (
          <table className="min-w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-zinc-900 border-b border-zinc-800">
                <th className="w-12 px-3 py-2.5" />
                {columns.map(c => (
                  <th key={c} className="px-3 py-2.5 text-left font-medium text-zinc-400 whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-zinc-800/60 hover:bg-zinc-800/40 group transition-colors">
                  <td className="px-3 py-2">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditRow(row)}
                        className="p-1 rounded text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => deleteRow(row)}
                        className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                  {columns.map(c => (
                    <td key={c} className="px-3 py-2 max-w-xs">
                      {row[c] === null
                        ? <span className="text-zinc-600 italic font-normal">NULL</span>
                        : <span className="text-zinc-200 truncate block">{String(row[c])}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-800 bg-zinc-900/50 shrink-0">
          <span className="text-xs text-zinc-500 tabular-nums">
            {((page - 1) * pageSize + 1).toLocaleString()}–{Math.min(page * pageSize, total).toLocaleString()} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-zinc-400 tabular-nums px-2">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {(editRow || inserting) && (
        <RowEditor
          db={db} table={table} row={editRow} structure={structure} pkColumns={pkColumns}
          onClose={() => { setEditRow(null); setInserting(false); }}
          onSaved={() => { setEditRow(null); setInserting(false); load(); }}
        />
      )}
    </div>
  );
}
