require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  const schema = fs.readFileSync(path.join(__dirname, 'schema_v2.sql'), 'utf8');
  const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
  console.log('Running v2 migrations...');
  for (const statement of statements) {
    await sql.query(statement);
  }
  console.log('V2 migrations complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
