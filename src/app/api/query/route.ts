import { NextRequest, NextResponse } from 'next/server';
import { getConnPool } from '@/lib/connections';
import { execQuery, execExplain } from '@/lib/adapter';
import { appendHistory } from '@/lib/history';

export async function POST(req: NextRequest) {
  const { sql, db, conn = 'default', explain = false, dryRun = false } = await req.json();
  if (!sql?.trim()) return NextResponse.json({ error: 'Empty query' }, { status: 400 });
  try {
    const pool = await getConnPool(conn);

    if (pool.config.readonly && !explain && !dryRun) {
      return NextResponse.json({ error: 'Connection is read-only' }, { status: 403 });
    }

    if (explain) {
      const result = await execExplain(pool, sql, db);
      return NextResponse.json(result);
    }

    if (dryRun) {
      const isPg = pool.config.type === 'postgres';
      const beginSql = isPg ? 'BEGIN' : 'START TRANSACTION';
      await (isPg ? pool.pg!.query(beginSql) : pool.mysql!.query(beginSql));
      try {
        const result = await execQuery(pool, sql, db);
        return NextResponse.json({ ...result, dryRun: true });
      } finally {
        const rollbackSql = 'ROLLBACK';
        await (isPg ? pool.pg!.query(rollbackSql) : pool.mysql!.query(rollbackSql)).catch(() => {});
      }
    }

    const result = await execQuery(pool, sql, db);
    appendHistory({
      sql, db, conn,
      elapsed: result.elapsed,
      rowCount: result.rows?.length,
      affectedRows: result.affectedRows,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = (e as Error).message;
    appendHistory({ sql, db, conn, elapsed: 0, error: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
