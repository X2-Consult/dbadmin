import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { alterColumn } from '@/lib/adapter';

type Params = Promise<{ db: string; table: string; column: string }>;

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { db, table, column } = await params;
  const def = await req.json();
  const connId = req.nextUrl.searchParams.get('conn') || 'default';
  try {
    const pool = await getConnPool(connId);
    await alterColumn(pool, db, table, column, def);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
