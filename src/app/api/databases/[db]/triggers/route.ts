import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { listTriggers, dropTrigger } from '@/lib/adapter';

type Params = Promise<{ db: string }>;
const cid = (req: NextRequest) => req.nextUrl.searchParams.get('conn') || 'default';

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { db } = await params;
  try {
    const pool = await getConnPool(cid(req));
    const triggers = await listTriggers(pool, db);
    return NextResponse.json({ triggers });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const { db } = await params;
  const { name, table } = await req.json();
  if (!name || !table) return NextResponse.json({ error: 'name and table required' }, { status: 400 });
  try {
    const pool = await getConnPool(cid(req));
    await dropTrigger(pool, db, name, table);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
