import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { signToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const { email, password, username } = await req.json();
  if (!email || !password || !username)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  
  const existing = await sql`SELECT id FROM users WHERE email = ${email} OR username = ${username}`;
  if (existing.length > 0)
    return NextResponse.json({ error: 'Email or username already taken' }, { status: 409 });

  const password_hash = await bcrypt.hash(password, 10);
  const rows = await sql`
    INSERT INTO users (email, password_hash, username)
    VALUES (${email}, ${password_hash}, ${username})
    RETURNING id, email, username, role
  `;
  const user = rows[0];

  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  const cookieStore = await cookies();
  cookieStore.set('token', token, { httpOnly: true, maxAge: 60 * 60 * 24 * 7, path: '/', sameSite: 'lax' });

  return NextResponse.json({ user: { id: user.id, email: user.email, username: user.username, role: user.role } });
}
