import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { listTables } from '@/lib/adapter';

export async function GET(req: NextRequest, { params }: { params: Promise<{ db: string }> }) {
  const { db } = await params;
  const connId = req.nextUrl.searchParams.get('conn') || 'default';
  try {
    const pool = await getConnPool(connId);
    const tables = await listTables(pool, db);
    return NextResponse.json({ tables });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
