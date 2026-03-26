import { neon } from '@neondatabase/serverless'

// Neon free DB — mapillary_images only
// neon() uses HTTP fetch transport — stateless, works in Netlify serverless functions

const url = process.env.NEON_DATABASE_URL

export const neonSql = url ? neon(url) : null

// Convenience wrapper for the status route (simple queries with no params)
export const neonQuery: ((text: string, params?: any[]) => Promise<any[]>) | null = neonSql
  ? async (text: string, params?: any[]) => {
      const values = params ?? []
      const parts = text.split(/\$\d+/)
      const frozen = Object.freeze(Object.assign(parts, { raw: Object.freeze(parts.slice()) }))
      return neonSql(frozen as unknown as TemplateStringsArray, ...values) as Promise<any[]>
    }
  : null
