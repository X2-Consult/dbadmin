import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { tableMaintenanceOp, MaintenanceOp } from '@/lib/adapter';

type Params = Promise<{ db: string; table: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { db, table } = await params;
  const { op } = await req.json();
  const connId = req.nextUrl.searchParams.get('conn') || 'default';
  const valid: MaintenanceOp[] = ['OPTIMIZE', 'ANALYZE', 'REPAIR', 'CHECK'];
  if (!valid.includes(op)) return NextResponse.json({ error: 'invalid op' }, { status: 400 });
  try {
    const pool = await getConnPool(connId);
    const rows = await tableMaintenanceOp(pool, db, table, op);
    return NextResponse.json({ ok: true, rows });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
