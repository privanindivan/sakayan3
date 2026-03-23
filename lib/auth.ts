import jwt from 'jsonwebtoken';
import { cookies, headers } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function getAuthUser(): Promise<JWTPayload | null> {
  // 1. Try cookie (email/password login)
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get('token')?.value;
  if (cookieToken) return verifyToken(cookieToken);

  // 2. Try Bearer token from Authorization header (Google OAuth users)
  //    Middleware only injects x-user-* headers for POST/PUT/DELETE/PATCH,
  //    so GET routes like /api/auth/me must verify the token directly.
  const headerStore = await headers();
  const authHeader = headerStore.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return verifyToken(authHeader.slice(7));
  }

  return null;
}
