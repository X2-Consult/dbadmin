'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Network, Loader2, AlertCircle, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useConn } from '@/context/ConnectionContext';

interface ERTable {
  name: string;
  columns: Array<{ name: string; type: string; pk: boolean; fk: boolean }>;
}

interface ERRelation {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

interface TablePos { x: number; y: number; w: number; h: number }

const COL_H = 22;
const HEADER_H = 32;
const TABLE_W = 180;

function tableHeight(t: ERTable) {
  return HEADER_H + t.columns.length * COL_H + 8;
}

function initialLayout(tables: ERTable[]): Record<string, TablePos> {
  const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
  const positions: Record<string, TablePos> = {};
  tables.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions[t.name] = {
      x: 40 + col * 230,
      y: 40 + row * 280,
      w: TABLE_W,
      h: tableHeight(t),
    };
  });
  return positions;
}

interface Props { db: string }

export default function ERDiagram({ db }: Props) {
  const { connId } = useConn();
  const [tables, setTables] = useState<ERTable[]>([]);
  const [relations, setRelations] = useState<ERRelation[]>([]);
  const [positions, setPositions] = useState<Record<string, TablePos>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ table: string; ox: number; oy: number } | null>(null);
  const [panning, setPanning] = useState<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/databases/${encodeURIComponent(db)}/er?conn=${connId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setTables(d.tables || []);
        setRelations(d.relations || []);
        setPositions(initialLayout(d.tables || []));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [db, connId]);

  const getColY = useCallback((tableName: string, colName: string) => {
    const pos = positions[tableName];
    if (!pos) return null;
    const tbl = tables.find(t => t.name === tableName);
    if (!tbl) return null;
    const idx = tbl.columns.findIndex(c => c.name === colName);
    if (idx === -1) return null;
    return pos.y + HEADER_H + idx * COL_H + COL_H / 2;
  }, [positions, tables]);

  function onTableMouseDown(e: React.MouseEvent, name: string) {
    e.stopPropagation();
    const pos = positions[name];
    setDragging({ table: name, ox: e.clientX / zoom - pos.x, oy: e.clientY / zoom - pos.y });
  }

  function onSvgMouseDown(e: React.MouseEvent) {
    if (dragging) return;
    setPanning({ sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (dragging) {
      const newX = e.clientX / zoom - dragging.ox;
      const newY = e.clientY / zoom - dragging.oy;
      setPositions(prev => ({
        ...prev,
        [dragging.table]: { ...prev[dragging.table], x: newX, y: newY },
      }));
    } else if (panning) {
      setPan({ x: panning.px + e.clientX - panning.sx, y: panning.py + e.clientY - panning.sy });
    }
  }

  function onMouseUp() {
    setDragging(null);
    setPanning(null);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full gap-2 text-zinc-500 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading ER diagram…
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-4">
        <AlertCircle className="w-4 h-4 shrink-0" />{error}
      </div>
    </div>
  );

  if (tables.length === 0) return (
    <div className="flex items-center justify-center h-full text-zinc-600 text-sm">No tables found in {db}</div>
  );

  const relatedToHighlighted = highlighted
    ? new Set(relations.flatMap(r => r.fromTable === highlighted || r.toTable === highlighted ? [r.fromTable, r.toTable] : []))
    : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 shrink-0">
        <Network className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold text-zinc-100">ER Diagram</span>
        <span className="text-xs text-zinc-600 font-mono">{db}</span>
        <span className="text-xs text-zinc-600 ml-1">{tables.length} tables · {relations.length} relations</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-zinc-600 ml-1">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
        <svg
          ref={svgRef}
          className="w-full h-full select-none"
          onMouseDown={onSvgMouseDown}
        >
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Relation arrows */}
            {relations.map((rel, i) => {
              const fromPos = positions[rel.fromTable];
              const toPos = positions[rel.toTable];
              if (!fromPos || !toPos) return null;
              const fromY = getColY(rel.fromTable, rel.fromColumn);
              const toY = getColY(rel.toTable, rel.toColumn);
              if (fromY === null || toY === null) return null;
              const x1 = fromPos.x + TABLE_W;
              const x2 = toPos.x;
              const dim = relatedToHighlighted && !relatedToHighlighted.has(rel.fromTable);
              return (
                <g key={i}>
                  <path
                    d={`M ${x1} ${fromY} C ${x1 + 60} ${fromY}, ${x2 - 60} ${toY}, ${x2} ${toY}`}
                    fill="none"
                    stroke={dim ? '#27272a' : '#3b82f6'}
                    strokeWidth={dim ? 1 : 1.5}
                    strokeOpacity={dim ? 0.3 : 0.7}
                    markerEnd="url(#arrow)"
                  />
                </g>
              );
            })}

            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#3b82f6" opacity="0.7" />
              </marker>
            </defs>

            {/* Tables */}
            {tables.map(tbl => {
              const pos = positions[tbl.name];
              if (!pos) return null;
              const isHighlighted = highlighted === tbl.name;
              const isRelated = relatedToHighlighted?.has(tbl.name) && !isHighlighted;
              const isDimmed = relatedToHighlighted && !relatedToHighlighted.has(tbl.name);
              return (
                <g key={tbl.name} transform={`translate(${pos.x},${pos.y})`}
                  onMouseDown={e => onTableMouseDown(e, tbl.name)}
                  onMouseEnter={() => setHighlighted(tbl.name)}
                  onMouseLeave={() => setHighlighted(null)}
                  style={{ cursor: 'move', opacity: isDimmed ? 0.35 : 1 }}>
                  {/* Shadow */}
                  <rect x="2" y="2" width={TABLE_W} height={pos.h} rx="8" fill="black" opacity="0.4" />
                  {/* Body */}
                  <rect width={TABLE_W} height={pos.h} rx="8"
                    fill={isHighlighted ? '#1e293b' : '#18181b'}
                    stroke={isHighlighted ? '#3b82f6' : isRelated ? '#6366f1' : '#3f3f46'}
                    strokeWidth={isHighlighted ? 1.5 : 1}
                  />
                  {/* Header */}
                  <rect width={TABLE_W} height={HEADER_H} rx="8" fill={isHighlighted ? '#1d4ed8' : '#1e40af'} opacity="0.4" />
                  <rect y={HEADER_H - 8} width={TABLE_W} height={8} fill={isHighlighted ? '#1d4ed8' : '#1e40af'} opacity="0.4" />
                  <text x="10" y={HEADER_H / 2 + 5} fill="white" fontSize="12" fontWeight="600" fontFamily="monospace">
                    {tbl.name.length > 18 ? tbl.name.slice(0, 16) + '…' : tbl.name}
                  </text>
                  {/* Columns */}
                  {tbl.columns.map((col, j) => (
                    <g key={col.name} transform={`translate(0,${HEADER_H + j * COL_H + 4})`}>
                      <rect x="4" width={TABLE_W - 8} height={COL_H - 2} rx="3"
                        fill={col.pk ? '#854d0e20' : col.fk ? '#1e3a5f20' : 'transparent'}
                      />
                      <text x="10" y={COL_H / 2 + 3} fill={col.pk ? '#fbbf24' : col.fk ? '#60a5fa' : '#a1a1aa'} fontSize="10" fontFamily="monospace">
                        {col.pk ? '🔑 ' : col.fk ? '🔗 ' : '  '}
                        {col.name.length > 16 ? col.name.slice(0, 14) + '…' : col.name}
                      </text>
                      <text x={TABLE_W - 6} y={COL_H / 2 + 3} fill="#52525b" fontSize="9" fontFamily="monospace" textAnchor="end">
                        {col.type.length > 10 ? col.type.slice(0, 8) + '…' : col.type}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
