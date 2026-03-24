import { Pool } from 'pg'

// Transaction mode pooler (port 6543) avoids Supabase session-count limit
const dbUrl = (process.env.DATABASE_URL || '').replace(':5432/', ':6543/')
const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  max: 3,
})

// Tagged template literal — same interface as neon() so all queries work unchanged
function sqlFn(strings: TemplateStringsArray, ...values: any[]): Promise<any[]> {
  let text = ''
  const params: any[] = []
  strings.forEach((str, i) => {
    text += str
    if (i < values.length) {
      params.push(values[i])
      text += `$${params.length}`
    }
  })
  return pool.query(text, params).then(r => r.rows)
}

// Also support sql.query(text, params) style used by some routes
sqlFn.query = (text: string, params?: any[]): Promise<any[]> =>
  pool.query(text, params ?? []).then(r => r.rows)

export const sql = sqlFn
export default sql
