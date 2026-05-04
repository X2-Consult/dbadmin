import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';

const PREFIX_V1 = 'enc1:';
const PREFIX_V2 = 'enc2:';

// Fixed salt — uniqueness comes from the random IV per encryption, not the salt
const PBKDF2_SALT = Buffer.from('dbadmin-connections-v2');
const PBKDF2_ITER = 310_000;

function getSecret(): string {
  return process.env.SESSION_SECRET || process.env.UI_PASSWORD || '';
}

// Cache the derived key so PBKDF2 only runs once per process lifecycle
let _cachedSecret = '';
let _cachedKey: Buffer | null = null;

function deriveKeyV2(): Buffer | null {
  const secret = getSecret();
  if (!secret) return null;
  if (secret === _cachedSecret && _cachedKey) return _cachedKey;
  _cachedKey = pbkdf2Sync(secret, PBKDF2_SALT, PBKDF2_ITER, 32, 'sha256');
  _cachedSecret = secret;
  return _cachedKey;
}

function deriveKeyV1(): Buffer | null {
  const secret = getSecret();
  if (!secret) return null;
  return createHash('sha256').update(secret).digest();
}

function aesGcmDecrypt(b64: string, key: Buffer): string {
  try {
    const buf = Buffer.from(b64, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function encryptPassword(plain: string): string {
  const key = deriveKeyV2();
  if (!key || !plain) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX_V2 + Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptPassword(enc: string): string {
  if (enc.startsWith(PREFIX_V2)) {
    const key = deriveKeyV2();
    return key ? aesGcmDecrypt(enc.slice(PREFIX_V2.length), key) : '';
  }
  if (enc.startsWith(PREFIX_V1)) {
    // Legacy: decrypt with SHA-256-derived key; re-encrypted next saveConnection call
    const key = deriveKeyV1();
    return key ? aesGcmDecrypt(enc.slice(PREFIX_V1.length), key) : '';
  }
  return enc; // unencrypted plaintext (default connection from env vars)
}
