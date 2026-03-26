import { NextRequest, NextResponse } from 'next/server'

const TOKEN = process.env.MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN
const CACHE = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }

export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get('bbox')
  if (!bbox || !TOKEN) return NextResponse.json({ data: [] })

  try {
    const res = await fetch(
      `https://graph.mapillary.com/images?access_token=${TOKEN}&bbox=${bbox}&limit=2000&fields=id,geometry`,
      { signal: AbortSignal.timeout(9000) }
    )
    const json = await res.json()
    return NextResponse.json({ data: json.data || [] }, { headers: CACHE })
  } catch {
    return NextResponse.json({ data: [] })
  }
}
