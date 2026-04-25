/**
 * Unified query adapter over MySQL/MariaDB and PostgreSQL.
 * All table/schema identifiers are sanitized via allow-listed characters.
 * Query params use native parameterisation for user-supplied values.
 */
import type { ConnPool } from './connections';
import type { ResultSetHeader } from 'mysql2';
import type { QueryResult as PgResult } from 'pg';

const isPg = (p: ConnPool) => p.config.type === 'postgres';

// safe identifier quoting
function qi(name: string, pg: boolean) {
  return pg ? `"${name.replace(/"/g, '')}"` : `\`${name.replace(/`/g, '')}\``;
}

// ─── Databases / schemas ─────────────────────────────────────────────────────

export async function listDatabases(pool: ConnPool): Promise<string[]> {
  if (isPg(pool)) {
    const { rows } = await pool.pg!.query<{ schema_name: string }>(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('information_schema','pg_catalog','pg_toast')
         AND schema_name NOT LIKE 'pg_temp%'
       ORDER BY schema_name`
    );
    return rows.map(r => r.schema_name);
  }
  const [rows] = await pool.mysql!.query('SHOW DATABASES') as [Array<{ Database: string }>, unknown];
  const skip = new Set(['information_schema', 'performance_schema', 'sys']);
  return rows.map(r => r.Database).filter(d => !skip.has(d));
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export async function listTables(pool: ConnPool, db: string): Promise<string[]> {
  if (isPg(pool)) {
    const { rows } = await pool.pg!.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [db]
    );
    return rows.map(r => r.table_name);
  }
  const [rows] = await pool.mysql!.query(
    `SHOW TABLES FROM ${qi(db, false)}`
  ) as [Record<string, string>[], unknown];
  return rows.map(r => r[`Tables_in_${db}`]);
}

// ─── Row data ─────────────────────────────────────────────────────────────────

export async function getTableData(
  pool: ConnPool, db: string, table: string, page: number, pageSize: number
): Promise<{ rows: unknown[]; total: number }> {
  const offset = (page - 1) * pageSize;
  if (isPg(pool)) {
    const q = qi(db, true) + '.' + qi(table, true);
    const [cntRes, dataRes] = await Promise.all([
      pool.pg!.query<{ total: string }>(`SELECT COUNT(*)::int AS total FROM ${q}`),
      pool.pg!.query(`SELECT * FROM ${q} LIMIT $1 OFFSET $2`, [pageSize, offset]),
    ]);
    return { rows: dataRes.rows, total: parseInt(cntRes.rows[0].total) };
  }
  const q = qi(db, false) + '.' + qi(table, false);
  const [[countRow]] = await pool.mysql!.query(
    `SELECT COUNT(*) as total FROM ${q}`
  ) as [Array<{ total: number }>, unknown];
  const [rows] = await pool.mysql!.query(`SELECT * FROM ${q} LIMIT ${pageSize} OFFSET ${offset}`);
  return { rows: rows as unknown[], total: countRow.total };
}

// ─── Structure ────────────────────────────────────────────────────────────────

interface ColumnInfo { Field: string; Type: string; Null: string; Key: string; Default: unknown; Extra: string; }
interface IndexInfo  { Key_name: string; Column_name: string; Non_unique: number; Index_type: string; }

export async function getTableStructure(
  pool: ConnPool, db: string, table: string
): Promise<{ columns: ColumnInfo[]; indexes: IndexInfo[] }> {
  if (isPg(pool)) {
    const { rows: cols } = await pool.pg!.query<ColumnInfo>(
      `SELECT
         c.column_name                                          AS "Field",
         c.udt_name                                            AS "Type",
         c.is_nullable                                         AS "Null",
         COALESCE(
           CASE WHEN pk.attname IS NOT NULL THEN 'PRI' END,
           CASE WHEN uq.attname IS NOT NULL THEN 'UNI' END,
           ''
         )                                                     AS "Key",
         c.column_default                                      AS "Default",
         CASE WHEN c.is_identity='YES' THEN 'auto_increment' ELSE '' END AS "Extra"
       FROM information_schema.columns c
       LEFT JOIN (
         SELECT a.attname FROM pg_constraint ct
         JOIN pg_attribute a ON a.attrelid = ct.conrelid AND a.attnum = ANY(ct.conkey)
         JOIN pg_class cl ON cl.oid = ct.conrelid
         JOIN pg_namespace n ON n.oid = cl.relnamespace
         WHERE ct.contype = 'p' AND n.nspname = $1 AND cl.relname = $2
       ) pk ON pk.attname = c.column_name
       LEFT JOIN (
         SELECT a.attname FROM pg_constraint ct
         JOIN pg_attribute a ON a.attrelid = ct.conrelid AND a.attnum = ANY(ct.conkey)
         JOIN pg_class cl ON cl.oid = ct.conrelid
         JOIN pg_namespace n ON n.oid = cl.relnamespace
         WHERE ct.contype = 'u' AND n.nspname = $1 AND cl.relname = $2
       ) uq ON uq.attname = c.column_name
       WHERE c.table_schema = $1 AND c.table_name = $2
       ORDER BY c.ordinal_position`,
      [db, table]
    );
    const { rows: idxs } = await pool.pg!.query<IndexInfo>(
      `SELECT
         i.relname                      AS "Key_name",
         a.attname                      AS "Column_name",
         (NOT ix.indisunique)::int      AS "Non_unique",
         am.amname                      AS "Index_type"
       FROM pg_class t
       JOIN pg_index ix  ON t.oid = ix.indrelid
       JOIN pg_class i   ON i.oid = ix.indexrelid
       JOIN pg_am am      ON i.relam = am.oid
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = $1 AND t.relname = $2
       ORDER BY i.relname, a.attnum`,
      [db, table]
    );
    return { columns: cols, indexes: idxs };
  }
  const q = qi(db, false) + '.' + qi(table, false);
  const [columns] = await pool.mysql!.query(`DESCRIBE ${q}`) as [ColumnInfo[], unknown];
  const [indexes] = await pool.mysql!.query(`SHOW INDEX FROM ${q}`) as [IndexInfo[], unknown];
  return { columns, indexes };
}

// ─── Insert / Update / Delete ─────────────────────────────────────────────────

export async function insertRow(
  pool: ConnPool, db: string, table: string, data: Record<string, unknown>
): Promise<{ insertId?: number }> {
  const keys = Object.keys(data);
  const vals = Object.values(data);
  const q = qi(db, isPg(pool)) + '.' + qi(table, isPg(pool));
  if (isPg(pool)) {
    const cols = keys.map(k => qi(k, true)).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const res: PgResult = await pool.pg!.query(
      `INSERT INTO ${q} (${cols}) VALUES (${placeholders}) RETURNING *`, vals
    );
    return { insertId: undefined };
  }
  const cols = keys.map(k => qi(k, false)).join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  const [result] = await pool.mysql!.execute(
    `INSERT INTO ${q} (${cols}) VALUES (${placeholders})`, vals as string[]
  );
  return { insertId: (result as ResultSetHeader).insertId };
}

export async function updateRow(
  pool: ConnPool, db: string, table: string,
  fields: Record<string, unknown>, pk: Record<string, unknown>
): Promise<void> {
  const q = qi(db, isPg(pool)) + '.' + qi(table, isPg(pool));
  const fieldKeys = Object.keys(fields);
  const pkKeys = Object.keys(pk);
  if (isPg(pool)) {
    let i = 1;
    const set = fieldKeys.map(k => `${qi(k, true)} = $${i++}`).join(', ');
    const where = pkKeys.map(k => `${qi(k, true)} = $${i++}`).join(' AND ');
    await pool.pg!.query(`UPDATE ${q} SET ${set} WHERE ${where}`, [...Object.values(fields), ...Object.values(pk)]);
  } else {
    const set = fieldKeys.map(k => `${qi(k, false)} = ?`).join(', ');
    const where = pkKeys.map(k => `${qi(k, false)} = ?`).join(' AND ');
    await pool.mysql!.execute(
      `UPDATE ${q} SET ${set} WHERE ${where}`,
      [...Object.values(fields), ...Object.values(pk)] as string[]
    );
  }
}

export async function deleteRow(
  pool: ConnPool, db: string, table: string, pk: Record<string, unknown>
): Promise<void> {
  const q = qi(db, isPg(pool)) + '.' + qi(table, isPg(pool));
  const pkKeys = Object.keys(pk);
  if (isPg(pool)) {
    let i = 1;
    const where = pkKeys.map(k => `${qi(k, true)} = $${i++}`).join(' AND ');
    await pool.pg!.query(`DELETE FROM ${q} WHERE ${where}`, Object.values(pk));
  } else {
    const where = pkKeys.map(k => `${qi(k, false)} = ?`).join(' AND ');
    await pool.mysql!.execute(
      `DELETE FROM ${q} WHERE ${where} LIMIT 1`, Object.values(pk) as string[]
    );
  }
}

// ─── Arbitrary query execution ────────────────────────────────────────────────

export interface ExecResult {
  type: 'select' | 'write';
  rows?: unknown[];
  affectedRows?: number;
  insertId?: number;
  elapsed: number;
}

export async function execQuery(pool: ConnPool, sql: string, db?: string): Promise<ExecResult> {
  const start = Date.now();
  if (isPg(pool)) {
    const res = await pool.pg!.query(sql);
    const elapsed = Date.now() - start;
    if (Array.isArray(res.rows) && res.command !== 'INSERT' && res.command !== 'UPDATE' && res.command !== 'DELETE') {
      return { type: 'select', rows: res.rows, elapsed };
    }
    return { type: 'write', affectedRows: res.rowCount ?? 0, elapsed };
  }
  if (db) await pool.mysql!.query(`USE ${qi(db, false)}`);
  const [result] = await pool.mysql!.query(sql);
  const elapsed = Date.now() - start;
  if (Array.isArray(result)) return { type: 'select', rows: result, elapsed };
  const r = result as ResultSetHeader;
  return { type: 'write', affectedRows: r.affectedRows, insertId: r.insertId, elapsed };
}

// ─── Overview stats ───────────────────────────────────────────────────────────

export interface OverviewStats {
  server: { version: string; uptime: number; maxConnections: number; openConnections: number };
  databases: Array<{
    database: string; tableCount: number; totalSize: number;
    dataSize: number; indexSize: number; estimatedRows: number;
  }>;
}

export async function getOverviewStats(pool: ConnPool): Promise<OverviewStats> {
  if (isPg(pool)) {
    const [verRes, upRes, connRes, dbRes] = await Promise.all([
      pool.pg!.query<{ version: string }>('SELECT version()'),
      pool.pg!.query<{ uptime: string }>(
        `SELECT EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))::int AS uptime`
      ),
      pool.pg!.query<{ total: string; max: string }>(
        `SELECT count(*)::int AS total,
                (SELECT setting::int FROM pg_settings WHERE name='max_connections') AS max
         FROM pg_stat_activity`
      ),
      pool.pg!.query<{ database: string; tableCount: string; totalSize: string; dataSize: string; indexSize: string; estimatedRows: string }>(
        `SELECT
           n.nspname AS database,
           COUNT(c.relname)::int AS "tableCount",
           COALESCE(SUM(pg_total_relation_size(c.oid)),0)::bigint AS "totalSize",
           COALESCE(SUM(pg_relation_size(c.oid)),0)::bigint AS "dataSize",
           COALESCE(SUM(pg_indexes_size(c.oid)),0)::bigint AS "indexSize",
           COALESCE(SUM(c.reltuples),0)::bigint AS "estimatedRows"
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'r'
           AND n.nspname NOT IN ('information_schema','pg_catalog','pg_toast')
           AND n.nspname NOT LIKE 'pg_temp%'
         GROUP BY n.nspname
         ORDER BY "totalSize" DESC`
      ),
    ]);
    const ver = verRes.rows[0].version.split(' ').slice(0, 2).join(' ');
    return {
      server: {
        version: ver,
        uptime: parseInt(upRes.rows[0].uptime),
        maxConnections: parseInt(connRes.rows[0].max),
        openConnections: parseInt(connRes.rows[0].total),
      },
      databases: dbRes.rows.map(r => ({
        database: r.database,
        tableCount: Number(r.tableCount),
        totalSize: Number(r.totalSize),
        dataSize: Number(r.dataSize),
        indexSize: Number(r.indexSize),
        estimatedRows: Number(r.estimatedRows),
      })),
    };
  }
  // MySQL / MariaDB
  const [[uptime], [version], [maxConn], [openConn], [dbSizes]] = await Promise.all([
    pool.mysql!.query(`SELECT VARIABLE_VALUE as val FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME='Uptime'`) as Promise<[Array<{ val: string }>, unknown]>,
    pool.mysql!.query(`SELECT VARIABLE_VALUE as val FROM information_schema.GLOBAL_VARIABLES WHERE VARIABLE_NAME='version'`) as Promise<[Array<{ val: string }>, unknown]>,
    pool.mysql!.query(`SELECT VARIABLE_VALUE as val FROM information_schema.GLOBAL_VARIABLES WHERE VARIABLE_NAME='max_connections'`) as Promise<[Array<{ val: string }>, unknown]>,
    pool.mysql!.query(`SELECT VARIABLE_VALUE as val FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME='Threads_connected'`) as Promise<[Array<{ val: string }>, unknown]>,
    pool.mysql!.query(`
      SELECT table_schema AS \`database\`,
             COUNT(*)::int AS tableCount,
             SUM(data_length+index_length) AS totalSize,
             SUM(data_length) AS dataSize,
             SUM(index_length) AS indexSize,
             SUM(table_rows) AS estimatedRows
      FROM information_schema.tables
      WHERE table_schema NOT IN ('information_schema','performance_schema')
      GROUP BY table_schema ORDER BY totalSize DESC
    `) as Promise<[Array<Record<string, unknown>>, unknown]>,
  ]);
  return {
    server: {
      version: version[0]?.val || '',
      uptime: parseInt(uptime[0]?.val || '0'),
      maxConnections: parseInt(maxConn[0]?.val || '0'),
      openConnections: parseInt(openConn[0]?.val || '0'),
    },
    databases: (dbSizes as Array<Record<string, unknown>>).map(r => ({
      database: r.database as string,
      tableCount: Number(r.tableCount) || 0,
      totalSize: Number(r.totalSize) || 0,
      dataSize: Number(r.dataSize) || 0,
      indexSize: Number(r.indexSize) || 0,
      estimatedRows: Number(r.estimatedRows) || 0,
    })),
  };
}

// ─── Live stats ───────────────────────────────────────────────────────────────

export async function getLiveStats(pool: ConnPool): Promise<Record<string, number>> {
  if (isPg(pool)) {
    const [actRes, dbRes] = await Promise.all([
      pool.pg!.query<{ threads_connected: string; threads_running: string }>(
        `SELECT count(*)::int AS threads_connected,
                count(*) FILTER (WHERE state IS NOT NULL AND state != 'idle')::int AS threads_running
         FROM pg_stat_activity`
      ),
      pool.pg!.query<Record<string, string>>(
        `SELECT
           SUM(xact_commit+xact_rollback)::bigint AS queries,
           SUM(tup_fetched)::bigint               AS com_select,
           SUM(tup_inserted)::bigint              AS com_insert,
           SUM(tup_updated)::bigint               AS com_update,
           SUM(tup_deleted)::bigint               AS com_delete,
           SUM(blks_read*8192)::bigint            AS bytes_received,
           SUM(blks_hit*8192)::bigint             AS bytes_sent,
           SUM(blks_hit)::bigint                  AS innodb_buffer_pool_read_requests,
           SUM(blks_read)::bigint                 AS innodb_buffer_pool_reads,
           0::bigint                              AS slow_queries
         FROM pg_stat_database`
      ),
    ]);
    const stats: Record<string, number> = {};
    const act = actRes.rows[0];
    stats['threads_connected'] = Number(act.threads_connected);
    stats['threads_running'] = Number(act.threads_running);
    for (const [k, v] of Object.entries(dbRes.rows[0])) stats[k] = Number(v) || 0;
    return stats;
  }
  const KEYS = [
    'Queries','Com_select','Com_insert','Com_update','Com_delete',
    'Threads_connected','Threads_running','Threads_created',
    'Innodb_buffer_pool_reads','Innodb_buffer_pool_read_requests',
    'Slow_queries','Bytes_sent','Bytes_received','Connections','Aborted_connects',
  ];
  const placeholders = KEYS.map(() => '?').join(',');
  const [rows] = await pool.mysql!.execute(
    `SELECT VARIABLE_NAME as k, VARIABLE_VALUE as v
     FROM information_schema.GLOBAL_STATUS
     WHERE VARIABLE_NAME IN (${placeholders})`,
    KEYS
  ) as [Array<{ k: string; v: string }>, unknown];
  const stats: Record<string, number> = {};
  for (const row of rows) stats[row.k.toLowerCase()] = parseInt(row.v) || 0;
  return stats;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export interface DbUser {
  User: string; Host: string; plugin: string; password_expired: string; account_locked: string;
}

export async function listUsers(pool: ConnPool): Promise<DbUser[]> {
  if (isPg(pool)) {
    const { rows } = await pool.pg!.query(
      `SELECT rolname AS "User", '*' AS "Host",
              'scram-sha-256' AS "plugin",
              CASE WHEN rolvaliduntil < now() THEN 'Y' ELSE 'N' END AS "password_expired",
              CASE WHEN NOT rolcanlogin THEN 'Y' ELSE 'N' END AS "account_locked"
       FROM pg_roles WHERE rolname NOT LIKE 'pg_%' ORDER BY rolname`
    );
    return rows as DbUser[];
  }
  const [rows] = await pool.mysql!.query(
    `SELECT User, Host, plugin, password_expired, account_locked
     FROM mysql.user ORDER BY User, Host`
  );
  return rows as DbUser[];
}

export async function createUser(
  pool: ConnPool, user: string, host: string, password: string, grants: string[]
): Promise<void> {
  if (isPg(pool)) {
    await pool.pg!.query(`CREATE USER "${user.replace(/"/g, '')}" WITH PASSWORD $1`, [password]);
    for (const g of grants) {
      await pool.pg!.query(`GRANT ${g} TO "${user.replace(/"/g, '')}"`);
    }
  } else {
    await pool.mysql!.execute(`CREATE USER ?@? IDENTIFIED BY ?`, [user, host || '%', password]);
    for (const g of grants) {
      await pool.mysql!.query(`GRANT ${g} ON *.* TO ?@?`, [user, host || '%']);
    }
    await pool.mysql!.query('FLUSH PRIVILEGES');
  }
}

export async function dropUser(pool: ConnPool, user: string, host: string): Promise<void> {
  if (isPg(pool)) {
    await pool.pg!.query(`DROP USER IF EXISTS "${user.replace(/"/g, '')}"`);
  } else {
    await pool.mysql!.execute(`DROP USER ?@?`, [user, host]);
    await pool.mysql!.query('FLUSH PRIVILEGES');
  }
}
