import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { addPoints } from '@/lib/badge'


export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  const { searchParams } = req.nextUrl
  const bbox = searchParams.get('bbox')

  const slim = `t.id, t.name, t.lat, t.lng, t.type,
    t.likes, t.dislikes, t.outdated_votes, t.created_by, t.created_at,
    t.streetview_pano_id, t.streetview_yaw,
    u.username as creator_name, v.vote_type as my_vote`

  let rows
  if (bbox) {
    const [minLat, minLng, maxLat, maxLng] = bbox.split(',').map(Number)
    rows = await sql.query(`
      SELECT ${slim}
      FROM terminals t
      LEFT JOIN users u ON t.created_by = u.id
      LEFT JOIN votes v ON v.entity_type='terminal' AND v.entity_id=t.id AND v.user_id=$1
      WHERE t.lat BETWEEN $2 AND $3 AND t.lng BETWEEN $4 AND $5
      ORDER BY t.created_at DESC
    `, [userId, minLat, maxLat, minLng, maxLng])
  } else {
    rows = await sql.query(`
      SELECT ${slim}
      FROM terminals t
      LEFT JOIN users u ON t.created_by = u.id
      LEFT JOIN votes v ON v.entity_type='terminal' AND v.entity_id=t.id AND v.user_id=$1
      ORDER BY t.created_at DESC
      LIMIT 10000
    `, [userId])
  }
  return NextResponse.json({ terminals: rows }, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' }
  })
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const { name, lat, lng, type, details, schedule, images } = body
  if (!name || lat == null || lng == null) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const latN = Number(lat), lngN = Number(lng)
  if (!isFinite(latN) || !isFinite(lngN) || latN < -90 || latN > 90 || lngN < -180 || lngN > 180)
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
  if (typeof name === 'string' && name.length > 200)
    return NextResponse.json({ error: 'Name too long (max 200 chars)' }, { status: 400 })
  const rows = await sql.query(
    `INSERT INTO terminals (name, lat, lng, type, details, schedule, images, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [name, latN, lngN, type || 'Jeep', details || null, schedule ? JSON.stringify(schedule) : null, images || [], userId]
  )
  await addPoints(userId, 5)
  return NextResponse.json({ terminal: rows[0] }, { status: 201 })
}
