import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { getSchemaDiff } from '@/lib/adapter';

export async function POST(req: NextRequest) {
  try {
    const { connA, dbA, connB, dbB } = await req.json();
    const [poolA, poolB] = await Promise.all([
      getConnPool(connA || 'default'),
      getConnPool(connB || 'default'),
    ]);
    const diff = await getSchemaDiff(poolA, dbA, poolB, dbB);
    return NextResponse.json(diff);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
