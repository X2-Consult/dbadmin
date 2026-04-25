import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { getTableData, insertRow, updateRow, deleteRow } from '@/lib/adapter';

type Params = Promise<{ db: string; table: string }>;

function conn(req: NextRequest) { return req.nextUrl.searchParams.get('conn') || 'default'; }

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { db, table } = await params;
  const sp = req.nextUrl.searchParams;
  const page = parseInt(sp.get('page') || '1');
  const pageSize = parseInt(sp.get('pageSize') || '50');
  try {
    const pool = await getConnPool(conn(req));
    const { rows, total } = await getTableData(pool, db, table, page, pageSize);
    return NextResponse.json({ rows, total, page, pageSize });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { db, table } = await params;
  const body = await req.json();
  try {
    const pool = await getConnPool(conn(req));
    const result = await insertRow(pool, db, table, body);
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { db, table } = await params;
  const { __pk, ...fields } = await req.json();
  try {
    const pool = await getConnPool(conn(req));
    await updateRow(pool, db, table, fields, __pk);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const { db, table } = await params;
  const body = await req.json();
  try {
    const pool = await getConnPool(conn(req));
    await deleteRow(pool, db, table, body);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
