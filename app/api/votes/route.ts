import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'


export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { entity_type?: string; entity_id?: string; vote_type?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const { entity_type, entity_id, vote_type } = body
  if (!entity_type || !entity_id || !vote_type) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const ALLOWED_ENTITY_TYPES = ['terminal', 'connection', 'stop']
  const ALLOWED_VOTE_TYPES = ['like', 'dislike', 'outdated']
  if (!ALLOWED_ENTITY_TYPES.includes(entity_type) || !ALLOWED_VOTE_TYPES.includes(vote_type)) {
    return NextResponse.json({ error: 'Invalid vote parameters' }, { status: 400 })
  }

  const existing = await sql.query(
    `SELECT id FROM votes WHERE entity_type=$1 AND entity_id=$2 AND user_id=$3 AND vote_type=$4`,
    [entity_type, entity_id, userId, vote_type]
  )

  const table = entity_type === 'terminal' ? 'terminals' : 'connections'
  const col = vote_type === 'like' ? 'likes' : vote_type === 'dislike' ? 'dislikes' : 'outdated_votes'

  if (existing.length > 0) {
    // Toggle off
    await sql.query(`DELETE FROM votes WHERE id=$1`, [existing[0].id])
    await sql.query(`UPDATE ${table} SET ${col} = GREATEST(0, ${col} - 1) WHERE id=$1`, [entity_id])
    if (vote_type === 'like') {
      const creator = await sql.query(`SELECT created_by FROM ${table} WHERE id=$1`, [entity_id])
      if (creator[0]?.created_by) {
        await sql.query(`UPDATE users SET total_likes = GREATEST(0, total_likes - 1) WHERE id=$1`, [creator[0].created_by])
      }
    }
    return NextResponse.json({ voted: false, vote_type })
  } else {
    // Add vote
    await sql.query(
      `INSERT INTO votes (entity_type, entity_id, user_id, vote_type) VALUES ($1,$2,$3,$4)`,
      [entity_type, entity_id, userId, vote_type]
    )
    await sql.query(`UPDATE ${table} SET ${col} = ${col} + 1 WHERE id=$1`, [entity_id])
    if (vote_type === 'like') {
      const creator = await sql.query(`SELECT created_by FROM ${table} WHERE id=$1`, [entity_id])
      if (creator[0]?.created_by) {
        await sql.query(`UPDATE users SET total_likes = total_likes + 1 WHERE id=$1`, [creator[0].created_by])
        const userRows = await sql.query(`SELECT total_likes, points FROM users WHERE id=$1`, [creator[0].created_by])
        const user = userRows[0]
        if (user) {
          const score = user.total_likes * 2 + user.points
          let badge = 'newcomer'
          if (score >= 500) badge = 'pioneer'
          else if (score >= 200) badge = 'navigator'
          else if (score >= 100) badge = 'guide'
          else if (score >= 20) badge = 'explorer'
          await sql.query(`UPDATE users SET badge=$1 WHERE id=$2`, [badge, creator[0].created_by])
        }
      }
    }
    return NextResponse.json({ voted: true, vote_type })
  }
}
