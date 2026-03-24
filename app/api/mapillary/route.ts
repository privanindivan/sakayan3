import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get('bbox')
  if (!bbox) return NextResponse.json({ data: [] })

  const b64 = process.env.MAPILLARY_KEY_B64
  const token = b64 ? Buffer.from(b64, 'base64').toString('utf8') : ''
  if (!token) return NextResponse.json({ data: [] })

  try {
    const url = `https://graph.mapillary.com/images?access_token=${token}&fields=id,geometry,thumb_256_url&bbox=${bbox}&limit=300`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    if (data.error) return NextResponse.json({ data: [] })
    return NextResponse.json({ data: data.data || [] })
  } catch {
    return NextResponse.json({ data: [] })
  }
}
