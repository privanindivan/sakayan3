import { NextResponse } from 'next/server'

export async function GET() {
  // Only return the already-public token (baked into JS bundle anyway).
  // Never expose the server-side MAPILLARY_TOKEN here.
  return NextResponse.json({
    mapillaryToken: process.env.NEXT_PUBLIC_MAPILLARY_TOKEN || '',
  })
}
