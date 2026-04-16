// Finds duplicate/near-duplicate terminal pins
// Composite scoring: distance + name similarity + type match
// Only groups terminals with high combined confidence
const { Pool } = require('pg')
const fs = require('fs')

const DB_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const OUT_PATH = 'C:/Users/jj/Downloads/duplicate_groups.json'

// ── Thresholds ──────────────────────────────────────────────────────────────
const SAME_SPOT_M   = 15    // definitely same physical location
const GEO_HARD_M    = 60    // geo-only pair (must be really close)
const MAX_DIST_M    = 600   // absolute max distance for any pair

// Composite score minimum to qualify as a duplicate pair
// score = distScore×0.45 + nameScore×0.40 + typeScore×0.15
const MIN_SCORE     = 0.72

// Name similarity thresholds
const NAME_EXACT    = 1.0
const NAME_HIGH     = 0.85
const NAME_MED      = 0.65  // only useful when also very close geo

// ── Haversine distance in metres ─────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Bounding box degrees covering MAX_DIST_M
const LAT_DEG = 0.0054  // ~600m in lat
const LNG_DEG = 0.0065  // ~600m in lng

// ── Name normalization ───────────────────────────────────────────────────────
const STOPWORDS = /\b(terminal|station|loop|stop|jeepney|tricycle|bus|uv express|uv|fx|van|corner|cor|brgy|barangay|purok|sitio|st|ave|blvd|road|street|avenue|highway|hwy|national|old|new|main|south|north|east|west|upper|lower|waiting|area|gate|rotonda|intersection|junction)\b/g
function normName(s) {
  return (s || '').toLowerCase()
    .replace(STOPWORDS, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Levenshtein ──────────────────────────────────────────────────────────────
function levenshtein(a, b) {
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({length: b.length+1}, (_,i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++)
      cur[j] = a[i-1] === b[j-1] ? prev[j-1] : 1 + Math.min(prev[j-1], prev[j], cur[j-1])
    prev = cur
  }
  return prev[b.length]
}

function charSim(a, b) {
  if (!a && !b) return 1
  if (!a || !b) return 0
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length)
}

function tokenSim(na, nb) {
  const tokA = na.split(' ').filter(Boolean)
  const tokB = nb.split(' ').filter(Boolean)
  if (!tokA.length && !tokB.length) return 1
  if (!tokA.length || !tokB.length) return 0
  const setA = new Set(tokA), setB = new Set(tokB)
  const inter = [...setA].filter(t => setB.has(t)).length
  const union = new Set([...setA, ...setB]).size
  return inter / union
}

function nameSim(nameA, nameB) {
  const a = normName(nameA), b = normName(nameB)
  if (!a && !b) return 1
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.92
  return Math.max(charSim(a, b), tokenSim(a, b))
}

// ── Type scoring ─────────────────────────────────────────────────────────────
// Returns 1 if same type, 0.5 if compatible, 0 if incompatible
const TYPE_GROUPS = [
  new Set(['Bus', 'UV', 'Fx', 'Van']),
  new Set(['Jeep', 'Jeepney']),
  new Set(['Train', 'LRT', 'MRT', 'PNR']),
  new Set(['Ferry', 'Boat']),
  new Set(['Tricycle']),
  new Set(['Cab', 'Taxi']),
]
function typeScore(ta, tb) {
  if (!ta || !tb) return 0.5  // unknown — neutral
  const a = (ta || '').trim(), b = (tb || '').trim()
  if (a === b) return 1
  for (const grp of TYPE_GROUPS) {
    if (grp.has(a) && grp.has(b)) return 1
  }
  return 0  // different transport type → strongly not duplicate
}

// ── Distance score (0-1, drops off with distance) ───────────────────────────
function distScore(d) {
  if (d <= SAME_SPOT_M) return 1.0
  if (d <= 50)   return 0.95
  if (d <= 100)  return 0.85
  if (d <= 200)  return 0.65
  if (d <= 400)  return 0.40
  if (d <= 600)  return 0.20
  return 0
}

// ── Composite score ───────────────────────────────────────────────────────────
function compositeScore(dist, ns, ts) {
  return distScore(dist) * 0.45 + ns * 0.40 + ts * 0.15
}

// ── Union-Find ────────────────────────────────────────────────────────────────
class UnionFind {
  constructor(n) { this.p = Array.from({length:n},(_,i)=>i) }
  find(x) { return this.p[x]===x ? x : (this.p[x]=this.find(this.p[x])) }
  union(x,y) { this.p[this.find(x)]=this.find(y) }
}

async function main() {
  console.log('Fetching terminals...')
  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  const { rows } = await pool.query(`SELECT id, name, lat, lng, type, images FROM terminals WHERE lat IS NOT NULL AND lng IS NOT NULL`)
  await pool.end()
  const n = rows.length
  console.log(`Loaded ${n} terminals`)

  const uf = new UnionFind(n)
  // Track pair reasons: "i-j" → {dist, nameSim, typeScore, score}
  const pairReasons = new Map()

  console.log('Scanning pairs with spatial grid...')
  const grid = new Map()
  rows.forEach((t, i) => {
    const key = `${Math.floor(t.lat / LAT_DEG)},${Math.floor(t.lng / LNG_DEG)}`
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key).push(i)
  })

  let totalPairs = 0
  for (const [key, bucket] of grid) {
    const [gr, gc] = key.split(',').map(Number)
    const candidates = []
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const nb = grid.get(`${gr+dr},${gc+dc}`)
        if (nb) candidates.push(...nb)
      }

    for (const i of bucket) {
      for (const j of candidates) {
        if (j <= i) continue
        const dist = haversine(rows[i].lat, rows[i].lng, rows[j].lat, rows[j].lng)
        if (dist > MAX_DIST_M) continue

        const ns = nameSim(rows[i].name, rows[j].name)
        const ts = typeScore(rows[i].type, rows[j].type)
        const score = compositeScore(dist, ns, ts)

        // Also always include literally same-spot pairs regardless of name
        const sameSpot = dist <= SAME_SPOT_M
        // And geo-only hard match (very close, must be almost same spot)
        const geoOnly = dist <= GEO_HARD_M && ts >= 0.5

        if (score >= MIN_SCORE || sameSpot || geoOnly) {
          uf.union(i, j)
          const pk = `${Math.min(i,j)}-${Math.max(i,j)}`
          if (!pairReasons.has(pk)) {
            pairReasons.set(pk, {
              dist: Math.round(dist),
              nameSim: Math.round(ns * 100),
              typeScore: ts,
              score: Math.round(score * 100)
            })
            totalPairs++
          }
        }
      }
    }
  }
  console.log(`  Total qualifying pairs: ${totalPairs}`)

  // ── Build groups ──────────────────────────────────────────────────────────
  const groupMap = new Map()
  for (let i = 0; i < n; i++) {
    const root = uf.find(i)
    if (!groupMap.has(root)) groupMap.set(root, [])
    groupMap.get(root).push(i)
  }

  const dupGroups = []
  for (const [, members] of groupMap) {
    if (members.length < 2) continue
    const terminals = members.map(idx => {
      const t = rows[idx]
      const myPairs = members
        .filter(j => j !== idx)
        .map(j => {
          const pk = `${Math.min(idx,j)}-${Math.max(idx,j)}`
          return pairReasons.get(pk) || null
        })
        .filter(Boolean)
      return {
        id: t.id,
        name: t.name,
        type: t.type,
        lat: t.lat,
        lng: t.lng,
        image: t.images?.[0] || null,
        minDistToOther: myPairs.length ? Math.min(...myPairs.map(p=>p.dist)) : null,
        maxNameSim: myPairs.length ? Math.max(...myPairs.map(p=>p.nameSim)) : null,
        maxScore: myPairs.length ? Math.max(...myPairs.map(p=>p.score)) : null,
        pairDetails: myPairs,
      }
    })
    terminals.sort((a,b) => a.name.localeCompare(b.name))

    // Group-level confidence: average of max pair scores
    const groupScore = Math.round(terminals.reduce((s,t) => s + (t.maxScore||0), 0) / terminals.length)

    dupGroups.push({ size: members.length, groupScore, terminals })
  }

  dupGroups.sort((a,b) => b.size - a.size)
  const totalDupes = dupGroups.reduce((s,g)=>s+g.size, 0)
  console.log(`\nDuplicate groups: ${dupGroups.length}`)
  console.log(`Total suspected duplicate terminals: ${totalDupes}`)

  fs.writeFileSync(OUT_PATH, JSON.stringify(dupGroups, null, 2))
  console.log(`Written → ${OUT_PATH}`)
}

main().catch(console.error)
