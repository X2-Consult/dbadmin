/**
 * Unified query adapter over MySQL/MariaDB and PostgreSQL.
 * All table/schema identifiers are sanitized via allow-listed characters.
 * Query params use native parameterisation for user-supplied values.
 */
import type { ConnPool } from './connections';
import type { ResultSetHeader } from 'mysql2';
import type { QueryResult as PgResult } from 'pg';
import { escape as mysqlEscape } from 'mysql2';

const isPg = (p: ConnPool) => p.config.type === 'postgres';

function qi(name: string, pg: boolean) {
  const safe = name.replace(/[^\w$]/g, '');
  return pg ? `"${safe}"` : `\`${safe}\``;
}

const ALLOWED_PRIVILEGES = new Set([
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'INDEX', 'ALTER',
  'CREATE TEMPORARY TABLES', 'LOCK TABLES', 'EXECUTE', 'CREATE VIEW', 'SHOW VIEW',
  'CREATE ROUTINE', 'ALTER ROUTINE', 'EVENT', 'TRIGGER', 'REFERENCES',
  // PostgreSQL-specific
  'CONNECT', 'TEMPORARY', 'USAGE',
]);

function validateGrant(g: string): string {
  const trimmed = g.trim().toUpperCase();
  if (!ALLOWED_PRIVILEGES.has(trimmed)) throw new Error(`Privilege not allowed: ${g}`);
  return trimmed;
}

function assertWritable(pool: ConnPool) {
  if (pool.config.readonly) throw new Error('Connection is read-only');
}

// ─── Databases / schemas ──────────────────────────────────────────────────────

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

export async function dropDatabase(pool: ConnPool, db: string): Promise<void> {
  assertWritable(pool);
  const pg = isPg(pool);
  if (pg) {
    await pool.pg!.query(`DROP SCHEMA ${qi(db, true)} CASCADE`);
  } else {
    await pool.mysql!.query(`DROP DATABASE ${qi(db, false)}`);
  }
}

// ─── Tables ───────────────────────────────────────────────────────────────────

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
    `SHOW FULL TABLES FROM ${qi(db, false)} WHERE Table_type = 'BASE TABLE'`
  ) as [Record<string, string>[], unknown];
  return rows.map(r => r[`Tables_in_${db}`]);
}

export async function listViews(pool: ConnPool, db: string): Promise<string[]> {
  if (isPg(pool)) {
    const { rows } = await pool.pg!.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.views
       WHERE table_schema = $1 ORDER BY table_name`,
      [db]
    );
    return rows.map(r => r.table_name);
  }
  const [rows] = await pool.mysql!.query(
    `SHOW FULL TABLES FROM ${qi(db, false)} WHERE Table_type = 'VIEW'`
  ) as [Record<string, string>[], unknown];
  return rows.map(r => r[`Tables_in_${db}`]);
}

// ─── Row data ─────────────────────────────────────────────────────────────────

export async function getTableData(
  pool: ConnPool, db: string, table: string,
  page: number, pageSize: number,
  filters?: Record<string, string>,
  orderBy?: string, orderDir?: 'asc' | 'desc'
): Promise<{ rows: unknown[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const pg = isPg(pool);
  const q = qi(db, pg) + '.' + qi(table, pg);
  const dir = orderDir === 'desc' ? 'DESC' : 'ASC';
  const orderSql = orderBy ? ` ORDER BY ${qi(orderBy, pg)} ${dir}` : '';

  if (pg) {
    const filterEntries = Object.entries(filters ?? {}).filter(([, v]) => v.trim());
    let whereSql = '';
    const whereParams: string[] = [];
    let paramIdx = 3;
    if (filterEntries.length > 0) {
      const clauses = filterEntries.map(([col, val]) => {
        whereParams.push(`%${val}%`);
        return `${qi(col, true)}::text ILIKE $${paramIdx++}`;
      });
      whereSql = 'WHERE ' + clauses.join(' AND ');
    }
    const [cntRes, dataRes] = await Promise.all([
      pool.pg!.query<{ total: string }>(`SELECT COUNT(*)::int AS total FROM ${q} ${whereSql}`, whereParams),
      pool.pg!.query(`SELECT * FROM ${q} ${whereSql}${orderSql} LIMIT $1 OFFSET $2`, [pageSize, offset, ...whereParams]),
    ]);
    return { rows: dataRes.rows, total: parseInt(cntRes.rows[0].total) };
  }

  const filterEntries = Object.entries(filters ?? {}).filter(([, v]) => v.trim());
  let whereSql = '';
  const whereParams: string[] = [];
  if (filterEntries.length > 0) {
    const clauses = filterEntries.map(([col, val]) => {
      whereParams.push(`%${val}%`);
      return `${qi(col, false)} LIKE ?`;
    });
    whereSql = 'WHERE ' + clauses.join(' AND ');
  }
  const [[countRow]] = await pool.mysql!.execute(
    `SELECT COUNT(*) as total FROM ${q} ${whereSql}`, whereParams
  ) as [Array<{ total: number }>, unknown];
  const [rows] = await pool.mysql!.execute(
    `SELECT * FROM ${q} ${whereSql}${orderSql} LIMIT ? OFFSET ?`, [...whereParams, pageSize, offset]
  ) as [unknown[], unknown];
  return { rows: rows as unknown[], total: countRow.total };
}

// ─── Structure ────────────────────────────────────────────────────────────────

interface ColumnInfo { Field: string; Type: string; Null: string; Key: string; Default: unknown; Extra: string; }
interface IndexInfo  { Key_name: string; Column_name: string; Non_unique: number; Index_type: string; }
export interface FKInfo  { column: string; ref_table: string; ref_column: string; on_update: string; on_delete: string; }

export async function getTableStructure(
  pool: ConnPool, db: string, table: string
): Promise<{ columns: ColumnInfo[]; indexes: IndexInfo[]; foreignKeys: FKInfo[] }> {
  if (isPg(pool)) {
    // Use pg_catalog instead of information_schema.constraint_column_usage:
    // the information_schema view only shows columns owned by the current role,
    // so FKs referencing tables owned by a different user return no rows.
    // pg_catalog has no such ownership filter and correctly handles composite FKs.
    const { rows: fks } = await pool.pg!.query<FKInfo>(
      `SELECT
         a.attname  AS column,
         tf.relname AS ref_table,
         af.attname AS ref_column,
         CASE c.confupdtype
           WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
           WHEN 'c' THEN 'CASCADE'   WHEN 'n' THEN 'SET NULL'
           WHEN 'd' THEN 'SET DEFAULT' ELSE 'NO ACTION'
         END AS on_update,
         CASE c.confdeltype
           WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
           WHEN 'c' THEN 'CASCADE'   WHEN 'n' THEN 'SET NULL'
           WHEN 'd' THEN 'SET DEFAULT' ELSE 'NO ACTION'
         END AS on_delete
       FROM pg_constraint c
       JOIN pg_class t   ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_class tf  ON tf.oid = c.confrelid
       JOIN LATERAL UNNEST(c.conkey)  WITH ORDINALITY AS k(num, ord)  ON true
       JOIN pg_attribute a  ON a.attrelid  = c.conrelid  AND a.attnum  = k.num
       JOIN LATERAL UNNEST(c.confkey) WITH ORDINALITY AS kf(num, ord) ON kf.ord = k.ord
       JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = kf.num
       WHERE c.contype = 'f' AND n.nspname = $1 AND t.relname = $2`,
      [db, table]
    );
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
    return { columns: cols, indexes: idxs, foreignKeys: fks };
  }
  const q = qi(db, false) + '.' + qi(table, false);
  const [columns] = await pool.mysql!.query(`DESCRIBE ${q}`) as [ColumnInfo[], unknown];
  const [indexes] = await pool.mysql!.query(`SHOW INDEX FROM ${q}`) as [IndexInfo[], unknown];
  const [fkRows] = await pool.mysql!.execute(
    `SELECT
       kcu.COLUMN_NAME           AS \`column\`,
       kcu.REFERENCED_TABLE_NAME AS ref_table,
       kcu.REFERENCED_COLUMN_NAME AS ref_column,
       rc.UPDATE_RULE             AS on_update,
       rc.DELETE_RULE             AS on_delete
     FROM information_schema.KEY_COLUMN_USAGE kcu
     JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_NAME   = kcu.CONSTRAINT_NAME
      AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
     WHERE kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ?
       AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`,
    [db, table]
  ) as [FKInfo[], unknown];
  return { columns, indexes, foreignKeys: fkRows };
}

// ─── DDL ──────────────────────────────────────────────────────────────────────

export async function getCreateStatement(pool: ConnPool, db: string, table: string): Promise<string> {
  if (isPg(pool)) {
    const { columns, indexes } = await getTableStructure(pool, db, table);
    const cols = columns.map(c => {
      let def = `  ${qi(c.Field, true)} ${c.Type}`;
      if (c.Extra === 'auto_increment') def += ' GENERATED ALWAYS AS IDENTITY';
      if (c.Null === 'NO') def += ' NOT NULL';
      if (c.Default !== null && c.Default !== undefined && c.Extra !== 'auto_increment') def += ` DEFAULT ${c.Default}`;
      return def;
    }).join(',\n');
    const pks = columns.filter(c => c.Key === 'PRI').map(c => qi(c.Field, true)).join(', ');
    const pkLine = pks ? `,\n  PRIMARY KEY (${pks})` : '';
    return `CREATE TABLE ${qi(db, true)}.${qi(table, true)} (\n${cols}${pkLine}\n);`;
  }
  const q = qi(db, false) + '.' + qi(table, false);
  const [[row]] = await pool.mysql!.query(`SHOW CREATE TABLE ${q}`) as [Array<Record<string, string>>, unknown];
  return row['Create Table'] || '';
}

// ─── Insert / Update / Delete ─────────────────────────────────────────────────

export async function insertRow(
  pool: ConnPool, db: string, table: string, data: Record<string, unknown>
): Promise<{ insertId?: number }> {
  assertWritable(pool);
  const keys = Object.keys(data);
  const vals = Object.values(data);
  const q = qi(db, isPg(pool)) + '.' + qi(table, isPg(pool));
  if (isPg(pool)) {
    const cols = keys.map(k => qi(k, true)).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    await pool.pg!.query(`INSERT INTO ${q} (${cols}) VALUES (${placeholders})`, vals);
    return { insertId: undefined };
  }
  const cols = keys.map(k => qi(k, false)).join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  const [result] = await pool.mysql!.execute(`INSERT INTO ${q} (${cols}) VALUES (${placeholders})`, vals as string[]);
  return { insertId: (result as ResultSetHeader).insertId };
}

export async function updateRow(
  pool: ConnPool, db: string, table: string,
  fields: Record<string, unknown>, pk: Record<string, unknown>
): Promise<void> {
  assertWritable(pool);
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
    await pool.mysql!.execute(`UPDATE ${q} SET ${set} WHERE ${where}`, [...Object.values(fields), ...Object.values(pk)] as string[]);
  }
}

export async function deleteRow(
  pool: ConnPool, db: string, table: string, pk: Record<string, unknown>
): Promise<void> {
  assertWritable(pool);
  const q = qi(db, isPg(pool)) + '.' + qi(table, isPg(pool));
  const pkKeys = Object.keys(pk);
  if (isPg(pool)) {
    let i = 1;
    const where = pkKeys.map(k => `${qi(k, true)} = $${i++}`).join(' AND ');
    await pool.pg!.query(`DELETE FROM ${q} WHERE ${where}`, Object.values(pk));
  } else {
    const where = pkKeys.map(k => `${qi(k, false)} = ?`).join(' AND ');
    await pool.mysql!.execute(`DELETE FROM ${q} WHERE ${where} LIMIT 1`, Object.values(pk) as string[]);
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

export async function execExplain(pool: ConnPool, sql: string, db?: string): Promise<ExecResult> {
  const explainSql = isPg(pool) ? `EXPLAIN (FORMAT JSON, ANALYZE false) ${sql}` : `EXPLAIN ${sql}`;
  return execQuery(pool, explainSql, db);
}

// ─── Overview stats ───────────────────────────────────────────────────────────

export interface OverviewStats {
  server: {
    version: string; uptime: number; maxConnections: number; openConnections: number;
    cacheHitRate?: number;
    totalCommits?: number;
    totalRollbacks?: number;
    deadlocks?: number;
    tempBytes?: number;
  };
  databases: Array<{
    database: string; tableCount: number; totalSize: number;
    dataSize: number; indexSize: number; estimatedRows: number;
  }>;
}

export async function getOverviewStats(pool: ConnPool): Promise<OverviewStats> {
  if (isPg(pool)) {
    const [verRes, upRes, connRes, dbRes, healthRes] = await Promise.all([
      pool.pg!.query<{ version: string }>('SELECT version()'),
      pool.pg!.query<{ uptime: string }>(
        `SELECT EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))::int AS uptime`
      ),
      pool.pg!.query<{ total: string; max: string }>(
        `SELECT count(*)::int AS total,
                (SELECT setting::int FROM pg_settings WHERE name='max_connections') AS max
         FROM pg_stat_activity`
      ),
      pool.pg!.query<{ database: string; totalSize: string; tableCount: string; dataSize: string; indexSize: string; estimatedRows: string }>(
        `SELECT
           d.datname AS database,
           pg_database_size(d.datname)::bigint AS "totalSize",
           COALESCE((
             SELECT COUNT(c.relname)::int
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind = 'r'
               AND n.nspname NOT IN ('information_schema','pg_catalog','pg_toast')
               AND n.nspname NOT LIKE 'pg_temp%'
               AND d.datname = current_database()
           ), 0) AS "tableCount",
           COALESCE((
             SELECT SUM(pg_relation_size(c.oid))::bigint
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind = 'r'
               AND n.nspname NOT IN ('information_schema','pg_catalog','pg_toast')
               AND d.datname = current_database()
           ), 0) AS "dataSize",
           COALESCE((
             SELECT SUM(pg_indexes_size(c.oid))::bigint
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind = 'r'
               AND n.nspname NOT IN ('information_schema','pg_catalog','pg_toast')
               AND d.datname = current_database()
           ), 0) AS "indexSize",
           COALESCE((
             SELECT SUM(c.reltuples)::bigint
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind = 'r'
               AND n.nspname NOT IN ('information_schema','pg_catalog','pg_toast')
               AND d.datname = current_database()
           ), 0) AS "estimatedRows"
         FROM pg_database d
         WHERE d.datistemplate = false
         ORDER BY "totalSize" DESC`
      ),
      pool.pg!.query<{ cache_hit_rate: string; xact_commit: string; xact_rollback: string; temp_bytes: string; deadlocks: string }>(
        `SELECT
           ROUND(
             sum(blks_hit) * 100.0 / NULLIF(sum(blks_hit + blks_read), 0),
             1
           ) AS cache_hit_rate,
           sum(xact_commit)::bigint   AS xact_commit,
           sum(xact_rollback)::bigint AS xact_rollback,
           sum(temp_bytes)::bigint    AS temp_bytes,
           sum(deadlocks)::bigint     AS deadlocks
         FROM pg_stat_database`
      ),
    ]);
    const ver = verRes.rows[0].version.split(' ').slice(0, 2).join(' ');
    const h = healthRes.rows[0];
    return {
      server: {
        version: ver,
        uptime: parseInt(upRes.rows[0].uptime),
        maxConnections: parseInt(connRes.rows[0].max),
        openConnections: parseInt(connRes.rows[0].total),
        cacheHitRate: h.cache_hit_rate != null ? parseFloat(h.cache_hit_rate) : undefined,
        totalCommits: Number(h.xact_commit),
        totalRollbacks: Number(h.xact_rollback),
        deadlocks: Number(h.deadlocks),
        tempBytes: Number(h.temp_bytes),
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
  const [[uptime], [version], [maxConn], [openConn], [dbSizes]] = await Promise.all([
    pool.mysql!.query(`SELECT VARIABLE_VALUE as val FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME='Uptime'`) as Promise<[Array<{ val: string }>, unknown]>,
    pool.mysql!.query(`SELECT VARIABLE_VALUE as val FROM information_schema.GLOBAL_VARIABLES WHERE VARIABLE_NAME='version'`) as Promise<[Array<{ val: string }>, unknown]>,
    pool.mysql!.query(`SELECT VARIABLE_VALUE as val FROM information_schema.GLOBAL_VARIABLES WHERE VARIABLE_NAME='max_connections'`) as Promise<[Array<{ val: string }>, unknown]>,
    pool.mysql!.query(`SELECT VARIABLE_VALUE as val FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME='Threads_connected'`) as Promise<[Array<{ val: string }>, unknown]>,
    pool.mysql!.query(`
      SELECT table_schema AS \`database\`,
             COUNT(*) AS tableCount,
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
    `SELECT User, Host, plugin, password_expired, account_locked FROM mysql.user ORDER BY User, Host`
  );
  return rows as DbUser[];
}

export async function createUser(
  pool: ConnPool, user: string, host: string, password: string, grants: string[]
): Promise<void> {
  assertWritable(pool);
  if (isPg(pool)) {
    const safeUser = user.replace(/[^\w$]/g, '');
    await pool.pg!.query(`CREATE USER "${safeUser}" WITH PASSWORD $1`, [password]);
    for (const g of grants) await pool.pg!.query(`GRANT ${validateGrant(g)} TO "${safeUser}"`);
  } else {
    await pool.mysql!.execute(`CREATE USER ?@? IDENTIFIED BY ?`, [user, host || '%', password]);
    for (const g of grants) await pool.mysql!.query(`GRANT ${validateGrant(g)} ON *.* TO ?@?`, [user, host || '%']);
    await pool.mysql!.query('FLUSH PRIVILEGES');
  }
}

export async function dropUser(pool: ConnPool, user: string, host: string): Promise<void> {
  assertWritable(pool);
  if (isPg(pool)) {
    await pool.pg!.query(`DROP USER IF EXISTS ${qi(user, true)}`);
  } else {
    await pool.mysql!.execute(`DROP USER ?@?`, [user, host]);
    await pool.mysql!.query('FLUSH PRIVILEGES');
  }
}

// ─── Index management ─────────────────────────────────────────────────────────

export async function createIndex(
  pool: ConnPool, db: string, table: string,
  name: string, columns: string[], unique: boolean
): Promise<void> {
  assertWritable(pool);
  const pg = isPg(pool);
  const q = qi(db, pg) + '.' + qi(table, pg);
  const cols = columns.map(c => qi(c, pg)).join(', ');
  const u = unique ? 'UNIQUE ' : '';
  if (pg) {
    await pool.pg!.query(`CREATE ${u}INDEX ${qi(name, true)} ON ${q} (${cols})`);
  } else {
    await pool.mysql!.query(`CREATE ${u}INDEX \`${name.replace(/`/g, '')}\` ON ${q} (${cols})`);
  }
}

export async function dropIndex(
  pool: ConnPool, db: string, table: string, name: string
): Promise<void> {
  assertWritable(pool);
  if (isPg(pool)) {
    await pool.pg!.query(`DROP INDEX IF EXISTS ${qi(name, true)}`);
  } else {
    await pool.mysql!.query(
      `DROP INDEX \`${name.replace(/`/g, '')}\` ON ${qi(db, false)}.${qi(table, false)}`
    );
  }
}

// ─── Create database ─────────────────────────────────────────────────────────

export async function createDatabase(
  pool: ConnPool, name: string, charset = 'utf8mb4', collation = 'utf8mb4_unicode_ci'
): Promise<void> {
  assertWritable(pool);
  if (isPg(pool)) {
    await pool.pg!.query(`CREATE SCHEMA ${qi(name, true)}`);
  } else {
    const cs = charset.replace(/[^\w]/g, '');
    const co = collation.replace(/[^\w_]/g, '');
    await pool.mysql!.query(`CREATE DATABASE ${qi(name, false)} CHARACTER SET ${cs} COLLATE ${co}`);
  }
}

// ─── Table DDL operations ─────────────────────────────────────────────────────

export async function dropTable(pool: ConnPool, db: string, table: string): Promise<void> {
  assertWritable(pool);
  const pg = isPg(pool);
  const sql = `DROP TABLE ${qi(db, pg)}.${qi(table, pg)}`;
  if (pg) await pool.pg!.query(sql); else await pool.mysql!.query(sql);
}

export async function truncateTable(pool: ConnPool, db: string, table: string): Promise<void> {
  assertWritable(pool);
  const pg = isPg(pool);
  const sql = `TRUNCATE TABLE ${qi(db, pg)}.${qi(table, pg)}`;
  if (pg) await pool.pg!.query(sql); else await pool.mysql!.query(sql);
}

export async function renameTable(
  pool: ConnPool, db: string, oldName: string, newName: string
): Promise<void> {
  assertWritable(pool);
  if (isPg(pool)) {
    await pool.pg!.query(
      `ALTER TABLE ${qi(db, true)}.${qi(oldName, true)} RENAME TO ${qi(newName, true)}`
    );
  } else {
    await pool.mysql!.query(
      `RENAME TABLE ${qi(db, false)}.${qi(oldName, false)} TO ${qi(db, false)}.${qi(newName, false)}`
    );
  }
}

// ─── Process list ─────────────────────────────────────────────────────────────

export interface ProcessEntry {
  id: number;
  user: string;
  host: string;
  db: string | null;
  command: string;
  time: number;
  state: string;
  info: string | null;
}

export async function getProcessList(pool: ConnPool): Promise<ProcessEntry[]> {
  if (isPg(pool)) {
    const { rows } = await pool.pg!.query(
      `SELECT pid::int AS id,
              COALESCE(usename,'') AS user,
              COALESCE(client_addr::text,'') AS host,
              datname AS db,
              COALESCE(state,'') AS command,
              COALESCE(EXTRACT(EPOCH FROM (now()-query_start))::int, 0) AS time,
              COALESCE(state,'') AS state,
              query AS info
       FROM pg_stat_activity
       WHERE state IS NOT NULL
       ORDER BY time DESC`
    );
    return rows as ProcessEntry[];
  }
  const [rows] = await pool.mysql!.query('SHOW FULL PROCESSLIST') as [Array<{
    Id: number; User: string; Host: string; db: string | null;
    Command: string; Time: number; State: string; Info: string | null;
  }>, unknown];
  return rows.map(r => ({
    id: r.Id, user: r.User, host: r.Host, db: r.db,
    command: r.Command, time: r.Time, state: r.State, info: r.Info,
  }));
}

export async function killProcess(pool: ConnPool, id: number): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid process id');
  if (isPg(pool)) {
    await pool.pg!.query(`SELECT pg_terminate_backend($1)`, [id]);
  } else {
    await pool.mysql!.query(`KILL ${id}`);
  }
}

// ─── CSV import ───────────────────────────────────────────────────────────────

export async function importCSVRows(
  pool: ConnPool, db: string, table: string,
  headers: string[], rows: string[][]
): Promise<{ imported: number }> {
  assertWritable(pool);
  const pg = isPg(pool);
  const q = qi(db, pg) + '.' + qi(table, pg);
  const cols = headers.map(h => qi(h, pg)).join(', ');
  let imported = 0;
  for (const row of rows) {
    if (pg) {
      const placeholders = row.map((_, i) => `$${i + 1}`).join(', ');
      await pool.pg!.query(`INSERT INTO ${q} (${cols}) VALUES (${placeholders})`, row);
    } else {
      const placeholders = headers.map(() => '?').join(', ');
      await pool.mysql!.execute(`INSERT INTO ${q} (${cols}) VALUES (${placeholders})`, row);
    }
    imported++;
  }
  return { imported };
}

// ─── SQL completions ──────────────────────────────────────────────────────────

export async function getCompletions(
  pool: ConnPool, db: string
): Promise<{ tables: string[]; columns: Array<{ table: string; column: string }> }> {
  if (isPg(pool)) {
    const [tRes, cRes] = await Promise.all([
      pool.pg!.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`,
        [db]
      ),
      pool.pg!.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = $1 ORDER BY table_name, ordinal_position`,
        [db]
      ),
    ]);
    return {
      tables: tRes.rows.map(r => r.table_name),
      columns: cRes.rows.map(r => ({ table: r.table_name, column: r.column_name })),
    };
  }
  const [tRows, cRows] = await Promise.all([
    pool.mysql!.execute(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name`,
      [db]
    ) as Promise<[Array<{ table_name: string }>, unknown]>,
    pool.mysql!.execute(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = ? ORDER BY table_name, ordinal_position`,
      [db]
    ) as Promise<[Array<{ table_name: string; column_name: string }>, unknown]>,
  ]);
  return {
    tables: tRows[0].map(r => r.table_name),
    columns: cRows[0].map(r => ({ table: r.table_name, column: r.column_name })),
  };
}

// ─── Routines ─────────────────────────────────────────────────────────────────

export interface Routine {
  name: string;
  type: string;
  language: string;
}

export async function listRoutines(pool: ConnPool, db: string): Promise<Routine[]> {
  if (isPg(pool)) {
    const { rows } = await pool.pg!.query(
      `SELECT p.proname AS name,
              CASE WHEN p.prokind = 'f' THEN 'FUNCTION' ELSE 'PROCEDURE' END AS type,
              l.lanname AS language
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       JOIN pg_language l ON l.oid = p.prolang
       WHERE n.nspname = $1 AND p.prokind IN ('f','p')
       ORDER BY type, name`,
      [db]
    );
    return rows as Routine[];
  }
  const [rows] = await pool.mysql!.execute(
    `SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS type,
            COALESCE(EXTERNAL_LANGUAGE,'SQL') AS language
     FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?
     ORDER BY ROUTINE_TYPE, ROUTINE_NAME`,
    [db]
  ) as [Routine[], unknown];
  return rows;
}

export async function getRoutineBody(
  pool: ConnPool, db: string, name: string, type: string
): Promise<string> {
  if (isPg(pool)) {
    const { rows } = await pool.pg!.query(
      `SELECT pg_get_functiondef(p.oid) AS body
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = $1 AND p.proname = $2 LIMIT 1`,
      [db, name]
    );
    return rows[0]?.body || '';
  }
  const isProc = type.toUpperCase() === 'PROCEDURE';
  const q = isProc
    ? `SHOW CREATE PROCEDURE ${qi(db, false)}.${qi(name, false)}`
    : `SHOW CREATE FUNCTION ${qi(db, false)}.${qi(name, false)}`;
  const [[row]] = await pool.mysql!.query(q) as [Array<Record<string, string>>, unknown];
  return row[isProc ? 'Create Procedure' : 'Create Function'] || '';
}

export async function dropRoutine(
  pool: ConnPool, db: string, name: string, type: string
): Promise<void> {
  assertWritable(pool);
  const pg = isPg(pool);
  const sql = `DROP ${type.toUpperCase()} IF EXISTS ${qi(db, pg)}.${qi(name, pg)}`;
  if (pg) await pool.pg!.query(sql); else await pool.mysql!.query(sql);
}

// ─── Triggers ─────────────────────────────────────────────────────────────────

export interface TriggerInfo {
  name: string;
  event: string;
  table: string;
  timing: string;
  body: string;
}

export async function listTriggers(pool: ConnPool, db: string): Promise<TriggerInfo[]> {
  if (isPg(pool)) {
    const { rows } = await pool.pg!.query(
      `SELECT t.trigger_name AS name, t.event_manipulation AS event,
              t.event_object_table AS "table", t.action_timing AS timing,
              t.action_statement AS body
       FROM information_schema.triggers t
       WHERE t.trigger_schema = $1
       ORDER BY event_object_table, trigger_name`,
      [db]
    );
    return rows as TriggerInfo[];
  }
  const [rows] = await pool.mysql!.execute(
    `SELECT TRIGGER_NAME AS name, EVENT_MANIPULATION AS event,
            EVENT_OBJECT_TABLE AS \`table\`, ACTION_TIMING AS timing,
            ACTION_STATEMENT AS body
     FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?
     ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME`,
    [db]
  ) as [TriggerInfo[], unknown];
  return rows;
}

export async function dropTrigger(
  pool: ConnPool, db: string, name: string, table: string
): Promise<void> {
  assertWritable(pool);
  if (isPg(pool)) {
    await pool.pg!.query(
      `DROP TRIGGER IF EXISTS ${qi(name, true)} ON ${qi(db, true)}.${qi(table, true)}`
    );
  } else {
    await pool.mysql!.query(`DROP TRIGGER IF EXISTS ${qi(db, false)}.${qi(name, false)}`);
  }
}

// ─── Events (MySQL/MariaDB only) ──────────────────────────────────────────────

export interface EventInfo {
  name: string;
  status: string;
  type: string;
  executeAt: string | null;
  intervalValue: string | null;
  intervalField: string | null;
  body: string;
}

export async function listEvents(pool: ConnPool, db: string): Promise<EventInfo[]> {
  if (isPg(pool)) return [];
  const [rows] = await pool.mysql!.execute(
    `SELECT EVENT_NAME AS name, STATUS AS status, EVENT_TYPE AS type,
            EXECUTE_AT AS executeAt, INTERVAL_VALUE AS intervalValue,
            INTERVAL_FIELD AS intervalField, EVENT_DEFINITION AS body
     FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ?
     ORDER BY EVENT_NAME`,
    [db]
  ) as [EventInfo[], unknown];
  return rows;
}

export async function dropEvent(pool: ConnPool, db: string, name: string): Promise<void> {
  assertWritable(pool);
  if (!isPg(pool)) {
    await pool.mysql!.query(`DROP EVENT IF EXISTS ${qi(db, false)}.${qi(name, false)}`);
  }
}

// ─── Server variables ─────────────────────────────────────────────────────────

export interface ServerVariable {
  name: string;
  value: string;
  category: string;
  description: string;
}

export async function getServerVariables(pool: ConnPool): Promise<ServerVariable[]> {
  if (isPg(pool)) {
    const { rows } = await pool.pg!.query(
      `SELECT name, setting AS value, category, short_desc AS description
       FROM pg_settings ORDER BY category, name`
    );
    return rows as ServerVariable[];
  }
  const [rows] = await pool.mysql!.query(
    'SHOW VARIABLES'
  ) as [Array<{ Variable_name: string; Value: string }>, unknown];
  return rows.map(r => ({
    name: r.Variable_name,
    value: r.Value,
    category: r.Variable_name.split('_')[0],
    description: '',
  }));
}

// ─── Table maintenance ────────────────────────────────────────────────────────

export type MaintenanceOp = 'OPTIMIZE' | 'ANALYZE' | 'REPAIR' | 'CHECK';

export async function tableMaintenanceOp(
  pool: ConnPool, db: string, table: string, op: MaintenanceOp
): Promise<Array<Record<string, string>>> {
  const pg = isPg(pool);
  const q = qi(db, pg) + '.' + qi(table, pg);
  if (pg) {
    const pgSql = op === 'OPTIMIZE' || op === 'REPAIR' ? `VACUUM ANALYZE ${q}` : `ANALYZE ${q}`;
    await pool.pg!.query(pgSql);
    return [{ Table: `${db}.${table}`, Op: op, Msg_type: 'status', Msg_text: 'OK' }];
  }
  const [rows] = await pool.mysql!.query(`${op} TABLE ${q}`) as [Array<Record<string, string>>, unknown];
  return rows;
}

// ─── Alter column ─────────────────────────────────────────────────────────────

export interface AlterColumnDef {
  newName: string;
  type: string;
  notNull: boolean;
  defaultVal: string;
  autoIncrement: boolean;
}

export async function alterColumn(
  pool: ConnPool, db: string, table: string,
  oldName: string, def: AlterColumnDef
): Promise<void> {
  assertWritable(pool);
  const pg = isPg(pool);
  const q = qi(db, pg) + '.' + qi(table, pg);
  const col = qi(oldName, pg);
  const safeType = def.type.replace(/[^\w\s(),]/g, '');

  if (pg) {
    if (safeType) {
      await pool.pg!.query(
        `ALTER TABLE ${q} ALTER COLUMN ${col} TYPE ${safeType} USING ${col}::text::${safeType}`
      );
    }
    if (def.notNull) {
      await pool.pg!.query(`ALTER TABLE ${q} ALTER COLUMN ${col} SET NOT NULL`);
    } else {
      await pool.pg!.query(`ALTER TABLE ${q} ALTER COLUMN ${col} DROP NOT NULL`);
    }
    if (def.defaultVal.trim()) {
      await pool.pg!.query(
        `ALTER TABLE ${q} ALTER COLUMN ${col} SET DEFAULT $1`,
        [def.defaultVal]
      );
    } else {
      await pool.pg!.query(`ALTER TABLE ${q} ALTER COLUMN ${col} DROP DEFAULT`);
    }
    if (def.newName && def.newName !== oldName) {
      await pool.pg!.query(
        `ALTER TABLE ${q} RENAME COLUMN ${col} TO ${qi(def.newName, true)}`
      );
    }
  } else {
    const nn = def.notNull ? ' NOT NULL' : '';
    const dflt = def.defaultVal.trim() ? ` DEFAULT ${mysqlEscape(def.defaultVal)}` : '';
    const ai = def.autoIncrement ? ' AUTO_INCREMENT' : '';
    if (def.newName && def.newName !== oldName) {
      await pool.mysql!.query(
        `ALTER TABLE ${q} CHANGE COLUMN ${col} ${qi(def.newName, false)} ${safeType}${nn}${dflt}${ai}`
      );
    } else {
      await pool.mysql!.query(
        `ALTER TABLE ${q} MODIFY COLUMN ${col} ${safeType}${nn}${dflt}${ai}`
      );
    }
  }
}

// ─── Views ─────────────────────────────────────────────────────────────────────

export async function getViewBody(pool: ConnPool, db: string, name: string): Promise<string> {
  if (isPg(pool)) {
    const { rows } = await pool.pg!.query<{ view_definition: string }>(
      `SELECT view_definition FROM information_schema.views
       WHERE table_schema = $1 AND table_name = $2`,
      [db, name]
    );
    return rows[0]?.view_definition || '';
  }
  const [[row]] = await pool.mysql!.query(
    `SHOW CREATE VIEW ${qi(db, false)}.${qi(name, false)}`
  ) as [Array<Record<string, string>>, unknown];
  return row['Create View'] || '';
}

export async function createOrReplaceView(
  pool: ConnPool, db: string, name: string, query: string
): Promise<void> {
  assertWritable(pool);
  const pg = isPg(pool);
  const safeName = name.replace(/[^\w$]/g, '');
  if (pg) {
    await pool.pg!.query(`SET search_path TO ${qi(db, true)}`);
    await pool.pg!.query(
      `CREATE OR REPLACE VIEW ${qi(db, true)}.${qi(safeName, true)} AS ${query}`
    );
  } else {
    await pool.mysql!.query(`USE ${qi(db, false)}`);
    await pool.mysql!.query(
      `CREATE OR REPLACE VIEW ${qi(db, false)}.${qi(safeName, false)} AS ${query}`
    );
  }
}

export async function dropView(pool: ConnPool, db: string, name: string): Promise<void> {
  assertWritable(pool);
  const pg = isPg(pool);
  const sql = `DROP VIEW IF EXISTS ${qi(db, pg)}.${qi(name, pg)}`;
  if (pg) await pool.pg!.query(sql); else await pool.mysql!.query(sql);
}

// ─── Copy table ───────────────────────────────────────────────────────────────

export async function copyTable(
  pool: ConnPool, db: string, srcTable: string,
  destTable: string, includeData: boolean
): Promise<void> {
  assertWritable(pool);
  const pg = isPg(pool);
  const src = qi(db, pg) + '.' + qi(srcTable, pg);
  const dst = qi(db, pg) + '.' + qi(destTable, pg);
  if (pg) {
    await pool.pg!.query(`CREATE TABLE ${dst} (LIKE ${src} INCLUDING ALL)`);
    if (includeData) await pool.pg!.query(`INSERT INTO ${dst} SELECT * FROM ${src}`);
  } else {
    if (includeData) {
      await pool.mysql!.query(`CREATE TABLE ${dst} SELECT * FROM ${src}`);
    } else {
      await pool.mysql!.query(`CREATE TABLE ${dst} LIKE ${src}`);
    }
  }
}

// ─── Full database search ─────────────────────────────────────────────────────

export interface SearchHit {
  table: string;
  column: string;
  value: string;
  pk: Record<string, unknown>;
}

export async function searchDatabase(
  pool: ConnPool, db: string, term: string, maxHits = 200
): Promise<SearchHit[]> {
  const pg = isPg(pool);
  const tables = await listTables(pool, db);
  const hits: SearchHit[] = [];
  const escaped = `%${term}%`;

  for (const table of tables) {
    if (hits.length >= maxHits) break;
    const { columns } = await getTableStructure(pool, db, table);
    const pkCols = columns.filter(c => c.Key === 'PRI').map(c => c.Field);
    const textCols = columns.filter(c => {
      const t = c.Type.toLowerCase();
      return t.includes('char') || t.includes('text') || t.includes('varchar') ||
             t.includes('enum') || t === 'tinytext' || t === 'mediumtext' || t === 'longtext';
    });
    if (!textCols.length) continue;

    const q = qi(db, pg) + '.' + qi(table, pg);
    const selectCols = [...new Set([...pkCols, ...textCols.map(c => c.Field)])].map(c => qi(c, pg)).join(', ');

    if (pg) {
      const where = textCols.map((c, i) => `${qi(c.Field, true)}::text ILIKE $${i + 1}`).join(' OR ');
      const params = textCols.map(() => escaped);
      const { rows } = await pool.pg!.query(`SELECT ${selectCols} FROM ${q} WHERE ${where} LIMIT 50`, params);
      for (const row of rows) {
        for (const col of textCols) {
          const val = row[col.Field];
          if (val != null && String(val).toLowerCase().includes(term.toLowerCase())) {
            const pk: Record<string, unknown> = {};
            pkCols.forEach(k => { pk[k] = row[k]; });
            hits.push({ table, column: col.Field, value: String(val), pk });
            if (hits.length >= maxHits) break;
          }
        }
        if (hits.length >= maxHits) break;
      }
    } else {
      const where = textCols.map(c => `${qi(c.Field, false)} LIKE ?`).join(' OR ');
      const params = textCols.map(() => escaped);
      const [rows] = await pool.mysql!.execute(
        `SELECT ${selectCols} FROM ${q} WHERE ${where} LIMIT 50`, params
      ) as [Record<string, unknown>[], unknown];
      for (const row of rows) {
        for (const col of textCols) {
          const val = row[col.Field];
          if (val != null && String(val).toLowerCase().includes(term.toLowerCase())) {
            const pk: Record<string, unknown> = {};
            pkCols.forEach(k => { pk[k] = row[k]; });
            hits.push({ table, column: col.Field, value: String(val), pk });
            if (hits.length >= maxHits) break;
          }
        }
        if (hits.length >= maxHits) break;
      }
    }
  }
  return hits;
}

// ─── ER diagram data ──────────────────────────────────────────────────────────

export interface ERTable {
  name: string;
  columns: Array<{ name: string; type: string; pk: boolean; fk: boolean }>;
}

export interface ERRelation {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export async function getERData(
  pool: ConnPool, db: string
): Promise<{ tables: ERTable[]; relations: ERRelation[] }> {
  const tableNames = await listTables(pool, db);
  const tables: ERTable[] = [];
  const relations: ERRelation[] = [];

  await Promise.all(tableNames.map(async name => {
    const { columns, foreignKeys } = await getTableStructure(pool, db, name);
    const fkCols = new Set(foreignKeys.map(fk => fk.column));
    tables.push({
      name,
      columns: columns.map(c => ({
        name: c.Field,
        type: c.Type,
        pk: c.Key === 'PRI',
        fk: fkCols.has(c.Field),
      })),
    });
    for (const fk of foreignKeys) {
      relations.push({
        fromTable: name,
        fromColumn: fk.column,
        toTable: fk.ref_table,
        toColumn: fk.ref_column,
      });
    }
  }));

  tables.sort((a, b) => a.name.localeCompare(b.name));
  return { tables, relations };
}

// ─── Top queries / slow query log ─────────────────────────────────────────────

export interface SlowQuery {
  query: string;
  calls: number;
  avgMs: number;
  maxMs: number;
  totalMs: number;
}

export type QueryPeriod = 'hour' | 'day' | 'week' | 'all';

export async function resetQueryStats(pool: ConnPool): Promise<void> {
  if (!isPg(pool)) throw new Error('Reset is only supported for PostgreSQL');
  await pool.pg!.query('SELECT pg_stat_statements_reset()');
}

export async function getTopQueries(pool: ConnPool, period: QueryPeriod = 'all'): Promise<SlowQuery[]> {
  if (isPg(pool)) {
    // pg_stat_statements has no per-query timestamps — always cumulative since last reset
    const { rows } = await pool.pg!.query<{
      query: string; calls: string; mean_exec_time: string;
      max_exec_time: string; total_exec_time: string;
    }>(
      `SELECT query, calls, mean_exec_time, max_exec_time, total_exec_time
       FROM pg_stat_statements
       ORDER BY mean_exec_time DESC LIMIT 50`
    );
    return rows.map(r => ({
      query: r.query,
      calls: Number(r.calls),
      avgMs: Math.round(Number(r.mean_exec_time)),
      maxMs: Math.round(Number(r.max_exec_time)),
      totalMs: Math.round(Number(r.total_exec_time)),
    }));
  }
  const intervalSql: Record<QueryPeriod, string> = {
    hour: `AND LAST_SEEN >= NOW() - INTERVAL 1 HOUR`,
    day:  `AND LAST_SEEN >= NOW() - INTERVAL 1 DAY`,
    week: `AND LAST_SEEN >= NOW() - INTERVAL 7 DAY`,
    all:  '',
  };
  try {
    const [rows] = await pool.mysql!.query(
      `SELECT DIGEST_TEXT AS query,
              COUNT_STAR AS calls,
              ROUND(AVG_TIMER_WAIT / 1000000000, 2) AS avgMs,
              ROUND(MAX_TIMER_WAIT / 1000000000, 2) AS maxMs,
              ROUND(SUM_TIMER_WAIT / 1000000000, 2) AS totalMs
       FROM performance_schema.events_statements_summary_by_digest
       WHERE DIGEST_TEXT IS NOT NULL ${intervalSql[period]}
       ORDER BY AVG_TIMER_WAIT DESC LIMIT 50`
    ) as [Array<{ query: string; calls: number; avgMs: number; maxMs: number; totalMs: number }>, unknown];
    return rows.map(r => ({
      query: r.query,
      calls: Number(r.calls),
      avgMs: Number(r.avgMs),
      maxMs: Number(r.maxMs),
      totalMs: Number(r.totalMs),
    }));
  } catch {
    return [];
  }
}

// ─── Schema diff ──────────────────────────────────────────────────────────────

export interface SchemaDiffResult {
  onlyInA: string[];
  onlyInB: string[];
  modified: Array<{
    table: string;
    addedColumns: string[];
    removedColumns: string[];
    changedColumns: Array<{ name: string; typeA: string; typeB: string }>;
  }>;
}

export async function getSchemaDiff(
  poolA: ConnPool, dbA: string,
  poolB: ConnPool, dbB: string
): Promise<SchemaDiffResult> {
  const [tablesA, tablesB] = await Promise.all([
    listTables(poolA, dbA),
    listTables(poolB, dbB),
  ]);
  const setA = new Set(tablesA);
  const setB = new Set(tablesB);

  const onlyInA = tablesA.filter(t => !setB.has(t));
  const onlyInB = tablesB.filter(t => !setA.has(t));
  const shared = tablesA.filter(t => setB.has(t));

  const modified: SchemaDiffResult['modified'] = [];
  await Promise.all(shared.map(async table => {
    const [{ columns: colsA }, { columns: colsB }] = await Promise.all([
      getTableStructure(poolA, dbA, table),
      getTableStructure(poolB, dbB, table),
    ]);
    const mapA = new Map(colsA.map(c => [c.Field, c.Type]));
    const mapB = new Map(colsB.map(c => [c.Field, c.Type]));
    const addedColumns = colsB.filter(c => !mapA.has(c.Field)).map(c => c.Field);
    const removedColumns = colsA.filter(c => !mapB.has(c.Field)).map(c => c.Field);
    const changedColumns = colsA
      .filter(c => mapB.has(c.Field) && mapB.get(c.Field) !== c.Type)
      .map(c => ({ name: c.Field, typeA: c.Type, typeB: mapB.get(c.Field)! }));
    if (addedColumns.length || removedColumns.length || changedColumns.length) {
      modified.push({ table, addedColumns, removedColumns, changedColumns });
    }
  }));

  return { onlyInA, onlyInB, modified };
}
