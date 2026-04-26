import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { getRoutineBody, dropRoutine } from '@/lib/adapter';

type Params = Promise<{ db: string; name: string }>;
const cid = (req: NextRequest) => req.nextUrl.searchParams.get('conn') || 'default';

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { db, name } = await params;
  const type = req.nextUrl.searchParams.get('type') || 'FUNCTION';
  try {
    const pool = await getConnPool(cid(req));
    const body = await getRoutineBody(pool, db, name, type);
    return NextResponse.json({ body });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const { db, name } = await params;
  const { type } = await req.json();
  try {
    const pool = await getConnPool(cid(req));
    await dropRoutine(pool, db, name, type);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
