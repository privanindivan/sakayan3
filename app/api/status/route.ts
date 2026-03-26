import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

async function pingUrl(url: string, timeoutMs = 5000): Promise<{ ok: boolean; ms: number }> {
  const start = Date.now()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return { ok: res.ok, ms: Date.now() - start }
  } catch {
    return { ok: false, ms: Date.now() - start }
  }
}

export async function GET() {
  const checks = await Promise.allSettled([

    // 1. Supabase DB — storage + connections (no compute hour cap on free tier)
    (async () => {
      const start = Date.now()
      try {
        const [size] = await sql`SELECT
          pg_database_size(current_database()) as bytes,
          (SELECT COUNT(*) FROM terminals)   as terminals,
          (SELECT COUNT(*) FROM connections) as connections,
          (SELECT COUNT(*) FROM users)       as users`

        const [connInfo] = await sql`SELECT
          count(*)::int as active,
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_conn`

        const usedMB     = Math.round(Number(size.bytes) / 1024 / 1024 * 10) / 10
        const limitMB    = 500   // Supabase free: 500 MB
        const storagePct = Math.round(usedMB / limitMB * 100)

        // Supabase free: 200 max client connections (session pooler)
        const connLimit  = 200
        const activeConns = connInfo.active
        const connPct    = Math.round(activeConns / connLimit * 100)

        const worstPct = Math.max(storagePct, connPct)

        return {
          id: 'neon', name: 'Supabase DB', critical: true,
          ok: true, ms: Date.now() - start,
          detail: `Storage ${usedMB} MB / ${limitMB} MB · Connections ${activeConns} / ${connLimit}`,
          pct: worstPct,
          meta: {
            terminals: size.terminals,
            connections: size.connections,
            users: size.users,
            storageMB: usedMB, storageLimitMB: limitMB, storagePct,
            activeConns, connLimit, connPct,
            computeHours: null, computeLimit: null, computePct: null,
          },
        }
      } catch (e: any) {
        return { id: 'neon', name: 'Supabase DB', critical: true, ok: false, ms: Date.now() - start, detail: e.message, pct: 0 }
      }
    })(),

    // 2. Cloudinary — storage + bandwidth + transformations
    (async () => {
      const start = Date.now()
      try {
        const usage: any = await cloudinary.api.usage()
        const storageMB      = Math.round((usage.storage?.usage || 0) / 1024 / 1024 * 10) / 10
        const storageLimitMB = 25 * 1024
        const bwMB           = Math.round((usage.bandwidth?.usage || 0) / 1024 / 1024 * 10) / 10
        const bwLimitMB      = 25 * 1024
        const transforms     = usage.transformations?.usage || 0
        const transformLimit = 25000 // free tier monthly limit
        const storagePct     = Math.round(storageMB / storageLimitMB * 100)
        const bwPct          = Math.round(bwMB / bwLimitMB * 100)
        const transformPct   = Math.round(transforms / transformLimit * 100)
        const pct            = Math.max(storagePct, bwPct, transformPct)
        return {
          id: 'cloudinary', name: 'Cloudinary', critical: false,
          ok: true, ms: Date.now() - start,
          detail: `Storage: ${storageMB} MB / 25 GB · BW: ${bwMB} MB / 25 GB · Transforms: ${transforms} / ${transformLimit}`,
          pct,
          meta: { storageMB, storageLimitMB, storagePct, bwMB, bwLimitMB, bwPct, transforms, transformLimit, transformPct },
        }
      } catch (e: any) {
        return { id: 'cloudinary', name: 'Cloudinary', critical: false, ok: false, ms: Date.now() - start, detail: e.message, pct: 0 }
      }
    })(),

    // 3. Netlify — ping the deployment itself
    (async () => {
      const start = Date.now()
      // Ping own API to check Netlify function health
      const siteUrl = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000'
      const { ok, ms } = await pingUrl(`${siteUrl}/api/health`, 5000)
      // Netlify free limits: 100 GB BW/month, 125K fn invocations/month, 300 build minutes/month
      return {
        id: 'vercel', name: 'Netlify (Hosting)', critical: true,
        ok: true, ms: Date.now() - start,
        detail: 'Free: 100 GB BW/mo · 125K fn calls/mo · 300 build min/mo · No usage API on free plan',
        pct: 0,
        meta: { note: 'Cannot retrieve live usage without Netlify Pro API token' },
      }
    })(),

    // 4. Mapillary
    (async () => {
      const token = process.env.VITE_MAPILLARY_TOKEN
      const { ok, ms } = await pingUrl(
        `https://graph.mapillary.com/images?access_token=${token}&fields=id&bbox=120.9,14.5,121.0,14.6&limit=1`,
        6000
      )
      return { id: 'mapillary', name: 'Mapillary (Street View)', critical: false, ok, ms, detail: ok ? 'API reachable' : 'Unreachable', pct: 0 }
    })(),

    // 5. Geoapify (search)
    (async () => {
      const key = process.env.GEOAPIFY_KEY
      if (!key) {
        // No key set — search runs on OSM Nominatim fallback, Geoapify not in use
        return {
          id: 'geoapify', name: 'Search API (Geoapify)', critical: false, ok: true, ms: 0,
          detail: 'Not configured — search uses OSM Nominatim (free, no cap)',
          pct: 0,
        }
      }
      const { ok, ms } = await pingUrl(
        `https://api.geoapify.com/v1/geocode/search?text=Manila&limit=1&apiKey=${key}`,
        6000
      )
      return {
        id: 'geoapify', name: 'Search API (Geoapify)', critical: false, ok, ms,
        detail: ok ? 'Active · Free: 3,000 req/day · Fallback: OSM Nominatim' : 'Unreachable — falling back to Nominatim',
        pct: 0,
      }
    })(),

    // 6. OSM Tiles
    (async () => {
      const { ok, ms } = await pingUrl('https://tile.openstreetmap.org/12/3254/1885.png', 6000)
      return { id: 'osm', name: 'OSM Map Tiles', critical: false, ok, ms, detail: ok ? 'Tiles serving · Free (fair use)' : 'Unreachable', pct: 0 }
    })(),

    // 7. OSRM Routing
    (async () => {
      const { ok, ms } = await pingUrl(
        'https://router.project-osrm.org/route/v1/driving/120.9842,14.5995;121.0,14.6?overview=false',
        6000
      )
      return { id: 'osrm', name: 'OSRM Routing', critical: false, ok, ms, detail: ok ? 'Router reachable · Free (public)' : 'Unreachable', pct: 0 }
    })(),
  ])

  const services = checks.map(c => c.status === 'fulfilled' ? c.value : { ok: false, detail: 'Check failed', pct: 0 })
  const allOk = services.every(s => s.ok)

  return NextResponse.json({ ok: allOk, services, checkedAt: new Date().toISOString() }, {
    headers: { 'Cache-Control': 'no-store' }
  })
}
