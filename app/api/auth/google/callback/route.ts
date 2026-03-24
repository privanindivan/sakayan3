import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(FRONTEND_URL + '?auth_error=no_code')

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: (process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL) + '/api/auth/google/callback',
        grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokens.access_token) return NextResponse.redirect(FRONTEND_URL + '?auth_error=token_failed')

    // Get user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const googleUser = await userRes.json()
    if (!googleUser.email) return NextResponse.redirect(FRONTEND_URL + '?auth_error=no_email')

    // Find or create user
    const existing = await sql.query(`SELECT * FROM users WHERE email = $1`, [googleUser.email])
    let user = existing[0]

    if (!user) {
      // Generate unique username from Google name
      const base = (googleUser.name || googleUser.email.split('@')[0]).replace(/\s+/g, '').toLowerCase()
      let username = base
      let i = 1
      while (true) {
        const taken = await sql.query(`SELECT id FROM users WHERE username = $1`, [username])
        if (!taken[0]) break
        username = base + i++
      }
      const inserted = await sql.query(
        `INSERT INTO users (email, username, password_hash, avatar_url, role)
         VALUES ($1, $2, $3, $4, 'user') RETURNING *`,
        [googleUser.email, username, 'google_oauth', googleUser.picture || null]
      )
      user = inserted[0]
    }

    // Issue JWT — pass via URL so Vite frontend (different port) can receive it
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET!, { expiresIn: '7d' })
    const userData = encodeURIComponent(JSON.stringify({
      id: user.id, username: user.username, email: user.email,
      role: user.role, badge: user.badge || 'newcomer', avatar_url: user.avatar_url,
    }))
    return NextResponse.redirect(`${FRONTEND_URL}?auth_token=${token}&auth_user=${userData}`)
  } catch (err) {
    console.error('Google OAuth error:', err)
    return NextResponse.redirect(FRONTEND_URL + '?auth_error=server_error')
  }
}
