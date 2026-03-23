import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = req.headers.get('x-user-id')
  const userRole = req.headers.get('x-user-role')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const existing = await sql.query(`SELECT created_by FROM connections WHERE id = $1`, [id])
  if (!existing[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const ownedByUser = existing[0].created_by == null || existing[0].created_by === userId
  if (!ownedByUser && userRole !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { geometry, color, fare, duration_secs, waypoints, budget_level } = await req.json()
  const rows = await sql.query(
    `UPDATE connections SET
      geometry=COALESCE($1::jsonb, geometry),
      color=COALESCE($2, color),
      fare=COALESCE($3, fare),
      duration_secs=COALESCE($4, duration_secs),
      waypoints=COALESCE($5::jsonb, waypoints),
      budget_level=COALESCE($6, budget_level)
     WHERE id=$7 RETURNING *`,
    [geometry ? JSON.stringify(geometry) : null, color, fare, duration_secs, waypoints ? JSON.stringify(waypoints) : null, budget_level, id]
  )
  const conn = rows[0]
  return NextResponse.json({ connection: { ...conn, fromId: conn.from_id, toId: conn.to_id, waypoints: conn.waypoints || [] } })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = req.headers.get('x-user-id')
  const userRole = req.headers.get('x-user-role')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const existing = await sql.query(`SELECT created_by FROM connections WHERE id = $1`, [id])
  if (!existing[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const ownedByUser = existing[0].created_by == null || existing[0].created_by === userId
  if (!ownedByUser && userRole !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await sql.query(`DELETE FROM connections WHERE id = $1`, [id])
  return NextResponse.json({ ok: true })
}
