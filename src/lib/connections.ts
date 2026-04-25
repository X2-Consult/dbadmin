import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { Pool as PgPool } from 'pg';

export type DbType = 'mariadb' | 'mysql' | 'postgres';

export interface ConnectionConfig {
  id: string;
  name: string;
  type: DbType;
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string; // required for postgres, optional for mysql/mariadb
  ssl?: boolean;
}

export interface ConnPool {
  config: ConnectionConfig;
  mysql?: mysql.Pool;
  pg?: PgPool;
}

const DATA_FILE = path.join(process.cwd(), 'data', 'connections.json');
const pools = new Map<string, ConnPool>();

function defaultConn(): ConnectionConfig {
  return {
    id: 'default',
    name: process.env.DB_NAME || 'Local (default)',
    type: 'mariadb',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
  };
}

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
}

export function listConnections(): ConnectionConfig[] {
  try {
    ensureDataFile();
    const saved: ConnectionConfig[] = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return [defaultConn(), ...saved];
  } catch {
    return [defaultConn()];
  }
}

export function saveConnection(conn: ConnectionConfig): void {
  ensureDataFile();
  const existing = listConnections().filter(c => c.id !== 'default' && c.id !== conn.id);
  fs.writeFileSync(DATA_FILE, JSON.stringify([...existing, conn], null, 2));
}

export function removeConnection(id: string): void {
  ensureDataFile();
  const remaining = listConnections().filter(c => c.id !== 'default' && c.id !== id);
  fs.writeFileSync(DATA_FILE, JSON.stringify(remaining, null, 2));
  const p = pools.get(id);
  if (p?.mysql) p.mysql.end().catch(() => {});
  if (p?.pg) p.pg.end().catch(() => {});
  pools.delete(id);
}

export async function getConnPool(id = 'default'): Promise<ConnPool> {
  if (pools.has(id)) return pools.get(id)!;

  const config = listConnections().find(c => c.id === id);
  if (!config) throw new Error(`Connection '${id}' not found`);

  if (config.type === 'postgres') {
    const pg = new PgPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database || 'postgres',
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
    const pool: ConnPool = { config, pg };
    pools.set(id, pool);
    return pool;
  } else {
    const pool: ConnPool = {
      config,
      mysql: mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        multipleStatements: true,
        waitForConnections: true,
        connectionLimit: 10,
        timezone: '+00:00',
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      }),
    };
    pools.set(id, pool);
    return pool;
  }
}
