/**
 * Workers-compatible crypto utilities
 * Uses Web Crypto API instead of Node.js crypto module
 */

/**
 * Generate random bytes using Web Crypto API
 */
export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Generate a random hex string
 */
export function randomHex(length: number): string {
  const bytes = randomBytes(length);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a UUID
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Create SHA-256 hash of text
 */
export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive a key from password using PBKDF2
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number = 100000
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data using AES-GCM
 */
export async function encrypt(
  data: string,
  key: CryptoKey
): Promise<{ iv: string; encrypted: string }> {
  const encoder = new TextEncoder();
  const iv = randomBytes(12); // 96 bits for AES-GCM

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    encoder.encode(data)
  );

  return {
    iv: arrayBufferToBase64(iv),
    encrypted: arrayBufferToBase64(encryptedBuffer),
  };
}

/**
 * Decrypt data using AES-GCM
 */
export async function decrypt(
  encrypted: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const decoder = new TextDecoder();
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(iv) },
    key,
    base64ToArrayBuffer(encrypted)
  );

  return decoder.decode(decryptedBuffer);
}

/**
 * Simple password hashing using PBKDF2 (bcrypt alternative)
 * Note: For production, consider using a proper bcrypt implementation
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  const exportedKey = await crypto.subtle.exportKey('raw', key);
  
  const saltHex = arrayBufferToHex(salt);
  const hashHex = arrayBufferToHex(exportedKey);
  
  return `pbkdf2:${saltHex}:${hashHex}`;
}

/**
 * Verify password against hash
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts[0] !== 'pbkdf2' || parts.length !== 3) {
    return false;
  }

  const salt = hexToArrayBuffer(parts[1]);
  const expectedHash = parts[2];

  const key = await deriveKey(password, new Uint8Array(salt));
  const exportedKey = await crypto.subtle.exportKey('raw', key);
  const actualHash = arrayBufferToHex(exportedKey);

  return actualHash === expectedHash;
}

// Helper functions for encoding/decoding

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}

/**
 * URL-safe Base64 encoding
 */
export function toUrlSafeBase64(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * URL-safe Base64 decoding
 */
export function fromUrlSafeBase64(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}
