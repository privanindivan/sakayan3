import { sql } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const SAVE_FILE = path.join(process.cwd(), 'scripts', 'grabmaps_checklist.json')

function loadSaved(): Record<string, boolean> {
  try { return JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')) } catch { return {} }
}

function writeSaved(data: Record<string, boolean>) {
  fs.writeFileSync(SAVE_FILE, JSON.stringify(data))
}

export async function GET() {
  const rows = await sql.query(
    `SELECT id, name, lat, lng FROM terminals ORDER BY name ASC`
  )
  const checked = loadSaved()
  return NextResponse.json({ terminals: rows, checked })
}

export async function POST(req: NextRequest) {
  const { id, value } = await req.json()
  const checked = loadSaved()
  if (value) checked[id] = true
  else delete checked[id]
  writeSaved(checked)
  return NextResponse.json({ ok: true })
}
