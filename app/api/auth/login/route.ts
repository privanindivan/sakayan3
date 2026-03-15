import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import getSql from '@/lib/db';
import { signToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const sql = getSql();
  const rows = await sql`SELECT * FROM users WHERE email = ${email}`;
  const user = rows[0];
  if (!user)
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid)
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  const cookieStore = await cookies();
  cookieStore.set('token', token, { httpOnly: true, maxAge: 60 * 60 * 24 * 7, path: '/', sameSite: 'lax' });

  return NextResponse.json({ user: { id: user.id, email: user.email, username: user.username, role: user.role } });
}
