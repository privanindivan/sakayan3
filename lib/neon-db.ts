import { Pool } from 'pg'

// Neon free DB — used exclusively for mapillary_images to offload from Supabase's 500 MB limit
// Falls back to null if NEON_DATABASE_URL is not configured

let neonPool: Pool | null = null

if (process.env.NEON_DATABASE_URL) {
  neonPool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  })
}

export const neonQuery = neonPool
  ? (text: string, params?: any[]) => neonPool!.query(text, params ?? []).then(r => r.rows)
  : null
