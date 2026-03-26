import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'


export async function GET(req: NextRequest) {
  const rows = await sql.query(`
    SELECT c.*, u.username as creator_name,
      tf.name as from_name, tt.name as to_name
    FROM connections c
    LEFT JOIN users u ON c.created_by = u.id
    LEFT JOIN terminals tf ON c.from_id = tf.id
    LEFT JOIN terminals tt ON c.to_id = tt.id
    ORDER BY c.created_at DESC
  `)
  const connections = rows.map(c => ({
    ...c,
    id: c.id,
    fromId: c.from_id,
    toId: c.to_id,
    geometry: c.geometry,
    waypoints: c.waypoints || [],
  }))
  return NextResponse.json({ connections }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }
  })
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { fromId, toId, geometry, color, fare, duration_secs, waypoints, budget_level } = await req.json()
  if (!fromId || !toId) return NextResponse.json({ error: 'Missing fromId or toId' }, { status: 400 })
  const rows = await sql.query(
    `INSERT INTO connections (from_id, to_id, geometry, color, fare, duration_secs, waypoints, budget_level, created_by)
     VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7::jsonb,$8,$9) RETURNING *`,
    [fromId, toId, JSON.stringify(geometry || null), color || '#4A90D9', fare || null, duration_secs || null, JSON.stringify(waypoints || []), budget_level || 'medium', userId]
  )
  await sql.query(`UPDATE users SET points = points + 10 WHERE id = $1`, [userId])
  const conn = rows[0]
  return NextResponse.json({
    connection: { ...conn, fromId: conn.from_id, toId: conn.to_id, waypoints: conn.waypoints || [] }
  }, { status: 201 })
}
