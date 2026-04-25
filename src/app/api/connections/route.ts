import { NextRequest, NextResponse } from 'next/server';
import { listConnections, saveConnection, getConnPool } from '@/lib/connections';
import type { ConnectionConfig } from '@/lib/connections';
import { randomUUID } from 'crypto';

export async function GET() {
  const conns = listConnections().map(({ password: _, ...rest }) => rest);
  return NextResponse.json({ connections: conns });
}

export async function POST(req: NextRequest) {
  const body: Omit<ConnectionConfig, 'id'> & { id?: string } = await req.json();
  const conn: ConnectionConfig = {
    ...body,
    id: body.id || randomUUID(),
    port: Number(body.port),
  };
  try {
    // Test the connection before saving
    const pool = await getConnPool(conn.id);
    if (conn.type === 'postgres') {
      await pool.pg!.query('SELECT 1');
    } else {
      await pool.mysql!.query('SELECT 1');
    }
    saveConnection(conn);
    const { password: _, ...safe } = conn;
    return NextResponse.json({ connection: safe });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
