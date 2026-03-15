import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];
const PUBLIC_POST_ROUTES = ['/api/auth/register', '/api/auth/login'];

// Minimal JWT decode (no verification) for header injection in middleware
// Full verification happens in individual API routes via lib/auth.ts
function decodeJWTPayload(token: string): { userId: string; email: string; role: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.userId || !payload.email || !payload.role) return null;
    // Check expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return { userId: payload.userId, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (!PROTECTED_METHODS.includes(method)) return NextResponse.next();
  if (PUBLIC_POST_ROUTES.includes(pathname)) return NextResponse.next();

  const token = request.cookies.get('token')?.value;
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
  requestHeaders.set('x-user-email', payload.email);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: '/api/:path*',
};
