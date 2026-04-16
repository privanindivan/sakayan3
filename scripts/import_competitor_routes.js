/**
 * Import competitor routes into Sakayan DB
 * Usage: node scripts/import_competitor_routes.js
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { Pool } = require('pg');

const dbUrl = (process.env.DATABASE_URL || '').replace(':5432/', ':6543/');
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

// Admin user to attribute imports to
const CREATED_BY = 'b45b7940-2b26-498b-914c-2452ba60d98d';

// Vehicle type → terminal type mapping
function terminalType(vehicleType) {
  const t = (vehicleType || '').toLowerCase();
  if (t.includes('bus') || t.includes('mini')) return 'Bus';
  if (t.includes('uv')) return 'UV';
  if (t.includes('train') || t.includes('transit') || t.includes('lrt') || t.includes('mrt')) return 'Train';
  if (t.includes('tricycle')) return 'Tricycle';
  if (t.includes('e-trike') || t.includes('etrike')) return 'Tricycle';
  if (t.includes('jeep') || t.includes('modern jeep')) return 'Jeep';
  return 'Jeep';
}

// Vehicle type → route color
function routeColor(vehicleType, name) {
  const t = (vehicleType || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (n.includes('lrt-1') || n.includes('lrt1')) return '#FFD700';       // LRT-1 yellow
  if (n.includes('lrt-2') || n.includes('lrt2')) return '#6B21A8';       // LRT-2 purple
  if (n.includes('mrt-3') || n.includes('mrt3')) return '#1D4ED8';       // MRT-3 blue
  if (n.includes('edsa carousel')) return '#DC2626';                      // BRT red
  if (t.includes('bus') || t.includes('mini')) return '#EF4444';         // bus red
  if (t.includes('uv')) return '#8B5CF6';                                 // UV purple
  if (t.includes('transit') || t.includes('train')) return '#3B82F6';    // transit blue
  if (t.includes('tricycle') || t.includes('e-trike')) return '#6B7280'; // tricycle gray
  if (t.includes('jeep') || t.includes('modern jeep')) return '#F59E0B'; // jeepney amber
  return '#22C55E'; // default green
}

// Check if a terminal already exists within ~100m (0.001 deg ≈ 111m)
async function findNearbyTerminal(lat, lng) {
  const rows = await pool.query(
    'SELECT id, name FROM terminals WHERE ABS(lat - $1) < 0.001 AND ABS(lng - $2) < 0.001 LIMIT 1',
    [lat, lng]
  );
  return rows.rows[0] || null;
}

// Create a terminal
async function createTerminal(name, lat, lng, type, details) {
  const rows = await pool.query(
    `INSERT INTO terminals (name, lat, lng, type, details, images, created_by)
     VALUES ($1, $2, $3, $4, $5, '{}', $6)
     ON CONFLICT DO NOTHING
     RETURNING id, name`,
    [name.substring(0, 200), lat, lng, type, details || null, CREATED_BY]
  );
  return rows.rows[0];
}

// Check if a connection already exists between two terminals
async function connectionExists(fromId, toId) {
  const rows = await pool.query(
    'SELECT id FROM connections WHERE (from_id=$1 AND to_id=$2) OR (from_id=$2 AND to_id=$1) LIMIT 1',
    [fromId, toId]
  );
  return rows.rows.length > 0;
}

// Create a connection
async function createConnection(fromId, toId, path, stops, fare, color, budgetLevel) {
  // Build GeoJSON LineString geometry from path
  const geometry = path.length > 1
    ? { type: 'LineString', coordinates: path.map(p => [p.lng, p.lat]) }
    : null;

  // Build waypoints from intermediate stops (skip first and last)
  const waypoints = stops.slice(1, -1).map(s => ({
    name: s.name,
    lat: s.location.lat,
    lng: s.location.lng,
    note: s.note || '',
    type: s.type || 'Stop',
  }));

  const fareVal = fare ? parseFloat(fare) : null;
  const budget = budgetLevel || (fareVal ? (fareVal < 30 ? 'low' : fareVal < 100 ? 'medium' : 'high') : 'medium');

  const rows = await pool.query(
    `INSERT INTO connections (from_id, to_id, geometry, color, fare, waypoints, budget_level, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [fromId, toId, geometry ? JSON.stringify(geometry) : null, color, fareVal, JSON.stringify(waypoints), budget, CREATED_BY]
  );
  return rows.rows[0];
}

async function main() {
  const routes = JSON.parse(fs.readFileSync('C:/Users/jj/Downloads/competitor_routes.json', 'utf8'));
  console.log(`Loaded ${routes.length} routes\n`);

  let created = 0, skipped = 0, errors = 0;

  for (const route of routes) {
    const { name, vehicleType, fare, path, stops } = route;

    // Skip if no usable location data
    if (stops.length === 0 && path.length === 0) {
      console.log(`⏭  SKIP (no data): ${name}`);
      skipped++;
      continue;
    }

    try {
      // Determine FROM and TO stops
      // Prefer stops typed "Terminal", fallback to first/last stop
      const terminalStops = stops.filter(s => s.type === 'Terminal' || s.type === 'Loading');
      let fromStop, toStop;

      if (terminalStops.length >= 2) {
        fromStop = terminalStops[0];
        toStop = terminalStops[terminalStops.length - 1];
      } else if (stops.length >= 2) {
        fromStop = stops[0];
        toStop = stops[stops.length - 1];
      } else if (stops.length === 1) {
        // Single pin (TODA etc) — create as a standalone terminal
        const s = stops[0];
        let existing = await findNearbyTerminal(s.location.lat, s.location.lng);
        if (!existing) {
          const t = terminalType(vehicleType);
          const created = await createTerminal(s.name || name, s.location.lat, s.location.lng, t, s.note);
          if (created) console.log(`📍 PIN terminal: ${created.name}`);
        } else {
          console.log(`📍 PIN exists nearby: ${existing.name}`);
        }
        skipped++;
        continue;
      } else if (path.length >= 2) {
        // No stops but has path — use first/last path point
        fromStop = { name: name + ' (Start)', location: path[0], note: '', type: 'Terminal' };
        toStop = { name: name + ' (End)', location: path[path.length - 1], note: '', type: 'Terminal' };
      } else {
        console.log(`⏭  SKIP (insufficient data): ${name}`);
        skipped++;
        continue;
      }

      const tType = terminalType(vehicleType);
      const color = routeColor(vehicleType, name);

      // Find or create FROM terminal
      let fromTerminal = await findNearbyTerminal(fromStop.location.lat, fromStop.location.lng);
      if (!fromTerminal) {
        fromTerminal = await createTerminal(fromStop.name, fromStop.location.lat, fromStop.location.lng, tType, fromStop.note);
        console.log(`  ✚ terminal: ${fromStop.name}`);
      } else {
        console.log(`  ✓ terminal exists: ${fromTerminal.name}`);
      }

      // Find or create TO terminal
      let toTerminal = await findNearbyTerminal(toStop.location.lat, toStop.location.lng);
      if (!toTerminal) {
        toTerminal = await createTerminal(toStop.name, toStop.location.lat, toStop.location.lng, tType, toStop.note);
        console.log(`  ✚ terminal: ${toStop.name}`);
      } else {
        console.log(`  ✓ terminal exists: ${toTerminal.name}`);
      }

      if (!fromTerminal || !toTerminal) {
        console.log(`⚠  Could not get terminal IDs for: ${name}`);
        errors++;
        continue;
      }

      // Skip if connection already exists
      if (await connectionExists(fromTerminal.id, toTerminal.id)) {
        console.log(`⏭  connection exists: ${name}`);
        skipped++;
        continue;
      }

      // Create connection
      const conn = await createConnection(fromTerminal.id, toTerminal.id, path, stops, fare, color, null);
      console.log(`✅ ${name} [${vehicleType}] fare=₱${fare || '?'} path=${path.length}pts → conn ${conn.id}`);
      created++;

    } catch (err) {
      console.error(`❌ ERROR on ${name}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n── DONE ──`);
  console.log(`Created: ${created} | Skipped: ${skipped} | Errors: ${errors}`);
  await pool.end();
}

main().catch(err => { console.error(err); pool.end(); process.exit(1); });
