import { type NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { sql } from '@/lib/db';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  // Try cookie first (email/password login)
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get('token')?.value;

  // Try Bearer token from Authorization header (Google OAuth users)
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const token = cookieToken || bearerToken;
  if (!token) return NextResponse.json({ user: null });

  const auth = verifyToken(token);
  if (!auth) return NextResponse.json({ user: null });

  
  const rows = await sql`SELECT id, email, username, avatar_url, role, badge, points FROM users WHERE id = ${auth.userId}`;
  return NextResponse.json({ user: rows[0] || null });
}
