import { NextRequest, NextResponse } from 'next/server'
import { neonQuery } from '@/lib/neon-db'

const TOKEN = process.env.MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN

export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get('bbox')
  if (!bbox) return NextResponse.json({ data: [] })

  const [w, s, e, n] = bbox.split(',').map(Number)
  if ([w, s, e, n].some(isNaN)) return NextResponse.json({ data: [] })

  // CDN cache headers — tile data is pre-seeded and static
  // s-maxage: Netlify CDN caches 1hr; same tile bbox = 0 function invocations after first hit
  // stale-while-revalidate: serve stale up to 24hr while refreshing in background
  const CACHE_HEADERS = {
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  }

  if (!neonQuery) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })

  // 1. Serve from DB first (instant — pre-seeded images for full PH)
  try {
    const rows = await neonQuery(
      `SELECT id::text, lat, lng FROM mapillary_images
       WHERE lng >= $1 AND lng <= $2 AND lat >= $3 AND lat <= $4
       LIMIT 2000`,
      [w, e, s, n]
    )
    if (rows.length > 0) {
      return NextResponse.json({ data: rows.map(r => ({
        id: r.id,
        geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      })) }, { headers: CACHE_HEADERS })
    }
  } catch { /* fall through */ }

  // 2. DB empty for this tile — fetch live from Mapillary and cache
  if (TOKEN) {
    try {
      const url = `https://graph.mapillary.com/images?access_token=${TOKEN}&bbox=${w},${s},${e},${n}&limit=2000&fields=id,geometry`
      const res = await fetch(url)
      const json = await res.json()
      const images: Array<{ id: string; geometry: { coordinates: number[] } }> = json.data || []
      if (images.length > 0) {
        const vals = images.map(img => [img.id, img.geometry.coordinates[1], img.geometry.coordinates[0]])
        const text = vals.map((_, i) => `($${i * 3 + 1}::bigint,$${i * 3 + 2},$${i * 3 + 3})`).join(',')
        neonQuery(`INSERT INTO mapillary_images(id,lat,lng) VALUES ${text} ON CONFLICT(id) DO NOTHING`, vals.flat()).catch(() => {})
        return NextResponse.json({ data: images.map(img => ({ id: img.id, geometry: img.geometry })) }, { headers: CACHE_HEADERS })
      }
    } catch { /* return empty */ }
  }

  // Empty tile — short cache so it rechecks once seeding catches up
  return NextResponse.json({ data: [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
