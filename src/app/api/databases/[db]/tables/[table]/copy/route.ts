import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { copyTable } from '@/lib/adapter';

type Ctx = { params: Promise<{ db: string; table: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { db, table } = await params;
  const connId = req.nextUrl.searchParams.get('conn') || 'default';
  try {
    const { destTable, includeData } = await req.json();
    const pool = await getConnPool(connId);
    await copyTable(pool, db, table, destTable, !!includeData);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
