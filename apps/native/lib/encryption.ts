/**
 * Lightweight XOR-based obfuscation for the OpenRouter API key.
 *
 * This is NOT cryptographically secure — it is only meant to prevent the key
 * from being stored in plain text in the Convex database.  The web app uses
 * the same simple scheme; for production hardening, replace this with a
 * server-side encryption approach or Convex Vault.
 *
 * Key is stored separately in expo-secure-store so it never leaves the device.
 */

const OBFUSCATION_SECRET = "openchat-mobile-obfuscation-key";

function xorBytes(input: string, key: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    out += String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

export function encryptApiKey(apiKey: string): string {
  return btoa(xorBytes(apiKey, OBFUSCATION_SECRET));
}

export function decryptApiKey(encrypted: string): string {
  try {
    return xorBytes(atob(encrypted), OBFUSCATION_SECRET);
  } catch {
    return "";
  }
}
