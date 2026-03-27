import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync } from 'fs'
import { join } from 'path'

// TEMP: only active in dev
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'disabled' }, { status: 403 })
  const { name, dataUrl } = await req.json()
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  const buf = Buffer.from(base64, 'base64')
  const filePath = join(process.cwd(), 'video-promo/public/screenshots', name)
  writeFileSync(filePath, buf)
  return NextResponse.json({ ok: true, path: filePath })
}
