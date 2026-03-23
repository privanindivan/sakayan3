import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { routesCache, CACHE_TTL_MS, setRoutesCache, bustRoutesCache } from './cache';

export async function GET() {
  const now = Date.now();
  if (routesCache && now - routesCache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ routes: routesCache.data });
  }

  const routes = await sql`
    SELECT r.*, COUNT(s.id)::int AS stop_count
    FROM routes r
    LEFT JOIN stops s ON s.route_id = r.id
    WHERE r.deleted_at IS NULL
    GROUP BY r.id
    ORDER BY r.created_at DESC
  `;

  setRoutesCache(routes);
  return NextResponse.json({ routes });
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, type, color_hex, geojson_path } = await req.json();
  if (!name || !type) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const rows = await sql`
    INSERT INTO routes (name, type, color_hex, geojson_path, created_by)
    VALUES (${name}, ${type}, ${color_hex || '#FF0000'}, ${geojson_path || null}, ${userId})
    RETURNING *
  `;
  bustRoutesCache();
  return NextResponse.json({ route: rows[0] }, { status: 201 });
}
