import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'


function summarizeChanges(old_data: any, new_data: any, action: string): string {
  if (action === 'delete') return 'Deleted terminal'
  if (action === 'revert') return 'Reverted to previous version'
  if (!old_data || !new_data) return 'Edited'

  const parts: string[] = []
  const fields: { key: string; label: string }[] = [
    { key: 'name',     label: 'Name'     },
    { key: 'type',     label: 'Type'     },
    { key: 'details',  label: 'Details'  },
  ]

  for (const { key, label } of fields) {
    const before = old_data[key] ?? ''
    const after  = new_data[key] ?? ''
    if (String(before).trim() !== String(after).trim() && after) {
      if (!before) parts.push(`Added ${label.toLowerCase()}: "${after}"`)
      else parts.push(`${label}: "${before}" → "${after}"`)
    }
  }

  // Schedule
  const oldSched = JSON.stringify(old_data.schedule ?? '')
  const newSched = JSON.stringify(new_data.schedule ?? '')
  if (oldSched !== newSched) parts.push('Updated schedule')

  // Images
  const oldImgs = (old_data.images ?? []).length
  const newImgs = (new_data.images ?? []).length
  if (newImgs > oldImgs) parts.push(`Added ${newImgs - oldImgs} photo${newImgs - oldImgs > 1 ? 's' : ''}`)
  else if (newImgs < oldImgs) parts.push(`Removed ${oldImgs - newImgs} photo${oldImgs - newImgs > 1 ? 's' : ''}`)

  return parts.length > 0 ? parts.join(' · ') : 'Minor edit'
}

// GET /api/terminals/:id/history
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rows = await sql`
    SELECT el.id, el.action, el.old_data, el.new_data, el.created_at,
           u.username, u.badge
    FROM edit_log el
    LEFT JOIN users u ON el.user_id = u.id
    WHERE el.terminal_id = ${id}
    ORDER BY el.created_at DESC
    LIMIT 50`

  const history = rows.map(r => ({
    ...r,
    summary: summarizeChanges(r.old_data, r.new_data, r.action),
  }))

  return NextResponse.json({ history })
}

// POST /api/terminals/:id/history  { logId } — revert to that log entry's old_data
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { logId } = await req.json()
  const [log] = await sql`SELECT * FROM edit_log WHERE id = ${logId} AND terminal_id = ${id}`
  if (!log) return NextResponse.json({ error: 'Log entry not found' }, { status: 404 })

  const snap = log.old_data
  if (!snap) return NextResponse.json({ error: 'Nothing to revert to' }, { status: 400 })

  const [current] = await sql`SELECT * FROM terminals WHERE id = ${id}`

  const [terminal] = await sql`
    UPDATE terminals SET name=${snap.name}, type=${snap.type}, details=${snap.details ?? null},
    schedule=${snap.schedule ? JSON.stringify(snap.schedule) : null}::jsonb,
    images=${snap.images ?? null}, updated_at=NOW()
    WHERE id=${id} RETURNING *`

  await sql`
    INSERT INTO edit_log (terminal_id, user_id, action, old_data, new_data)
    VALUES (${id}, ${userId}, 'revert', ${JSON.stringify(current)}, ${JSON.stringify(snap)})`

  return NextResponse.json({ terminal })
}
