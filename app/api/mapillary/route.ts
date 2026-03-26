import { NextRequest, NextResponse } from 'next/server'
import { neonSql } from '@/lib/neon-db'

const TOKEN = process.env.MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }

export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get('bbox')
  if (!bbox) return NextResponse.json({ data: [] })

  const [w, s, e, n] = bbox.split(',').map(Number)
  if ([w, s, e, n].some(isNaN)) return NextResponse.json({ data: [] })

  if (!neonSql) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })

  // 1. Serve from DB (pre-seeded for full PH coverage)
  try {
    const rows = await neonSql`
      SELECT id::text, lat, lng FROM mapillary_images
      WHERE lng >= ${w} AND lng <= ${e} AND lat >= ${s} AND lat <= ${n}
      LIMIT 2000`
    if (rows.length > 0) {
      return NextResponse.json({ data: rows.map(r => ({
        id: r.id,
        geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      })) }, { headers: CACHE_HEADERS })
    }
  } catch { /* fall through to live API */ }

  // 2. DB empty for this tile — fetch live from Mapillary
  if (TOKEN) {
    try {
      const res = await fetch(
        `https://graph.mapillary.com/images?access_token=${TOKEN}&bbox=${w},${s},${e},${n}&limit=2000&fields=id,geometry`
      )
      const json = await res.json()
      const images: Array<{ id: string; geometry: { coordinates: number[] } }> = json.data || []
      if (images.length > 0) {
        return NextResponse.json({ data: images.map(img => ({ id: img.id, geometry: img.geometry })) }, { headers: CACHE_HEADERS })
      }
    } catch { /* return empty */ }
  }

  return NextResponse.json({ data: [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
