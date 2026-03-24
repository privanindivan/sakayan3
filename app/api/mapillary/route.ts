import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get('bbox')
  if (!bbox) return NextResponse.json({ data: [] })

  const [w, s, e, n] = bbox.split(',').map(Number)
  if ([w, s, e, n].some(isNaN)) return NextResponse.json({ data: [] })

  try {
    const res = await pool.query(
      `SELECT id, lat, lng FROM mapillary_images WHERE lng >= $1 AND lng <= $2 AND lat >= $3 AND lat <= $4 LIMIT 500`,
      [w, e, s, n]
    )
    const data = res.rows.map(r => ({
      id: r.id,
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
    }))
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ data: [] })
  }
}
