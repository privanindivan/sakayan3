import { NextRequest, NextResponse } from 'next/server'

const TOKEN = process.env.MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z, x, y } = await params

  if (!TOKEN) return new NextResponse('No token', { status: 500 })

  const url = `https://tiles.mapillary.com/maps/vtp/mly1_public/2/${z}/${x}/${y}?access_token=${TOKEN}`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })

  if (!res.ok) return new NextResponse(null, { status: res.status })

  const buf = await res.arrayBuffer()
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-protobuf',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
