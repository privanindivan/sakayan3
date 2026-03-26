import { neon } from '@neondatabase/serverless'

// Neon free DB — mapillary_images only
// neon() uses HTTP fetch transport — stateless, works in Netlify serverless functions

const url = process.env.NEON_DATABASE_URL

// Convert parameterized query string + params array → tagged template call
// e.g. ("SELECT ... WHERE x=$1", [val]) → sql`SELECT ... WHERE x=${val}`
function makeQuery(url: string) {
  const sql = neon(url)
  return async (text: string, params?: any[]): Promise<any[]> => {
    const values = params ?? []
    const parts = text.split(/\$\d+/)
    const strings = parts as unknown as TemplateStringsArray
    ;(strings as any).raw = parts
    const rows = await sql(strings, ...values)
    return rows as any[]
  }
}

export const neonQuery: ((text: string, params?: any[]) => Promise<any[]>) | null =
  url ? makeQuery(url) : null
