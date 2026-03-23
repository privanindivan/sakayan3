/**
 * Migrate Neon DB → Supabase using pg client
 */
import pkg from 'pg'
const { Client } = pkg
import { neon } from '@neondatabase/serverless'

const SUPABASE_URL = process.env.DATABASE_URL
const NEON_URL = process.env.NEON_DATABASE_URL

async function main() {
  // Connect to Supabase
  console.log('Connecting to Supabase...')
  const db = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } })
  await db.connect()
  const ver = await db.query('SELECT version()')
  console.log('Connected:', ver.rows[0].version.split(' ').slice(0,2).join(' '))

  // Create schema
  console.log('\nCreating schema...')
  await db.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`)
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'user',
      points INT DEFAULT 0,
      badge TEXT DEFAULT 'newcomer',
      google_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`)
  await db.query(`
    CREATE TABLE IF NOT EXISTS terminals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      type TEXT NOT NULL DEFAULT 'Bus',
      details TEXT,
      schedule JSONB,
      images TEXT[],
      created_by UUID REFERENCES users(id),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`)
  await db.query(`
    CREATE TABLE IF NOT EXISTS connections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
      to_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
      type TEXT,
      fare NUMERIC,
      duration_secs INT,
      color TEXT,
      geometry JSONB,
      waypoints JSONB,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`)
  await db.query(`
    CREATE TABLE IF NOT EXISTS edit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      terminal_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id),
      action TEXT NOT NULL,
      old_data JSONB,
      new_data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`)
  await db.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      terminal_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id),
      body TEXT NOT NULL,
      likes INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`)
  await db.query(`
    CREATE TABLE IF NOT EXISTS challenges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      difficulty TEXT DEFAULT 'easy',
      connection_ids UUID[],
      reward_points INT DEFAULT 10,
      likes INT DEFAULT 0,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`)
  await db.query(`
    CREATE TABLE IF NOT EXISTS challenge_completions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(challenge_id, user_id)
    )`)
  console.log('Schema created.')

  // Read from Neon
  console.log('\nReading from Neon...')
  const src = neon(NEON_URL)

  // Users
  const users = await src`SELECT * FROM users`
  console.log(`Importing ${users.length} users...`)
  for (const u of users) {
    await db.query(
      `INSERT INTO users (id,username,email,password,role,points,badge,google_id,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
      [u.id,u.username,u.email,u.password,u.role,u.points,u.badge,u.google_id,u.created_at]
    )
  }

  // Terminals
  const terminals = await src`SELECT * FROM terminals`
  console.log(`Importing ${terminals.length} terminals...`)
  let done = 0
  for (const t of terminals) {
    try {
      await db.query(
        `INSERT INTO terminals (id,name,lat,lng,type,details,schedule,images,created_by,updated_at,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
        [t.id,t.name,t.lat,t.lng,t.type,t.details,
         t.schedule ? JSON.stringify(t.schedule) : null,
         t.images,t.created_by,t.updated_at,t.created_at]
      )
      done++
      if (done % 500 === 0) console.log(`  ${done}/${terminals.length}...`)
    } catch(e) { console.error(`  skip: ${t.name} — ${e.message}`) }
  }
  console.log(`  ✓ ${done} terminals`)

  // Connections
  const conns = await src`SELECT * FROM connections`
  console.log(`Importing ${conns.length} connections...`)
  for (const c of conns) {
    try {
      await db.query(
        `INSERT INTO connections (id,from_id,to_id,type,fare,duration_secs,color,geometry,waypoints,created_by,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
        [c.id,c.from_id,c.to_id,c.type,c.fare,c.duration_secs,c.color,
         c.geometry ? JSON.stringify(c.geometry) : null,
         c.waypoints ? JSON.stringify(c.waypoints) : null,
         c.created_by,c.created_at]
      )
    } catch {}
  }

  // Edit log
  const logs = await src`SELECT * FROM edit_log`
  console.log(`Importing ${logs.length} edit log entries...`)
  for (const l of logs) {
    try {
      await db.query(
        `INSERT INTO edit_log (id,terminal_id,user_id,action,old_data,new_data,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [l.id,l.terminal_id,l.user_id,l.action,
         l.old_data ? JSON.stringify(l.old_data) : null,
         l.new_data ? JSON.stringify(l.new_data) : null,
         l.created_at]
      )
    } catch {}
  }

  // Verify
  const res = await db.query('SELECT COUNT(*) as total FROM terminals')
  console.log(`\n✅ Migration complete — ${res.rows[0].total} terminals in Supabase`)
  await db.end()
}

main().catch(e => { console.error('Migration failed:', e.message); process.exit(1) })
