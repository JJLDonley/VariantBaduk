const REMEMBER_COOKIE = "vg_remember";
const SESSION_COOKIE = "vg_session";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const DEFAULT_SECRET = "dev-secret-change-me";

export type Session = {
  uuid: string;
  name?: string;
  token: string;
  isNew: boolean;
};

export type SessionClaims = {
  sub: string;
  iat: number;
  name?: string;
};

export async function getOrCreateSession(
  request: Request,
  secret = getJwtSecret(),
  nameOverride?: string,
): Promise<{ session: Session; headers: Headers }> {
  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const remembered = validUuid(cookies[REMEMBER_COOKIE]) ? cookies[REMEMBER_COOKIE] : undefined;
  const sessionCookie = cookies[SESSION_COOKIE];
  const claims = sessionCookie ? await verifyJwt(sessionCookie, secret) : undefined;
  const uuid = claims?.sub ?? remembered ?? crypto.randomUUID();
  const isNew = !remembered && !claims;
  const name = normalizeName(nameOverride) ?? claims?.name;
  const token = await signJwt({ sub: uuid, iat: nowSeconds(), ...(name ? { name } : {}) }, secret);
  const headers = new Headers();

  headers.append("set-cookie", cookie(REMEMBER_COOKIE, uuid, ONE_YEAR_SECONDS, false));
  headers.append("set-cookie", cookie(SESSION_COOKIE, token, ONE_YEAR_SECONDS, true));

  return { session: { uuid, name, token, isNew }, headers };
}

export function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName || rawValue.length === 0) continue;
    cookies[rawName] = decodeURIComponent(rawValue.join("="));
  }
  return cookies;
}

export async function signJwt(claims: SessionClaims, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(claims));
  const signature = await hmacSha256(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function verifyJwt(token: string, secret: string): Promise<SessionClaims | undefined> {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;

  const [encodedHeader, encodedPayload, signature] = parts;
  const expected = await hmacSha256(`${encodedHeader}.${encodedPayload}`, secret);
  if (!timingSafeEqual(signature, expected)) return undefined;

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader)) as { alg?: string; typ?: string };
    if (header.alg !== "HS256" || header.typ !== "JWT") return undefined;

    const claims = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<SessionClaims>;
    if (!validUuid(claims.sub) || typeof claims.iat !== "number") return undefined;
    const name = normalizeName(claims.name);
    return { sub: claims.sub, iat: claims.iat, ...(name ? { name } : {}) };
  } catch {
    return undefined;
  }
}

function cookie(name: string, value: string, maxAge: number, httpOnly: boolean): string {
  const flags = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
  ];
  if (httpOnly) flags.push("HttpOnly");
  return flags.join("; ");
}

function getJwtSecret(): string {
  try {
    return Deno.env.get("JWT_SECRET") ?? DEFAULT_SECRET;
  } catch {
    return DEFAULT_SECRET;
  }
}

function normalizeName(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim().slice(0, 16) : "";
  return normalized || undefined;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function hmacSha256(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(input.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
