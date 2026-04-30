import { NextRequest, NextResponse } from 'next/server';
import { listConnections, saveConnection, getConnPool } from '@/lib/connections';
import type { ConnectionConfig } from '@/lib/connections';
import { randomUUID } from 'crypto';
import { toApiError } from '@/lib/errors';

export async function GET() {
  const conns = listConnections().map(({ password: _, sshPassword: _sp, sshKey: _sk, ...rest }) => rest);
  return NextResponse.json({ connections: conns });
}

export async function POST(req: NextRequest) {
  const body: Omit<ConnectionConfig, 'id'> & { id?: string } = await req.json();
  let conn: ConnectionConfig = {
    ...body,
    id: body.id || randomUUID(),
    port: Number(body.port),
  };

  // When editing, fill in credentials that weren't re-entered
  if (body.id && (conn.password === '' || conn.sshPassword === '' || conn.sshKey === '')) {
    const existing = listConnections().find(c => c.id === body.id);
    if (existing) {
      conn = {
        ...conn,
        password:    conn.password === ''    ? existing.password    : conn.password,
        sshPassword: conn.sshPassword === '' ? existing.sshPassword : conn.sshPassword,
        sshKey:      conn.sshKey === ''      ? existing.sshKey      : conn.sshKey,
      };
    }
  }

  try {
    // Pass config directly so getConnPool doesn't need it saved first
    const pool = await getConnPool(conn);
    if (conn.type === 'postgres') {
      await pool.pg!.query('SELECT 1');
    } else {
      await pool.mysql!.query('SELECT 1');
    }
    saveConnection(conn);
    const { password: _, sshPassword: _sp, sshKey: _sk, ...safe } = conn;
    return NextResponse.json({ connection: safe });
  } catch (e: unknown) {
    return NextResponse.json({ error: toApiError(e) }, { status: 400 });
  }
}
