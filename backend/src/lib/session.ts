import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";
export const SESSION_COOKIE = "docx_session";

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("hex");
}

export function createSessionToken(userId: string): string {
  const signature = sign(userId);
  return `${userId}.${signature}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [userId, signature] = token.split(".");
  if (!userId || !signature) return null;

  const expected = sign(userId);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return userId;
}

/**
 * Raw `Cookie` header parsing for contexts cookie-parser doesn't run in
 * (the WebSocket upgrade handshake sits below Express middleware entirely).
 */
export function userIdFromCookieHeader(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === SESSION_COOKIE) {
      return verifySessionToken(decodeURIComponent(rawValue.join("=")));
    }
  }
  return null;
}
