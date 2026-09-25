// Secret-derived tokens contain no secret text and survive room changes/reconnects.
const bytes = new TextEncoder();
export function constantTimeEqual(a, b) {
  const x = bytes.encode(String(a));
  const y = bytes.encode(String(b));
  let different = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) different |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return different === 0;
}
export async function adminToken(secret, id, crypto = globalThis.crypto) {
  const key = await crypto.subtle.importKey('raw', bytes.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes.encode(`admin:v1:${id}`)));
  return btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function hashIp(ip, crypto = globalThis.crypto) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.encode(ip))), x => x.toString(16).padStart(2, '0')).join('');
}
