/**
 * Export full Neon DB schema + data to SQL file for Supabase import
 */
import { neon } from '@neondatabase/serverless'
import { writeFileSync } from 'fs'

const DB_URL = process.env.NEON_DATABASE_URL
const sql = neon(DB_URL)

function escape(val) {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  if (typeof val === 'number') return String(val)
  if (Array.isArray(val)) {
    if (val.length === 0) return "'{}'::text[]"
    return `ARRAY[${val.map(v => `'${String(v).replace(/'/g, "''")}'`).join(',')}]`
  }
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`
  return `'${String(val).replace(/'/g, "''")}'`
}

async function exportTable(name, query) {
  process.stdout.write(`Exporting ${name}... `)
  try {
    const rows = await query()
    console.log(`${rows.length} rows`)
    return rows
  } catch (e) {
    console.log(`skipped (${e.message})`)
    return []
  }
}

async function main() {
  const lines = []
  lines.push('-- Sakayan DB export from Neon')
  lines.push(`-- Exported: ${new Date().toISOString()}`)
  lines.push('')

  // ── Schema ────────────────────────────────────────────────────────────────
  lines.push(`
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT UNIQUE NOT NULL,
  email       TEXT UNIQUE,
  password    TEXT,
  role        TEXT DEFAULT 'user',
  points      INT DEFAULT 0,
  badge       TEXT DEFAULT 'newcomer',
  google_id   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS terminals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  type        TEXT NOT NULL DEFAULT 'Bus',
  details     TEXT,
  schedule    JSONB,
  images      TEXT[],
  created_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id       UUID REFERENCES terminals(id) ON DELETE CASCADE,
  to_id         UUID REFERENCES terminals(id) ON DELETE CASCADE,
  type          TEXT,
  fare          NUMERIC,
  duration_secs INT,
  color         TEXT,
  geometry      JSONB,
  waypoints     JSONB,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS edit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  old_data    JSONB,
  new_data    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  body        TEXT NOT NULL,
  likes       INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS challenges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT,
  difficulty     TEXT DEFAULT 'easy',
  connection_ids UUID[],
  reward_points  INT DEFAULT 10,
  likes          INT DEFAULT 0,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS challenge_completions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(challenge_id, user_id)
);
`)

  // ── Data ──────────────────────────────────────────────────────────────────
  const tables = [
    { name: 'users',                  q: () => sql`SELECT * FROM users` },
    { name: 'terminals',              q: () => sql`SELECT * FROM terminals` },
    { name: 'connections',            q: () => sql`SELECT * FROM connections` },
    { name: 'edit_log',               q: () => sql`SELECT * FROM edit_log` },
    { name: 'comments',               q: () => sql`SELECT * FROM comments` },
    { name: 'challenges',             q: () => sql`SELECT * FROM challenges` },
    { name: 'challenge_completions',  q: () => sql`SELECT * FROM challenge_completions` },
  ]

  for (const { name, q } of tables) {
    const rows = await exportTable(name, q)
    if (rows.length === 0) continue

    const cols = Object.keys(rows[0])
    lines.push(`\n-- ${name} (${rows.length} rows)`)

    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200)
      const values = batch.map(row =>
        `(${cols.map(c => escape(row[c])).join(', ')})`
      ).join(',\n  ')
      lines.push(`INSERT INTO ${name} (${cols.join(', ')}) VALUES\n  ${values}\nON CONFLICT DO NOTHING;`)
    }
  }

  lines.push('\n-- End of export')
  writeFileSync('scripts/neon-export.sql', lines.join('\n'))
  console.log('\n✅ Exported to scripts/neon-export.sql')
}

main().catch(console.error)
