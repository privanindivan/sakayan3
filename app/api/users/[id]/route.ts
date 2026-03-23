import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'


export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const userRows = await sql.query(
    `SELECT id, username, badge, avatar_url, created_at FROM users WHERE id = $1`,
    [id]
  )
  if (!userRows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const user = userRows[0]

  const stops = await sql.query(
    `SELECT id, name, type, created_at FROM terminals WHERE created_by = $1 ORDER BY created_at DESC`,
    [id]
  )

  const edits = await sql.query(
    `SELECT el.id, el.action, el.created_at, t.name as terminal_name, el.terminal_id
     FROM edit_log el LEFT JOIN terminals t ON el.terminal_id = t.id
     WHERE el.user_id = $1
     ORDER BY el.created_at DESC LIMIT 50`,
    [id]
  )

  const connectionsCount = await sql.query(
    `SELECT COUNT(*) as count FROM connections WHERE created_by = $1`,
    [id]
  )

  const likesRow = await sql.query(
    `SELECT COALESCE(COUNT(v.id), 0) as total_likes
     FROM votes v
     JOIN terminals t ON v.entity_id = t.id
     WHERE t.created_by = $1 AND v.vote_type = 'like' AND v.entity_type = 'terminal'`,
    [id]
  )

  return NextResponse.json({
    user,
    stops,
    edits,
    connectionsCount: Number(connectionsCount[0]?.count ?? 0),
    totalLikes: Number(likesRow[0]?.total_likes ?? 0),
  })
}
