import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { addPoints } from '@/lib/badge'


export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  const { searchParams } = req.nextUrl
  const bbox = searchParams.get('bbox')

  let rows
  if (bbox) {
    const [minLat, minLng, maxLat, maxLng] = bbox.split(',').map(Number)
    rows = await sql.query(`
      SELECT t.*, u.username as creator_name, v.vote_type as my_vote
      FROM terminals t
      LEFT JOIN users u ON t.created_by = u.id
      LEFT JOIN votes v ON v.entity_type='terminal' AND v.entity_id=t.id AND v.user_id=$1
      WHERE t.lat BETWEEN $2 AND $3 AND t.lng BETWEEN $4 AND $5
      ORDER BY t.created_at DESC
    `, [userId, minLat, maxLat, minLng, maxLng])
  } else {
    rows = await sql.query(`
      SELECT t.*, u.username as creator_name, v.vote_type as my_vote
      FROM terminals t
      LEFT JOIN users u ON t.created_by = u.id
      LEFT JOIN votes v ON v.entity_type='terminal' AND v.entity_id=t.id AND v.user_id=$1
      ORDER BY t.created_at DESC
      LIMIT 2000
    `, [userId])
  }
  return NextResponse.json({ terminals: rows }, {
    headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' }
  })
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, lat, lng, type, details, schedule, images } = await req.json()
  if (!name || !lat || !lng) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const rows = await sql.query(
    `INSERT INTO terminals (name, lat, lng, type, details, schedule, images, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [name, lat, lng, type || 'Jeep', details || null, schedule ? JSON.stringify(schedule) : null, images || [], userId]
  )
  await addPoints(userId, 5)
  return NextResponse.json({ terminal: rows[0] }, { status: 201 })
}
