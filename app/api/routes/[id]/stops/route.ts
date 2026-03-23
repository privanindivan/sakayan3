import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const stops = await sql`
    SELECT * FROM stops WHERE route_id = ${id} ORDER BY created_at ASC
  `;
  return NextResponse.json({ stops });
}
