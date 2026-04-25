import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { listUsers, createUser, dropUser } from '@/lib/adapter';

function conn(req: NextRequest) { return req.nextUrl.searchParams.get('conn') || 'default'; }

export async function GET(req: NextRequest) {
  try {
    const pool = await getConnPool(conn(req));
    const users = await listUsers(pool);
    return NextResponse.json({ users });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, host, password, grants } = await req.json();
  try {
    const pool = await getConnPool(conn(req));
    await createUser(pool, user, host || '%', password, grants || []);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { user, host } = await req.json();
  try {
    const pool = await getConnPool(conn(req));
    await dropUser(pool, user, host);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
