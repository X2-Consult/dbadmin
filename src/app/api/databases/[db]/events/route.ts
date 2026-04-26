import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { listEvents, dropEvent } from '@/lib/adapter';

type Params = Promise<{ db: string }>;
const cid = (req: NextRequest) => req.nextUrl.searchParams.get('conn') || 'default';

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { db } = await params;
  try {
    const pool = await getConnPool(cid(req));
    const events = await listEvents(pool, db);
    return NextResponse.json({ events });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const { db } = await params;
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  try {
    const pool = await getConnPool(cid(req));
    await dropEvent(pool, db, name);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
