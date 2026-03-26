import { NextRequest, NextResponse } from 'next/server'

const TOKEN = process.env.MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z, x, y } = await params
  if (!TOKEN) return new NextResponse(null, { status: 503 })

  try {
    const res = await fetch(
      `https://tiles.mapillary.com/maps/vtp/mly1_public/2/${z}/${x}/${y}?access_token=${TOKEN}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return new NextResponse(null, { status: res.status })

    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/x-protobuf',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
