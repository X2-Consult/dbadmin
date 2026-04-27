import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { getTableData } from '@/lib/adapter';

type Params = Promise<{ db: string; table: string }>;

function toSQLInserts(table: string, rows: unknown[]): string {
  if (!rows.length) return `-- No rows in ${table}\n`;
  const cols = Object.keys(rows[0] as Record<string, unknown>);
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number' || typeof v === 'bigint') return String(v);
    if (typeof v === 'boolean') return v ? '1' : '0';
    return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  };
  const header = `-- ${table}: ${rows.length} rows\n`;
  const colList = cols.map(c => `\`${c}\``).join(', ');
  const values = (rows as Record<string, unknown>[])
    .map(r => `(${cols.map(c => esc(r[c])).join(', ')})`)
    .join(',\n  ');
  return `${header}INSERT INTO \`${table}\` (${colList})\nVALUES\n  ${values};\n`;
}

function toCSV(rows: unknown[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0] as Record<string, unknown>);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map(escape).join(',');
  const body = rows.map(r =>
    cols.map(c => escape((r as Record<string, unknown>)[c])).join(',')
  ).join('\n');
  return header + '\n' + body;
}

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { db, table } = await params;
  const safeTable = table.replace(/[^A-Za-z0-9_\-]/g, '_');
  const sp = req.nextUrl.searchParams;
  const connId = sp.get('conn') || 'default';
  const format = sp.get('format') || 'csv';
  const limit = Math.min(100_000, parseInt(sp.get('limit') || '50000'));
  try {
    const pool = await getConnPool(connId);
    const { rows } = await getTableData(pool, db, table, 1, limit);
    if (format === 'json') {
      return new NextResponse(JSON.stringify(rows, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${safeTable}.json"`,
        },
      });
    }
    if (format === 'sql') {
      return new NextResponse(toSQLInserts(table, rows), {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="${safeTable}.sql"`,
        },
      });
    }
    const csv = toCSV(rows);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${safeTable}.csv"`,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
