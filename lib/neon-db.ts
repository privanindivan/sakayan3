import { Pool } from '@neondatabase/serverless'

// Neon free DB — used exclusively for mapillary_images
// Uses @neondatabase/serverless Pool (HTTP transport) — designed for serverless/edge,
// handles cold starts cleanly without persistent TCP connections

const url = process.env.NEON_DATABASE_URL

export const neonQuery: ((text: string, params?: any[]) => Promise<any[]>) | null = url
  ? async (text: string, params?: any[]) => {
      const pool = new Pool({ connectionString: url })
      try {
        const { rows } = await pool.query(text, params ?? [])
        return rows
      } finally {
        await pool.end()
      }
    }
  : null
