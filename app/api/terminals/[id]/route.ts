import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { addPoints } from '@/lib/badge'


export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rows = await sql.query(
    `SELECT t.*, u.username as creator_name FROM terminals t LEFT JOIN users u ON t.created_by = u.id WHERE t.id = $1`,
    [id]
  )
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ terminal: rows[0] })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await sql.query(`SELECT * FROM terminals WHERE id = $1`, [id])
  if (!existing[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { name, type, details, schedule, images } = await req.json()

  // Log the edit before applying
  await sql.query(
    `INSERT INTO edit_log (terminal_id, user_id, action, old_data, new_data) VALUES ($1, $2, 'edit', $3, $4)`,
    [id, userId, JSON.stringify(existing[0]), JSON.stringify({ name, type, details, schedule, images })]
  )

  const rows = await sql.query(
    `UPDATE terminals SET name=COALESCE($1,name), type=COALESCE($2,type), details=COALESCE($3,details),
     schedule=COALESCE($4::jsonb,schedule), images=COALESCE($5,images), updated_at=NOW()
     WHERE id=$6 RETURNING *`,
    [name, type, details, schedule ? JSON.stringify(schedule) : null, images, id]
  )
  await addPoints(userId, 1)
  return NextResponse.json({ terminal: rows[0] })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await sql.query(`SELECT * FROM terminals WHERE id = $1`, [id])
  if (!existing[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Log the deletion before removing
  await sql.query(
    `INSERT INTO edit_log (terminal_id, user_id, action, old_data) VALUES ($1, $2, 'delete', $3)`,
    [id, userId, JSON.stringify(existing[0])]
  )

  await sql.query(`DELETE FROM terminals WHERE id = $1`, [id])
  return NextResponse.json({ ok: true })
}
