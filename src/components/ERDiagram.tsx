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

function forceLayout(tables: ERTable[], relations: ERRelation[]): Record<string, { x: number; y: number }> {
  const n = tables.length;
  if (n === 0) return {};

  const cx = 500, cy = 400;
  const r = Math.min(500, 120 * Math.sqrt(n));
  const pos: Record<string, { x: number; y: number }> = {};
  const vel: Record<string, { vx: number; vy: number }> = {};

  tables.forEach((t, i) => {
    const angle = (2 * Math.PI * i) / n;
    pos[t.name] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    vel[t.name] = { vx: 0, vy: 0 };
  });

  const REPULSION = 18000, SPRING_LEN = 220, SPRING_K = 0.04, DAMPING = 0.82, GRAVITY = 0.0008;

  for (let iter = 0; iter < 400; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = tables[i].name, b = tables[j].name;
        const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y;
        const dist = Math.max(40, Math.sqrt(dx * dx + dy * dy));
        const f = REPULSION / (dist * dist);
        vel[a].vx -= f * dx / dist; vel[a].vy -= f * dy / dist;
        vel[b].vx += f * dx / dist; vel[b].vy += f * dy / dist;
      }
    }
    for (const rel of relations) {
      const a = rel.fromTable, b = rel.toTable;
      if (!pos[a] || !pos[b] || a === b) continue;
      const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const f = SPRING_K * (dist - SPRING_LEN);
      vel[a].vx += f * dx / dist; vel[a].vy += f * dy / dist;
      vel[b].vx -= f * dx / dist; vel[b].vy -= f * dy / dist;
    }
    for (const t of tables) {
      vel[t.name].vx += (cx - pos[t.name].x) * GRAVITY;
      vel[t.name].vy += (cy - pos[t.name].y) * GRAVITY;
      vel[t.name].vx *= DAMPING; vel[t.name].vy *= DAMPING;
      pos[t.name].x += vel[t.name].vx; pos[t.name].y += vel[t.name].vy;
    }
  }
  return pos;
}

function initialLayout(tables: ERTable[], relations: ERRelation[]): Record<string, TablePos> {
  const fPos = forceLayout(tables, relations);
  const positions: Record<string, TablePos> = {};
  tables.forEach(t => {
    const p = fPos[t.name] ?? { x: 40, y: 40 };
    positions[t.name] = { x: p.x - TABLE_W / 2, y: p.y - tableHeight(t) / 2, w: TABLE_W, h: tableHeight(t) };
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
        setPositions(initialLayout(d.tables || [], d.relations || []));
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
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#3b82f6" opacity="0.7" />
            </marker>
            <marker id="arrow-left" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto">
              <path d="M6,0 L6,6 L0,3 z" fill="#3b82f6" opacity="0.7" />
            </marker>
          </defs>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Relation arrows */}
            {relations.map((rel, i) => {
              const fromPos = positions[rel.fromTable];
              const toPos = positions[rel.toTable];
              if (!fromPos || !toPos) return null;

              // Use the nearest horizontal edge so arrows never go off-screen.
              // Previous code always used right→left which breaks the circular layout.
              const fromCx = fromPos.x + TABLE_W / 2;
              const toCx = toPos.x + TABLE_W / 2;
              const toIsRight = toCx >= fromCx;
              const x1 = toIsRight ? fromPos.x + TABLE_W : fromPos.x;
              const x2 = toIsRight ? toPos.x : toPos.x + TABLE_W;
              const cp = Math.min(Math.abs(x2 - x1) * 0.5, 110);
              const cp1x = toIsRight ? x1 + cp : x1 - cp;
              const cp2x = toIsRight ? x2 - cp : x2 + cp;

              // Fall back to table midpoint if the specific column isn't found
              const fromY = getColY(rel.fromTable, rel.fromColumn)
                ?? (fromPos.y + fromPos.h / 2);
              const toY = getColY(rel.toTable, rel.toColumn)
                ?? (toPos.y + toPos.h / 2);

              const dim = relatedToHighlighted && !relatedToHighlighted.has(rel.fromTable);
              return (
                <g key={i}>
                  <path
                    d={`M ${x1} ${fromY} C ${cp1x} ${fromY}, ${cp2x} ${toY}, ${x2} ${toY}`}
                    fill="none"
                    stroke={dim ? '#27272a' : '#3b82f6'}
                    strokeWidth={dim ? 1 : 1.5}
                    strokeOpacity={dim ? 0.3 : 0.7}
                    markerEnd={toIsRight ? 'url(#arrow)' : undefined}
                    markerStart={toIsRight ? undefined : 'url(#arrow-left)'}
                  />
                </g>
              );
            })}

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
