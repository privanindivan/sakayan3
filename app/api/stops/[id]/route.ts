import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  

  const stopRows = await sql`SELECT * FROM stops WHERE id = ${id}`;
  const stop = stopRows[0];
  if (!stop) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (stop.created_by !== userId && role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { name, photo_url, description, route_id } = await req.json();
  const updatedRows = await sql`
    UPDATE stops SET
      name = COALESCE(${name}, name),
      photo_url = COALESCE(${photo_url}, photo_url),
      description = COALESCE(${description}, description),
      route_id = COALESCE(${route_id}, route_id)
    WHERE id = ${id}
    RETURNING *
  `;
  return NextResponse.json({ stop: updatedRows[0] });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  

  const stopRows = await sql`SELECT * FROM stops WHERE id = ${id}`;
  const stop = stopRows[0];
  if (!stop) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (stop.created_by !== userId && role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await sql`DELETE FROM stops WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
