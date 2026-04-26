'use client';
import { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2, Plus, ChevronLeft, ChevronRight, RefreshCw, Download, Filter, X, ChevronUp, ChevronDown } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import RowEditor from './RowEditor';
import { useConn } from '@/context/ConnectionContext';

interface Props { db: string; table: string; readonly?: boolean; }

export default function TableBrowser({ db, table, readonly }: Props) {
  const { connId } = useConn();
  const { toast } = useToast();
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
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const buildUrl = useCallback((p = page) => {
    const sp = new URLSearchParams({ page: String(p), pageSize: String(pageSize), conn: connId });
    Object.entries(filters).forEach(([k, v]) => { if (v.trim()) sp.set(`filter[${k}]`, v); });
    if (sortCol) { sp.set('sort', sortCol); sp.set('dir', sortDir); }
    return `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}?${sp}`;
  }, [db, table, page, pageSize, connId, filters, sortCol, sortDir]);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(buildUrl(p));
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setRows(d.rows);
      setTotal(d.total);
      if (d.rows.length > 0) setColumns(Object.keys(d.rows[0]));
    } finally { setLoading(false); }
  }, [buildUrl, page]);

  useEffect(() => { setPage(1); setFilters({}); setSortCol(null); setSortDir('asc'); setSelected(new Set()); }, [db, table, connId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch(`/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/structure?conn=${connId}`)
      .then(r => r.json())
      .then(d => { setStructure(d.columns || []); if (d.columns) setColumns(d.columns.map((c: { Field: string }) => c.Field)); });
  }, [db, table, connId]);

  const pkColumns = structure.filter(c => c.Key === 'PRI').map(c => c.Field);
  function pkOf(row: Record<string, unknown>) {
    if (pkColumns.length > 0) return Object.fromEntries(pkColumns.map(k => [k, row[k]]));
    return Object.fromEntries(Object.entries(row).slice(0, 1));
  }

  async function deleteRow(row: Record<string, unknown>) {
    if (!confirm('Delete this row?')) return;
    const r = await fetch(
      `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}?conn=${connId}`,
      { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pkOf(row)) }
    );
    const d = await r.json();
    if (d.error) toast(d.error, 'error');
    else { toast('Row deleted'); load(); }
  }

  function exportCSV() {
    window.location.href = `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/export?conn=${connId}&format=csv`;
  }

  function exportJSON() {
    window.location.href = `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}/export?conn=${connId}&format=json`;
  }

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(1);
  }

  function applyFilters() { setPage(1); load(1); }
  function clearFilters() { setFilters({}); setPage(1); }

  function toggleRow(i: number) {
    setSelected(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }
  function toggleAll() {
    setSelected(s => s.size === rows.length ? new Set() : new Set(rows.map((_, i) => i)));
  }

  async function deleteSelected() {
    if (!confirm(`Delete ${selected.size} selected row${selected.size > 1 ? 's' : ''}?`)) return;
    for (const i of Array.from(selected)) {
      const r = await fetch(
        `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}?conn=${connId}`,
        { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pkOf(rows[i])) }
      );
      const d = await r.json();
      if (d.error) { toast(d.error, 'error'); break; }
    }
    toast(`${selected.size} row${selected.size > 1 ? 's' : ''} deleted`);
    setSelected(new Set());
    load();
  }

  function exportSelected(format: 'csv' | 'json') {
    const sel = Array.from(selected).map(i => rows[i]);
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(sel, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `${table}-selected.json`; a.click();
    } else {
      if (!sel.length) return;
      const cols = Object.keys(sel[0]);
      const esc = (v: unknown) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s; };
      const csv = [cols.map(esc).join(','), ...sel.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `${table}-selected.csv`; a.click();
    }
  }

  const activeFilterCount = Object.values(filters).filter(v => v.trim()).length;
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
          {activeFilterCount > 0 && (
            <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded-full">
              {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Filter className="w-3.5 h-3.5" /> Filter
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg transition-colors">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={exportJSON}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg transition-colors">
            <Download className="w-3.5 h-3.5" /> JSON
          </button>
          <button onClick={() => load()} disabled={loading}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {!readonly && (
            <button onClick={() => setInserting(true)}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium">
              <Plus className="w-3.5 h-3.5" /> Insert Row
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && columns.length > 0 && (
        <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/30 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {columns.slice(0, 8).map(col => (
              <div key={col} className="flex items-center gap-1">
                <label className="text-[10px] text-zinc-500 whitespace-nowrap">{col}</label>
                <input
                  value={filters[col] || ''}
                  onChange={e => setFilters(f => ({ ...f, [col]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && applyFilters()}
                  placeholder="filter…"
                  className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            ))}
            <button onClick={applyFilters}
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-lg transition-colors font-medium">
              Apply
            </button>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 px-2 py-1 rounded-lg transition-colors">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-blue-500/5 border-b border-blue-500/20 shrink-0">
          <span className="text-xs text-blue-400 font-medium">{selected.size} row{selected.size > 1 ? 's' : ''} selected</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => exportSelected('csv')} className="text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded-lg transition-colors">Export CSV</button>
            <button onClick={() => exportSelected('json')} className="text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded-lg transition-colors">Export JSON</button>
            {!readonly && <button onClick={deleteSelected} className="text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-2.5 py-1 rounded-lg transition-colors font-medium">Delete selected</button>}
            <button onClick={() => setSelected(new Set())} className="text-xs text-zinc-500 hover:text-zinc-200 px-2 py-1 rounded-lg transition-colors">Clear</button>
          </div>
        </div>
      )}

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
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll}
                    className="accent-blue-500 cursor-pointer"
                  />
                </th>
                {!readonly && <th className="w-12 px-3 py-2.5" />}
                {columns.map(c => (
                  <th key={c} className="px-3 py-2.5 text-left whitespace-nowrap">
                    <button
                      onClick={() => toggleSort(c)}
                      className="flex items-center gap-1 font-medium text-zinc-400 hover:text-zinc-100 transition-colors group"
                    >
                      {c}
                      <span className="text-zinc-700 group-hover:text-zinc-500">
                        {sortCol === c
                          ? sortDir === 'asc'
                            ? <ChevronUp className="w-3 h-3 text-blue-400" />
                            : <ChevronDown className="w-3 h-3 text-blue-400" />
                          : <ChevronUp className="w-3 h-3 opacity-0 group-hover:opacity-50" />}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={`border-b border-zinc-800/60 group transition-colors ${selected.has(i) ? 'bg-blue-500/5' : 'hover:bg-zinc-800/40'}`}>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggleRow(i)} className="accent-blue-500 cursor-pointer" />
                  </td>
                  {!readonly && (
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
                  )}
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

      {(editRow || inserting) && !readonly && (
        <RowEditor
          db={db} table={table} row={editRow} structure={structure} pkColumns={pkColumns}
          onClose={() => { setEditRow(null); setInserting(false); }}
          onSaved={() => { setEditRow(null); setInserting(false); load(); }}
        />
      )}
    </div>
  );
}
