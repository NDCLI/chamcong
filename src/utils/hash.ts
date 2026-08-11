/**
 * Simple hash function for guest sync codes.
 * Uses SHA-256 via Web Crypto API to create a secure hash from name + passphrase.
 */
export async function hashGuestCode(name: string, passphrase: string): Promise<string> {
  const combined = `${name.trim().toLowerCase()}:${passphrase}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 32); // First 32 chars for Firestore doc ID
}

/**
 * Validate guest passphrase: must be at least 6 characters.
 */
export function isValidPassphrase(passphrase: string): boolean {
  return passphrase.length >= 6;
}
