import { NextRequest, NextResponse } from 'next/server';

// ── Rate limiter (sliding window, in-memory per instance) ─────────────────
// Limits write operations per IP. On Vercel serverless each warm instance
// tracks its own window — partial protection is still meaningful.
const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
const RATE_WINDOW_MS = 60_000;   // 1 minute
const RATE_MAX_WRITES = 30;      // max 30 writes per IP per minute

const rateMap = new Map<string, { count: number; windowStart: number }>();

const RATE_LIMIT_EXEMPT = ['/api/auth/logout'];

// Stricter rate limit for auth endpoints — 10 attempts per 15 minutes
const AUTH_RATE_WINDOW_MS = 15 * 60_000;
const AUTH_RATE_MAX = 10;
const AUTH_RATE_ROUTES = ['/api/auth/login', '/api/auth/register'];
const authRateMap = new Map<string, { count: number; windowStart: number }>();

// ── GET rate limiter (anti-scraping) ──────────────────────────────────────
// General: 100 GET /api/* per IP per minute
// Bulk endpoints (full DB dumps): 5 per IP per minute
// Mapillary proxy: 15/min (bbox) — generous for panning, blocks hammering
const GET_RATE_MAX = 100;
const BULK_RATE_MAX = 5;
const MAPILLARY_RATE_MAX = 15;

const getRateMap = new Map<string, { count: number; windowStart: number }>();
const bulkRateMap = new Map<string, { count: number; windowStart: number }>();
const mapillaryRateMap = new Map<string, { count: number; windowStart: number }>();

function getReadRateCheck(request: NextRequest): NextResponse | null {
  if (request.method !== 'GET') return null;
  if (!request.nextUrl.pathname.startsWith('/api/')) return null;

  const ip =
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ||
    'unknown';
  const now = Date.now();
  const key429 = { status: 429 as const, headers: { 'Retry-After': '60' } };

  // Bulk endpoint check — /api/terminals (no bbox) and /api/connections
  const isBulk =
    (request.nextUrl.pathname === '/api/terminals' && !request.nextUrl.searchParams.has('bbox')) ||
    request.nextUrl.pathname === '/api/connections';

  if (isBulk) {
    const entry = bulkRateMap.get(ip);
    if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
      bulkRateMap.set(ip, { count: 1, windowStart: now });
    } else {
      entry.count++;
      if (entry.count > BULK_RATE_MAX) {
        return NextResponse.json({ error: 'Too many requests. Please slow down.' }, key429);
      }
    }
  }

  // Mapillary proxy endpoints — 15/min to block quota-drain attacks
  const isMapillary =
    request.nextUrl.pathname === '/api/mapillary' ||
    request.nextUrl.pathname === '/api/mapillary/thumb';

  if (isMapillary) {
    const entry = mapillaryRateMap.get(ip);
    if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
      mapillaryRateMap.set(ip, { count: 1, windowStart: now });
    } else {
      entry.count++;
      if (entry.count > MAPILLARY_RATE_MAX) {
        return NextResponse.json({ error: 'Too many requests. Please slow down.' }, key429);
      }
    }
  }

  // General GET rate limit
  const gEntry = getRateMap.get(ip);
  if (!gEntry || now - gEntry.windowStart > RATE_WINDOW_MS) {
    getRateMap.set(ip, { count: 1, windowStart: now });
    return null;
  }
  gEntry.count++;
  if (gEntry.count > GET_RATE_MAX) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, key429);
  }
  return null;
}

function authRateLimitCheck(request: NextRequest): NextResponse | null {
  if (!AUTH_RATE_ROUTES.includes(request.nextUrl.pathname)) return null;
  if (request.method !== 'POST') return null;
  const ip =
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ||
    'unknown';
  const now = Date.now();
  const entry = authRateMap.get(ip);
  if (!entry || now - entry.windowStart > AUTH_RATE_WINDOW_MS) {
    authRateMap.set(ip, { count: 1, windowStart: now });
    return null;
  }
  entry.count++;
  if (entry.count > AUTH_RATE_MAX) {
    return NextResponse.json(
      { error: 'Too many login attempts. Try again in 15 minutes.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((entry.windowStart + AUTH_RATE_WINDOW_MS - now) / 1000)) } }
    );
  }
  return null;
}

function rateLimitCheck(request: NextRequest): NextResponse | null {
  if (!WRITE_METHODS.has(request.method)) return null;
  if (!request.nextUrl.pathname.startsWith('/api/')) return null;
  if (RATE_LIMIT_EXEMPT.includes(request.nextUrl.pathname)) return null;

  // x-nf-client-connection-ip is Netlify's trusted real IP (not spoofable)
  const ip =
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ||
    'unknown';

  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateMap.set(ip, { count: 1, windowStart: now });
    return null;
  }

  entry.count++;
  if (entry.count > RATE_MAX_WRITES) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((entry.windowStart + RATE_WINDOW_MS - now) / 1000)),
          'X-RateLimit-Limit': String(RATE_MAX_WRITES),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }
  return null;
}

// Prevent rate maps from growing unbounded — prune old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (now - entry.windowStart > RATE_WINDOW_MS) rateMap.delete(ip);
  }
  for (const [ip, entry] of authRateMap) {
    if (now - entry.windowStart > AUTH_RATE_WINDOW_MS) authRateMap.delete(ip);
  }
  for (const [ip, entry] of getRateMap) {
    if (now - entry.windowStart > RATE_WINDOW_MS) getRateMap.delete(ip);
  }
  for (const [ip, entry] of bulkRateMap) {
    if (now - entry.windowStart > RATE_WINDOW_MS) bulkRateMap.delete(ip);
  }
  for (const [ip, entry] of mapillaryRateMap) {
    if (now - entry.windowStart > RATE_WINDOW_MS) mapillaryRateMap.delete(ip);
  }
}, 5 * 60_000);
// ──────────────────────────────────────────────────────────────────────────

// ── Philippine-only geo-block ──────────────────────────────────────────────
// Vercel sets x-vercel-ip-country, Cloudflare sets cf-ipcountry,
// Netlify Edge sets x-nf-country-code.
// Skipped in local dev (no header present = no block).
function geoBlock(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === 'development') return null;
  const country =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-nf-country-code');
  if (!country || country === 'PH') return null; // PH or unknown → allow
  return new NextResponse(
    '<!doctype html><html><head><meta charset="utf-8"><title>Access Restricted</title>' +
    '<style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8f9fa}' +
    'h1{font-size:2rem;color:#333}p{color:#666;text-align:center;max-width:380px;line-height:1.6}</style></head>' +
    '<body><h1>🇵🇭 Access Restricted</h1>' +
    '<p>Sakayan is only available within the Philippines.</p></body></html>',
    { status: 403, headers: { 'Content-Type': 'text/html' } }
  );
}
// ──────────────────────────────────────────────────────────────────────────

const PROTECTED_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];
const PUBLIC_POST_ROUTES = ['/api/auth/register', '/api/auth/login'];

// JWT verification using Web Crypto API (Edge-compatible, no Node.js deps)
async function verifyJWTPayload(token: string): Promise<{ userId: string; email: string; role: string } | null> {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigInput = encoder.encode(`${parts[0]}.${parts[1]}`);
    const sigBytes = Uint8Array.from(
      atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, sigInput);
    if (!valid) return null;

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.userId || !payload.role) return null;
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return { userId: payload.userId, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  // /status is local-only
  if (request.nextUrl.pathname.startsWith('/status')) {
    const host = request.headers.get('host') || '';
    if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
      return new NextResponse(null, { status: 404 });
    }
  }

  const blocked = geoBlock(request);
  if (blocked) return blocked;

  const authLimited = authRateLimitCheck(request);
  if (authLimited) return authLimited;

  const rateLimited = rateLimitCheck(request);
  if (rateLimited) return rateLimited;

  const readLimited = getReadRateCheck(request);
  if (readLimited) return readLimited;

  const { pathname } = request.nextUrl;
  const method = request.method;

  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (PUBLIC_POST_ROUTES.includes(pathname)) return NextResponse.next();

  const cookieToken = request.cookies.get('token')?.value;
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = cookieToken || bearerToken;

  // For write methods, require a valid token
  if (PROTECTED_METHODS.includes(method)) {
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const payload = await verifyJWTPayload(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.userId);
    requestHeaders.set('x-user-role', payload.role);
    if (payload.email) requestHeaders.set('x-user-email', payload.email);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // For read methods, inject user identity if token present (enables my_vote etc.)
  if (token) {
    const payload = await verifyJWTPayload(token);
    if (payload) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-user-id', payload.userId);
      requestHeaders.set('x-user-role', payload.role);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
  }

  return NextResponse.next();
}

export const config = {
  // Cover all routes — geo-block runs first for everyone,
  // auth check only applies to /api/* write routes.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
