import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

// Pack JSON into a short, URL-safe string (raw DEFLATE + base64url), small
// enough for a QR code. Used for Ghost Challenges and shared quests.

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function packJson(prefix: string, value: unknown): string {
  return `${prefix}.${toBase64Url(deflateSync(strToU8(JSON.stringify(value)), { level: 9 }))}`;
}

export function unpackJson(prefix: string, text: string): unknown {
  const s = text.trim();
  const at = s.indexOf(`${prefix}.`);
  if (at < 0) throw new Error('not a FieldDay code');
  const body = s.slice(at + prefix.length + 1).split(/[?#&\s]/)[0]!;
  return JSON.parse(strFromU8(inflateSync(fromBase64Url(body))));
}
