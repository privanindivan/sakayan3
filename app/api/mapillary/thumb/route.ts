import { NextRequest, NextResponse } from 'next/server'

const TOKEN = process.env.MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })
  if (!TOKEN) return NextResponse.json({ error: 'no token' }, { status: 503 })

  try {
    const res = await fetch(
      `https://graph.mapillary.com/${id}?access_token=${TOKEN}&fields=thumb_256_url`,
      { cache: 'no-store' }
    )
    const data = await res.json()
    if (!data.thumb_256_url) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ url: data.thumb_256_url }, {
      headers: { 'Cache-Control': 'private, max-age=86400' },
    })
  } catch {
    return NextResponse.json({ error: 'upstream error' }, { status: 502 })
  }
}
