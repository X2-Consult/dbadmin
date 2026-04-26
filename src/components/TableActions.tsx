'use client';
import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Pencil, Trash2, Eraser, Loader2, ShieldAlert, AlertTriangle, Wrench, Copy } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';
import { useToast } from '@/context/ToastContext';

interface Props {
  db: string;
  table: string;
  onRenamed: (newName: string) => void;
  onDropped: () => void;
  onTruncated: () => void;
}

type Modal = 'rename' | 'truncate-confirm' | 'drop-1' | 'drop-2' | 'maintenance' | 'copy' | null;

export default function TableActions({ db, table, onRenamed, onDropped, onTruncated }: Props) {
  const { connId } = useConn();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [maintOp, setMaintOp] = useState<string>('');
  const [maintResult, setMaintResult] = useState<Array<Record<string, string>>>([]);
  const [newName, setNewName] = useState('');
  const [copyName, setCopyName] = useState('');
  const [copyData, setCopyData] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const base = `/api/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}`;
  const qs = `?conn=${connId}`;

  async function rename() {
    if (!newName.trim() || newName.trim() === table) return;
    setBusy(true);
    const r = await fetch(`${base}/rename${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName: newName.trim() }),
    });
    const d = await r.json();
    setBusy(false);
    if (d.error) { toast(d.error, 'error'); return; }
    toast(`Renamed to "${newName.trim()}"`);
    setModal(null);
    onRenamed(newName.trim());
  }

  async function truncate() {
    setBusy(true);
    const r = await fetch(`${base}/truncate${qs}`, { method: 'POST' });
    const d = await r.json();
    setBusy(false);
    if (d.error) { toast(d.error, 'error'); return; }
    toast(`"${table}" truncated`);
    setModal(null);
    onTruncated();
  }

  async function runMaintenance(op: string) {
    setBusy(true);
    const r = await fetch(`${base}/maintenance${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op }),
    });
    const d = await r.json();
    setBusy(false);
    if (d.error) { toast(d.error, 'error'); return; }
    setMaintResult(d.rows || []);
    toast(`${op} complete`);
  }

  async function copyTable() {
    if (!copyName.trim()) return;
    setBusy(true);
    const r = await fetch(`${base}/copy${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destTable: copyName.trim(), includeData: copyData }),
    });
    const d = await r.json();
    setBusy(false);
    if (d.error) { toast(d.error, 'error'); return; }
    toast(`Table copied to "${copyName.trim()}"`);
    setModal(null);
  }

  async function drop() {
    setBusy(true);
    const r = await fetch(`${base}/drop${qs}`, { method: 'POST' });
    const d = await r.json();
    setBusy(false);
    if (d.error) { toast(d.error, 'error'); return; }
    toast(`Table "${table}" dropped`);
    setModal(null);
    onDropped();
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen(v => !v)}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Table actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-30 py-1 overflow-hidden">
            <button
              onClick={() => { setNewName(table); setModal('rename'); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              <Pencil className="w-3.5 h-3.5 text-zinc-500" /> Rename table
            </button>
            <button
              onClick={() => { setCopyName(`${table}_copy`); setCopyData(false); setModal('copy'); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              <Copy className="w-3.5 h-3.5 text-zinc-500" /> Copy table
            </button>
            <button
              onClick={() => { setModal('truncate-confirm'); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              <Eraser className="w-3.5 h-3.5 text-zinc-500" /> Truncate table
            </button>
            <button
              onClick={() => { setMaintOp(''); setMaintResult([]); setModal('maintenance'); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              <Wrench className="w-3.5 h-3.5 text-zinc-500" /> Maintenance
            </button>
            <div className="my-1 border-t border-zinc-800" />
            <button
              onClick={() => { setModal('drop-1'); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Drop table
            </button>
          </div>
        )}
      </div>

      {/* Copy modal */}
      {modal === 'copy' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Copy table</h2>
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">Source: <span className="font-mono text-zinc-300">{table}</span></label>
              <input
                autoFocus
                value={copyName}
                onChange={e => setCopyName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && copyTable()}
                placeholder="new_table_name"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input type="checkbox" checked={copyData} onChange={e => setCopyData(e.target.checked)} className="w-3.5 h-3.5 accent-blue-500" />
              Include data (not just structure)
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">Cancel</button>
              <button
                onClick={copyTable}
                disabled={busy || !copyName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance modal */}
      {modal === 'maintenance' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Table Maintenance</h2>
              <span className="text-xs font-mono text-zinc-500">{db}.{table}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['OPTIMIZE','ANALYZE','REPAIR','CHECK'] as const).map(op => (
                <button
                  key={op}
                  onClick={() => { setMaintOp(op); runMaintenance(op); }}
                  disabled={busy}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40 ${
                    maintOp === op && busy
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                      : 'border-zinc-700 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800'
                  }`}
                >
                  {maintOp === op && busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5 text-zinc-500" />}
                  {op}
                </button>
              ))}
            </div>
            {maintResult.length > 0 && (
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <table className="min-w-full text-xs">
                  <thead><tr className="border-b border-zinc-800 bg-zinc-800/40">
                    {Object.keys(maintResult[0]).map(k => <th key={k} className="px-3 py-2 text-left text-zinc-500">{k}</th>)}
                  </tr></thead>
                  <tbody>
                    {maintResult.map((row, i) => (
                      <tr key={i} className="border-b border-zinc-800/40 last:border-0">
                        {Object.values(row).map((v, j) => <td key={j} className="px-3 py-2 text-zinc-300">{String(v)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => { setModal(null); setMaintResult([]); setMaintOp(''); }} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename modal */}
      {modal === 'rename' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Rename table</h2>
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 block">Current: <span className="font-mono text-zinc-300">{table}</span></label>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && rename()}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">Cancel</button>
              <button
                onClick={rename}
                disabled={busy || !newName.trim() || newName.trim() === table}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Truncate confirm */}
      {modal === 'truncate-confirm' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-300">Truncate table?</p>
                <p className="text-xs text-zinc-400">All rows in <span className="font-mono text-zinc-200">{table}</span> will be permanently deleted. The table structure is kept. This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">Cancel</button>
              <button
                onClick={truncate}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Truncate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drop step 1 */}
      {modal === 'drop-1' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-300">Drop table — are you sure?</p>
                <p className="text-xs text-zinc-400">Dropping <span className="font-mono text-zinc-200">{db}.{table}</span> will permanently destroy the table and all its data.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">Cancel</button>
              <button onClick={() => setModal('drop-2')} className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors font-medium">
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drop step 2 */}
      {modal === 'drop-2' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-300">Final confirmation</p>
                <p className="text-xs text-zinc-400">You are about to permanently drop <span className="font-mono text-zinc-200">{db}.{table}</span>. There is no undo.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">Cancel</button>
              <button
                onClick={drop}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors font-semibold"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Drop table
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
