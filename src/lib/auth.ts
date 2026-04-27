export const COOKIE = 'dbadmin_session';
const TTL_SECONDS = 8 * 3600;

export function getSecret(): string {
  const s = process.env.SESSION_SECRET || process.env.UI_PASSWORD;
  if (!s) throw new Error('SESSION_SECRET is not set — run install.sh to configure the application');
  return s;
}

export function isSecureContext(): boolean {
  return process.env.HTTPS_ENABLED === '1';
}

export async function createToken(): Promise<string> {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const expiry = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${nonce}.${expiry}`;
  const key = await hmacKey(['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const b64url = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${payload}.${b64url}`;
}

export async function verifyToken(token: string): Promise<boolean> {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return false;
  const payload = token.slice(0, lastDot);
  const hmac = token.slice(lastDot + 1);

  const parts = payload.split('.');
  if (parts.length !== 2) return false;
  const expiry = parseInt(parts[1]);
  if (isNaN(expiry) || expiry < Math.floor(Date.now() / 1000)) return false;

  try {
    const key = await hmacKey(['verify']);
    const padded = hmac.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4;
    const b64 = pad ? padded + '='.repeat(4 - pad) : padded;
    const sigBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

async function hmacKey(usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, usage
  );
}
