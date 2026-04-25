import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { getLiveStats } from '@/lib/adapter';

export async function GET(req: NextRequest) {
  const connId = req.nextUrl.searchParams.get('conn') || 'default';
  try {
    const pool = await getConnPool(connId);
    const stats = await getLiveStats(pool);
    return NextResponse.json({ stats, ts: Date.now() });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
