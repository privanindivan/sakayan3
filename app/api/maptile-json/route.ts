import { NextRequest, NextResponse } from 'next/server'
// @ts-ignore
import Protobuf from 'pbf'
// @ts-ignore
import { VectorTile } from '@mapbox/vector-tile'

const TOKEN = process.env.MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN

function tileToLng(tileX: number, px: number, zoom: number) {
  return ((tileX + px) / Math.pow(2, zoom)) * 360 - 180
}
function tileToLat(tileY: number, py: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * (tileY + py)) / Math.pow(2, zoom)
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

export async function GET(req: NextRequest) {
  const z = Number(req.nextUrl.searchParams.get('z'))
  const x = Number(req.nextUrl.searchParams.get('x'))
  const y = Number(req.nextUrl.searchParams.get('y'))

  if (isNaN(z) || isNaN(x) || isNaN(y)) {
    return NextResponse.json({ images: [] }, { status: 400 })
  }
  if (!TOKEN) return NextResponse.json({ images: [] }, { status: 503 })

  try {
    const url = `https://tiles.mapillary.com/maps/vtp/mly1_public/2/${z}/${x}/${y}?access_token=${TOKEN}`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) return NextResponse.json({ images: [] })

    const buf = await res.arrayBuffer()
    const tile = new VectorTile(new Protobuf(new Uint8Array(buf)))

    const imageLayer = tile.layers?.image
    if (!imageLayer) return NextResponse.json({ images: [] })

    const extent = imageLayer.extent || 4096
    const images: { id: string; lat: number; lng: number }[] = []

    for (let i = 0; i < imageLayer.length; i++) {
      const feature = imageLayer.feature(i)
      const geom = feature.loadGeometry()
      if (!geom?.length || !geom[0]?.length) continue
      const { x: px, y: py } = geom[0][0]
      images.push({
        id: String(feature.properties.id),
        lng: tileToLng(x, px / extent, z),
        lat: tileToLat(y, py / extent, z),
      })
    }

    return NextResponse.json({ images }, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    })
  } catch {
    return NextResponse.json({ images: [] }, { status: 502 })
  }
}
