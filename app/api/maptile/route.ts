import { NextRequest, NextResponse } from 'next/server'

const TOKEN = process.env.MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN

export async function GET(req: NextRequest) {
  const z = req.nextUrl.searchParams.get('z')
  const x = req.nextUrl.searchParams.get('x')
  const y = req.nextUrl.searchParams.get('y')

  if (!z || !x || !y) return new NextResponse('Bad request', { status: 400 })
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
