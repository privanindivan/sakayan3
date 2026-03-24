import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const dbUrl = (process.env.DATABASE_URL || '').replace(':5432/', ':6543/')
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 2 })
const TOKEN = process.env.MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN

export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get('bbox')
  if (!bbox) return NextResponse.json({ data: [] })

  const [w, s, e, n] = bbox.split(',').map(Number)
  if ([w, s, e, n].some(isNaN)) return NextResponse.json({ data: [] })

  // Always fetch live from Mapillary — gives full PH coverage, not just what was seeded.
  // Next.js caches this fetch for 24h so the same tile won't hit Mapillary more than once/day.
  if (TOKEN) {
    try {
      const url = `https://graph.mapillary.com/images?access_token=${TOKEN}&bbox=${w},${s},${e},${n}&limit=500&fields=id,geometry`
      const res = await fetch(url, { next: { revalidate: 86400 } })
      const json = await res.json()
      const images: Array<{ id: string; geometry: { coordinates: number[] } }> = json.data || []

      if (images.length > 0) {
        // Cache to DB in background so future DB queries/scripts benefit
        const vals = images.map(img => [img.id, img.geometry.coordinates[1], img.geometry.coordinates[0]])
        const text = vals.map((_, i) => `($${i * 3 + 1},$${i * 3 + 2},$${i * 3 + 3})`).join(',')
        pool.query(
          `INSERT INTO mapillary_images(id,lat,lng) VALUES ${text} ON CONFLICT(id) DO NOTHING`,
          vals.flat()
        ).catch(() => {})

        return NextResponse.json({ data: images.map(img => ({
          id: img.id,
          geometry: img.geometry,
        })) })
      }
    } catch { /* fall through to DB */ }
  }

  // Fallback: DB cache (if Mapillary is unreachable)
  try {
    const cached = await pool.query(
      `SELECT id, lat, lng FROM mapillary_images
       WHERE lng >= $1 AND lng <= $2 AND lat >= $3 AND lat <= $4
       ORDER BY (lat * 10000)::int % 17, (lng * 10000)::int % 13
       LIMIT 500`,
      [w, e, s, n]
    )
    return NextResponse.json({ data: cached.rows.map(r => ({
      id: r.id,
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
    })) })
  } catch {
    return NextResponse.json({ data: [] })
  }
}
