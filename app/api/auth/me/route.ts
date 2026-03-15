import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import getSql from '@/lib/db';

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ user: null });
  const sql = getSql();
  const rows = await sql`SELECT id, email, username, avatar_url, role FROM users WHERE id = ${auth.userId}`;
  return NextResponse.json({ user: rows[0] || null });
}
