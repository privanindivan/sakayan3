import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  

  const existing = await sql`
    SELECT id FROM comment_votes WHERE comment_id = ${id} AND user_id = ${userId}
  `;

  if (existing.length > 0) {
    await sql`DELETE FROM comment_votes WHERE comment_id = ${id} AND user_id = ${userId}`;
    await sql`UPDATE comments SET upvotes = upvotes - 1 WHERE id = ${id}`;
    return NextResponse.json({ action: 'removed' });
  } else {
    await sql`INSERT INTO comment_votes (comment_id, user_id) VALUES (${id}, ${userId})`;
    await sql`UPDATE comments SET upvotes = upvotes + 1 WHERE id = ${id}`;
    return NextResponse.json({ action: 'added' });
  }
}
