import { NextRequest, NextResponse } from 'next/server';
import getSql from '@/lib/db';

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { entity_type, entity_id, reason } = await req.json();
  if (!entity_type || !entity_id || !reason)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const sql = getSql();
  const rows = await sql`
    INSERT INTO reports (entity_type, entity_id, user_id, reason)
    VALUES (${entity_type}, ${entity_id}, ${userId}, ${reason})
    RETURNING *
  `;
  return NextResponse.json({ report: rows[0] }, { status: 201 });
}
