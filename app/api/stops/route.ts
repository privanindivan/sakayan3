import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { route_id, name, lat, lng, photo_url, description } = await req.json();
  if (!name || lat == null || lng == null)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  
  const rows = await sql`
    INSERT INTO stops (route_id, name, lat, lng, photo_url, description, created_by)
    VALUES (${route_id || null}, ${name}, ${lat}, ${lng}, ${photo_url || null}, ${description || null}, ${userId})
    RETURNING *
  `;
  return NextResponse.json({ stop: rows[0] }, { status: 201 });
}
