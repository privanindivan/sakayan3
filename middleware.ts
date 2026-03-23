import { NextRequest, NextResponse } from 'next/server';

// ── Rate limiter (sliding window, in-memory per instance) ─────────────────
// Limits write operations per IP. On Vercel serverless each warm instance
// tracks its own window — partial protection is still meaningful.
const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
const RATE_WINDOW_MS = 60_000;   // 1 minute
const RATE_MAX_WRITES = 30;      // max 30 writes per IP per minute

const rateMap = new Map<string, { count: number; windowStart: number }>();

function rateLimitCheck(request: NextRequest): NextResponse | null {
  if (!WRITE_METHODS.has(request.method)) return null;
  if (!request.nextUrl.pathname.startsWith('/api/')) return null;

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
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

// Prevent rateMap from growing unbounded — prune old entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, entry] of rateMap) {
    if (entry.windowStart < cutoff) rateMap.delete(ip);
  }
}, 5 * 60_000);
// ──────────────────────────────────────────────────────────────────────────

// ── Philippine-only geo-block ──────────────────────────────────────────────
// Vercel sets x-vercel-ip-country, Cloudflare sets cf-ipcountry.
// Skipped in local dev (no header present = no block).
function geoBlock(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === 'development') return null;
  const country =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry');
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

// Minimal JWT decode (no verification) for header injection in middleware
// Full verification happens in individual API routes via lib/auth.ts
function decodeJWTPayload(token: string): { userId: string; email: string; role: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.userId || !payload.role) return null;
    // Check expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return { userId: payload.userId, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const blocked = geoBlock(request);
  if (blocked) return blocked;

  const rateLimited = rateLimitCheck(request);
  if (rateLimited) return rateLimited;

  const { pathname } = request.nextUrl;
  const method = request.method;

  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (!PROTECTED_METHODS.includes(method)) return NextResponse.next();
  if (PUBLIC_POST_ROUTES.includes(pathname)) return NextResponse.next();

  const cookieToken = request.cookies.get('token')?.value;
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = cookieToken || bearerToken;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = decodeJWTPayload(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', payload.userId);
  requestHeaders.set('x-user-role', payload.role);
  if (payload.email) requestHeaders.set('x-user-email', payload.email);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Cover all routes — geo-block runs first for everyone,
  // auth check only applies to /api/* write routes.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
