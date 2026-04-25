import { NextResponse } from 'next/server';
import { getConnPool, listConnections } from '@/lib/connections';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const pool = await getConnPool(id);
    if (pool.config.type === 'postgres') {
      const res = await pool.pg!.query('SELECT version()');
      return NextResponse.json({ ok: true, version: res.rows[0].version });
    } else {
      const [[row]] = await pool.mysql!.query('SELECT version() as v') as [Array<{ v: string }>, unknown];
      return NextResponse.json({ ok: true, version: row.v });
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
