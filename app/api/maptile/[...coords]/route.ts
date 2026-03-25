import { NextRequest, NextResponse } from 'next/server'

const TOKEN = process.env.MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ coords: string[] }> }
) {
  const { coords } = await params
  if (!coords || coords.length < 3) return new NextResponse('Bad request', { status: 400 })

  const [z, x, y] = coords
  if (!TOKEN) return new NextResponse('No token', { status: 500 })

  const url = `https://tiles.mapillary.com/maps/vtp/mly1_public/2/${z}/${x}/${y}?access_token=${TOKEN}`

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) return new NextResponse(null, { status: res.status })
    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-protobuf',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
