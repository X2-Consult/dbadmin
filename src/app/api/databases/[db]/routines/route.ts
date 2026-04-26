import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { listRoutines } from '@/lib/adapter';

type Params = Promise<{ db: string }>;
const cid = (req: NextRequest) => req.nextUrl.searchParams.get('conn') || 'default';

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { db } = await params;
  try {
    const pool = await getConnPool(cid(req));
    const routines = await listRoutines(pool, db);
    return NextResponse.json({ routines });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
