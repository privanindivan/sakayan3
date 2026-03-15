import { NextRequest, NextResponse } from 'next/server';
import getSql from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sql = getSql();

  const routeRows = await sql`SELECT * FROM routes WHERE id = ${id} AND deleted_at IS NULL`;
  const route = routeRows[0];
  if (!route) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (route.created_by !== userId && role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { name, type, color_hex, geojson_path } = await req.json();
  const updatedRows = await sql`
    UPDATE routes SET
      name = COALESCE(${name}, name),
      type = COALESCE(${type}, type),
      color_hex = COALESCE(${color_hex}, color_hex),
      geojson_path = COALESCE(${geojson_path}, geojson_path),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return NextResponse.json({ route: updatedRows[0] });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = req.headers.get('x-user-role');
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const sql = getSql();
  await sql`UPDATE routes SET deleted_at = NOW() WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
