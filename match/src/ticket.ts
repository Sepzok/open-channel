import { createHmac, timingSafeEqual } from 'node:crypto';

export type AdmissionClaims = {
  id: string;
  channelId: string;
  actorId: string;
  exp: string;
};

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function hmac(secret: string, data: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

export function signAdmission(secret: string, claims: AdmissionClaims): string {
  const payload = b64url(Buffer.from(JSON.stringify(claims), 'utf8'));
  const sig = b64url(hmac(secret, payload));
  return `${payload}.${sig}`;
}

export function verifyAdmission(
  secret: string,
  token: string,
  nowMs: number = Date.now(),
): AdmissionClaims | null {
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = hmac(secret, payload);
    actual = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let claims: AdmissionClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AdmissionClaims;
  } catch {
    return null;
  }
  if (!claims.id || !claims.channelId || !claims.actorId || !claims.exp) return null;
  if (Date.parse(claims.exp) <= nowMs) return null;
  return claims;
}
