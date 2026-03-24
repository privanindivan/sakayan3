import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    mapillaryToken: process.env.NEXT_PUBLIC_MAPILLARY_TOKEN || process.env.MAPILLARY_TOKEN || '',
  })
}
