import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const KEY_VERSION = 1;

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Output format: `keyVersion:iv:authTag:ciphertext` (all hex-encoded).
 */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${KEY_VERSION}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a value produced by encrypt().
 * Expects format: `keyVersion:iv:authTag:ciphertext`.
 */
export function decrypt(encrypted: string, keyHex: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted value format');
  }
  const [, ivHex, authTagHex, ciphertextHex] = parts;
  const key = Buffer.from(keyHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex!, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex!, 'hex'));
  return decipher.update(ciphertextHex!, 'hex', 'utf8') + decipher.final('utf8');
}

/**
 * Check if a value looks like it was encrypted by encrypt().
 * Used for backward compatibility during migration from plain text.
 */
export function isEncrypted(value: string): boolean {
  return /^\d+:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/.test(value);
}
