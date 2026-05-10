import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { getTopQueries, resetQueryStats, QueryPeriod } from '@/lib/adapter';

const VALID_PERIODS = new Set<QueryPeriod>(['hour', 'day', 'week', 'all']);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const connId = sp.get('conn') || 'default';
  const raw = sp.get('period') ?? 'all';
  const period: QueryPeriod = VALID_PERIODS.has(raw as QueryPeriod) ? (raw as QueryPeriod) : 'all';
  try {
    const pool = await getConnPool(connId);
    const queries = await getTopQueries(pool, period);
    return NextResponse.json({ queries, period, isPg: pool.config.type === 'postgres' });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const connId = sp.get('conn') || 'default';
  try {
    const pool = await getConnPool(connId);
    await resetQueryStats(pool);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
