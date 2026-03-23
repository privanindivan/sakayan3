import { neon } from '@neondatabase/serverless'
const sql = neon('postgresql://neondb_owner:npg_YuOG0zeck1Is@ep-small-star-a1mmvsnn-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require')
const [r] = await sql`SELECT COUNT(*) as total FROM terminals`
const rows = await sql`SELECT type, COUNT(*) as cnt FROM terminals GROUP BY type ORDER BY cnt DESC`
console.log('Total terminals:', r.total)
rows.forEach(row => console.log(' ', row.type + ':', row.cnt))
