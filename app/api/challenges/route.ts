import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'


export async function GET() {
  const challenges = await sql`
    SELECT c.*, u.username as creator_name, u.badge as creator_badge
    FROM challenges c
    LEFT JOIN users u ON c.created_by = u.id
    ORDER BY c.likes DESC, c.created_at DESC
  `
  return NextResponse.json({ challenges })
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { title, description, difficulty, connection_ids, reward_points } = await req.json()
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  const [challenge] = await sql`
    INSERT INTO challenges (title, description, difficulty, connection_ids, reward_points, created_by)
    VALUES (${title}, ${description || null}, ${difficulty || 'easy'}, ${connection_ids || []}, ${reward_points || 10}, ${userId})
    RETURNING *
  `
  return NextResponse.json({ challenge }, { status: 201 })
}
