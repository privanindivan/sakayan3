import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

const TOKEN = process.env.MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN

export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get('bbox')
  if (!bbox) return NextResponse.json({ data: [] })

  const [w, s, e, n] = bbox.split(',').map(Number)
  if ([w, s, e, n].some(isNaN)) return NextResponse.json({ data: [] })

  // 1. Serve from DB first (instant — pre-seeded images for full PH)
  try {
    const rows = await sql.query(
      `SELECT id, lat, lng FROM mapillary_images
       WHERE lng >= $1 AND lng <= $2 AND lat >= $3 AND lat <= $4
       LIMIT 500`,
      [w, e, s, n]
    )
    if (rows.length > 0) {
      // Background: refresh from Mapillary so new images get added over time
      if (TOKEN) {
        const url = `https://graph.mapillary.com/images?access_token=${TOKEN}&bbox=${w},${s},${e},${n}&limit=500&fields=id,geometry`
        fetch(url).then(r => r.json()).then(json => {
          const imgs: Array<{ id: string; geometry: { coordinates: number[] } }> = json.data || []
          if (imgs.length === 0) return
          const vals = imgs.map(img => [img.id, img.geometry.coordinates[1], img.geometry.coordinates[0]])
          const text = vals.map((_, i) => `($${i * 3 + 1},$${i * 3 + 2},$${i * 3 + 3})`).join(',')
          sql.query(`INSERT INTO mapillary_images(id,lat,lng) VALUES ${text} ON CONFLICT(id) DO NOTHING`, vals.flat()).catch(() => {})
        }).catch(() => {})
      }
      return NextResponse.json({ data: rows.map(r => ({
        id: r.id,
        geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      })) })
    }
  } catch { /* fall through */ }

  // 2. DB empty for this tile — fetch live from Mapillary and cache
  if (TOKEN) {
    try {
      const url = `https://graph.mapillary.com/images?access_token=${TOKEN}&bbox=${w},${s},${e},${n}&limit=500&fields=id,geometry`
      const res = await fetch(url)
      const json = await res.json()
      const images: Array<{ id: string; geometry: { coordinates: number[] } }> = json.data || []
      if (images.length > 0) {
        const vals = images.map(img => [img.id, img.geometry.coordinates[1], img.geometry.coordinates[0]])
        const text = vals.map((_, i) => `($${i * 3 + 1},$${i * 3 + 2},$${i * 3 + 3})`).join(',')
        sql.query(`INSERT INTO mapillary_images(id,lat,lng) VALUES ${text} ON CONFLICT(id) DO NOTHING`, vals.flat()).catch(() => {})
        return NextResponse.json({ data: images.map(img => ({ id: img.id, geometry: img.geometry })) })
      }
    } catch { /* return empty */ }
  }

  return NextResponse.json({ data: [] })
}
