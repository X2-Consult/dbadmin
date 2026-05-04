import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { getProcessList, killProcess } from '@/lib/adapter';

const connId = (req: NextRequest) => req.nextUrl.searchParams.get('conn') || 'default';

export async function GET(req: NextRequest) {
  try {
    const pool = await getConnPool(connId(req));
    const processes = await getProcessList(pool);
    return NextResponse.json({ processes });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const numId = Number(id);
  if (!id || !Number.isInteger(numId) || numId <= 0) return NextResponse.json({ error: 'id must be a positive integer' }, { status: 400 });
  try {
    const pool = await getConnPool(connId(req));
    await killProcess(pool, numId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
