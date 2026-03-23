import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'


// GET /api/terminals/:id/comments
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rows = await sql.query(
    `SELECT c.id, c.body, c.created_at,
            u.id as user_id, u.username, u.badge
     FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.entity_type = 'stop' AND c.entity_id = $1
     ORDER BY c.created_at DESC
     LIMIT 100`,
    [id]
  )
  return NextResponse.json({ comments: rows })
}

// POST /api/terminals/:id/comments  { body }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'Empty comment' }, { status: 400 })

  const rows = await sql.query(
    `INSERT INTO comments (entity_type, entity_id, user_id, body)
     VALUES ('stop', $1, $2, $3)
     RETURNING id, body, created_at`,
    [id, userId, body.trim().slice(0, 500)]
  )

  const userRow = await sql.query(`SELECT username, badge FROM users WHERE id = $1`, [userId])
  return NextResponse.json({ comment: { ...rows[0], user_id: userId, username: userRow[0]?.username, badge: userRow[0]?.badge } })
}

// DELETE /api/terminals/:id/comments?commentId=X  (own comment only)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const commentId = req.nextUrl.searchParams.get('commentId')
  if (!commentId) return NextResponse.json({ error: 'commentId required' }, { status: 400 })

  await sql.query(
    `DELETE FROM comments WHERE id = $1 AND entity_id = $2 AND user_id = $3`,
    [commentId, id, userId]
  )
  return NextResponse.json({ ok: true })
}
