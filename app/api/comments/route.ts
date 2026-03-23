import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entity_type = searchParams.get('entity_type');
  const entity_id = searchParams.get('entity_id');
  if (!entity_type || !entity_id)
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  
  const comments = await sql`
    SELECT c.*, u.username, u.avatar_url
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.entity_type = ${entity_type} AND c.entity_id = ${entity_id}
    ORDER BY c.created_at DESC
    LIMIT 5
  `;
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { entity_type, entity_id, body } = await req.json();
  if (!entity_type || !entity_id || !body)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  
  const rows = await sql`
    INSERT INTO comments (entity_type, entity_id, user_id, body)
    VALUES (${entity_type}, ${entity_id}, ${userId}, ${body})
    RETURNING *
  `;
  return NextResponse.json({ comment: rows[0] }, { status: 201 });
}
