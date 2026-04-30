import fs from 'fs';
import path from 'path';
import net from 'net';
import mysql from 'mysql2/promise';
import { Pool as PgPool } from 'pg';
import { encryptPassword, decryptPassword } from './crypto';

export type DbType = 'mariadb' | 'mysql' | 'postgres';
export type SslMode = 'disable' | 'require' | 'verify';

export interface ConnectionConfig {
  id: string;
  name: string;
  type: DbType;
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string;
  ssl?: boolean;
  sslMode?: SslMode;
  readonly?: boolean;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshPassword?: string;
  sshKey?: string;
}

export interface ConnPool {
  config: ConnectionConfig;
  mysql?: mysql.Pool;
  pg?: PgPool;
}

const DATA_FILE = path.join(process.cwd(), 'data', 'connections.json');
const pools = new Map<string, ConnPool>();
const tunnels = new Map<string, { server: net.Server; ssh: unknown }>();

function defaultConn(): ConnectionConfig {
  return {
    id: 'default',
    name: process.env.DB_NAME || 'Local (default)',
    type: 'mariadb',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    readonly: process.env.DB_READONLY === 'true',
  };
}

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
}

function atomicWrite(file: string, data: string): void {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, file);
}

function decryptConfig(conn: ConnectionConfig): ConnectionConfig {
  return {
    ...conn,
    password: decryptPassword(conn.password),
    sshPassword: conn.sshPassword ? decryptPassword(conn.sshPassword) : conn.sshPassword,
    sshKey:      conn.sshKey      ? decryptPassword(conn.sshKey)      : conn.sshKey,
  };
}

export function listConnections(): ConnectionConfig[] {
  try {
    ensureDataFile();
    const saved: ConnectionConfig[] = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const decrypted = saved.map(decryptConfig);
    const savedDefault = decrypted.find(c => c.id === 'default');
    const others = decrypted.filter(c => c.id !== 'default');
    return [savedDefault ?? defaultConn(), ...others];
  } catch {
    return [defaultConn()];
  }
}

export function saveConnection(conn: ConnectionConfig): void {
  ensureDataFile();
  const storedRaw: ConnectionConfig[] = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const existing = storedRaw.filter(c => c.id !== conn.id);

  const encryptConn = (c: ConnectionConfig): ConnectionConfig => ({
    ...c,
    password:    encryptPassword(c.password),
    sshPassword: c.sshPassword ? encryptPassword(c.sshPassword) : c.sshPassword,
    sshKey:      c.sshKey      ? encryptPassword(c.sshKey)      : c.sshKey,
  });

  // Preserve existing credentials when not re-entered
  let connToSave = conn;
  if (conn.password === '') {
    const prev = storedRaw.find(c => c.id === conn.id);
    if (prev) {
      connToSave = {
        ...conn,
        password:    decryptPassword(prev.password),
        sshPassword: conn.sshPassword === '' && prev.sshPassword ? decryptPassword(prev.sshPassword) : conn.sshPassword,
        sshKey:      conn.sshKey === '' && prev.sshKey ? decryptPassword(prev.sshKey) : conn.sshKey,
      };
    }
  }

  atomicWrite(DATA_FILE, JSON.stringify([...existing, encryptConn(connToSave)], null, 2));
  // Invalidate cached pool so the next request picks up the updated config
  const p = pools.get(conn.id);
  if (p?.mysql) p.mysql.end().catch(() => {});
  if (p?.pg) p.pg.end().catch(() => {});
  pools.delete(conn.id);
  const t = tunnels.get(conn.id);
  if (t) { t.server.close(); (t.ssh as { end?: () => void })?.end?.(); tunnels.delete(conn.id); }
}

export function removeConnection(id: string): void {
  ensureDataFile();
  const raw: ConnectionConfig[] = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  atomicWrite(DATA_FILE, JSON.stringify(raw.filter(c => c.id !== id), null, 2));
  const p = pools.get(id);
  if (p?.mysql) p.mysql.end().catch(() => {});
  if (p?.pg) p.pg.end().catch(() => {});
  pools.delete(id);
  const t = tunnels.get(id);
  if (t) {
    t.server.close();
    (t.ssh as { end?: () => void })?.end?.();
    tunnels.delete(id);
  }
}

function sslOptions(config: ConnectionConfig): object | undefined {
  const mode = config.sslMode ?? (config.ssl ? 'require' : 'disable');
  if (mode === 'disable') return undefined;
  return { rejectUnauthorized: mode === 'verify' };
}

async function openSshTunnel(config: ConnectionConfig): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Client: SshClient } = require('ssh2') as typeof import('ssh2');
  return new Promise((resolve, reject) => {
    const ssh = new SshClient();
    ssh.on('ready', () => {
      const server = net.createServer(socket => {
        ssh.forwardOut(
          '127.0.0.1', socket.remotePort ?? 0,
          config.host, config.port,
          (err, stream) => {
            if (err) { socket.destroy(); return; }
            socket.pipe(stream as unknown as NodeJS.WritableStream);
            (stream as unknown as NodeJS.ReadableStream).pipe(socket);
          }
        );
      });
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as net.AddressInfo).port;
        tunnels.set(config.id, { server, ssh });
        resolve(port);
      });
      server.on('error', reject);
    });
    ssh.on('error', reject);
    ssh.connect({
      host: config.sshHost!,
      port: config.sshPort ?? 22,
      username: config.sshUser!,
      password: config.sshPassword || undefined,
      privateKey: config.sshKey ? Buffer.from(config.sshKey) : undefined,
      readyTimeout: 10000,
    });
  });
}

export async function getConnPool(idOrConfig: string | ConnectionConfig = 'default'): Promise<ConnPool> {
  const id = typeof idOrConfig === 'string' ? idOrConfig : idOrConfig.id;

  if (typeof idOrConfig === 'string' && pools.has(id)) return pools.get(id)!;

  const config = typeof idOrConfig === 'object'
    ? idOrConfig
    : listConnections().find(c => c.id === id);
  if (!config) throw new Error(`Connection '${id}' not found`);

  const ssl = sslOptions(config);

  let host = config.host;
  let port = config.port;

  if (config.sshHost && config.sshUser) {
    const tunnelPort = await openSshTunnel(config);
    host = '127.0.0.1';
    port = tunnelPort;
  }

  const cache = typeof idOrConfig === 'string';

  if (config.type === 'postgres') {
    const pg = new PgPool({
      host,
      port,
      user: config.user,
      password: config.password,
      database: config.database || 'postgres',
      ssl: ssl as import('pg').PoolConfig['ssl'],
      max: 10,
    });
    const pool: ConnPool = { config, pg };
    if (cache) pools.set(id, pool);
    return pool;
  } else {
    const pool: ConnPool = {
      config,
      mysql: mysql.createPool({
        host,
        port,
        user: config.user,
        password: config.password,
        database: config.database,
        multipleStatements: true,
        waitForConnections: true,
        connectionLimit: 10,
        timezone: '+00:00',
        ssl: ssl as Record<string, unknown>,
      }),
    };
    if (cache) pools.set(id, pool);
    return pool;
  }
}
