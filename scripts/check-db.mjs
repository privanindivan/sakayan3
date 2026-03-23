import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.NEON_DATABASE_URL)
const [r] = await sql`SELECT COUNT(*) as total FROM terminals`
const rows = await sql`SELECT type, COUNT(*) as cnt FROM terminals GROUP BY type ORDER BY cnt DESC`
console.log('Total terminals:', r.total)
rows.forEach(row => console.log(' ', row.type + ':', row.cnt))
