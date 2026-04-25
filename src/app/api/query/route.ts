import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { execQuery } from '@/lib/adapter';

export async function POST(req: NextRequest) {
  const { sql, db, conn = 'default' } = await req.json();
  if (!sql?.trim()) return NextResponse.json({ error: 'Empty query' }, { status: 400 });
  try {
    const pool = await getConnPool(conn);
    const result = await execQuery(pool, sql, db);
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
