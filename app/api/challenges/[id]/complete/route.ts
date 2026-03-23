import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await sql`SELECT id FROM challenge_completions WHERE challenge_id=${id} AND user_id=${userId}`
  if (existing.length > 0) return NextResponse.json({ error: 'Already completed' }, { status: 409 })

  const [challenge] = await sql`SELECT reward_points FROM challenges WHERE id=${id}`
  if (!challenge) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await sql`INSERT INTO challenge_completions (challenge_id, user_id) VALUES (${id}, ${userId})`
  await sql`UPDATE users SET points = points + ${challenge.reward_points} WHERE id = ${userId}`

  return NextResponse.json({ ok: true, points_earned: challenge.reward_points })
}
