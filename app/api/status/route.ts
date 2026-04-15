import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { neonQuery } from '@/lib/neon-db'
import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'
import path from 'path'

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

    // 1. Netlify — hosting health
    (async () => {
      const start = Date.now()
      const siteUrl = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000'
      await pingUrl(`${siteUrl}/api/health`, 5000)
      // Netlify free limits: 100 GB BW/month, 125K fn invocations/month, 300 build minutes/month
      return {
        id: 'vercel', name: 'Netlify (Hosting)', critical: true,
        ok: true, ms: Date.now() - start,
        detail: 'Free: 100 GB BW/mo · 125K fn calls/mo · 300 build min/mo · No usage API on free plan',
        pct: 0,
        meta: { note: 'Cannot retrieve live usage without Netlify Pro API token' },
      }
    })(),

    // 2. Neon DB — mapillary_images storage + row count + compute hours
    (async () => {
      const start = Date.now()
      if (!neonQuery) {
        return {
          id: 'neon-mapillary', name: 'Mapillary DB (Neon)', critical: true,
          ok: false, ms: 0,
          detail: 'NEON_DATABASE_URL not configured',
          pct: 0,
        }
      }
      try {
        const [info] = await neonQuery(`SELECT
          pg_database_size(current_database()) as bytes,
          (SELECT COUNT(*) FROM mapillary_images) as image_count`)

        const storageMB      = Math.round(Number(info.bytes) / 1024 / 1024 * 10) / 10
        const storageLimitMB = 512   // Neon free: 512 MB
        const storagePct     = Math.round(storageMB / storageLimitMB * 100)
        const imageCount     = Number(info.image_count)

        // Neon free: 190 compute hours/month — no live API, estimate ~0 since status check is rare
        const computeHours = null
        const computeLimit = 190
        const computePct   = null

        const pct = storagePct

        return {
          id: 'neon-mapillary', name: 'Mapillary DB (Neon)', critical: true,
          ok: true, ms: Date.now() - start,
          detail: `Storage ${storageMB} MB / ${storageLimitMB} MB · ${imageCount.toLocaleString()} images`,
          pct,
          meta: {
            imageCount,
            storageMB, storageLimitMB, storagePct,
            computeHours, computeLimit, computePct,
          },
        }
      } catch (e: any) {
        return { id: 'neon-mapillary', name: 'Mapillary DB (Neon)', critical: true, ok: false, ms: Date.now() - start, detail: e.message, pct: 0 }
      }
    })(),

    // 3. Supabase DB — storage + connections (no compute hour cap on free tier)
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
        const connLimit   = 200
        const activeConns = connInfo.active
        const connPct     = Math.round(activeConns / connLimit * 100)

        const worstPct = Math.max(storagePct, connPct)

        return {
          id: 'neon', name: 'App DB (Supabase)', critical: true,
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
        return { id: 'neon', name: 'App DB (Supabase)', critical: true, ok: false, ms: Date.now() - start, detail: e.message, pct: 0 }
      }
    })(),

    // 4. Cloudinary — storage + bandwidth + transformations (over quota, migrating to ImageKit)
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

        // Read migration progress
        let migrated = 0, migrationTotal = 0
        try {
          const progressFile = path.join(process.cwd(), 'scripts', 'imagekit_migration_progress.json')
          if (fs.existsSync(progressFile)) {
            const prog = JSON.parse(fs.readFileSync(progressFile, 'utf8'))
            migrated = Object.keys(prog.done || {}).length
          }
        } catch {}

        // Credits used vs 25 limit (Cloudinary "credits" = combined usage score)
        const creditsUsed = usage.credits?.usage ?? null
        const creditsLimit = usage.credits?.limit ?? 25

        return {
          id: 'cloudinary', name: 'Cloudinary (migrating → ImageKit)', critical: false,
          ok: pct < 100, ms: Date.now() - start,
          detail: `Storage: ${storageMB} MB / 25 GB · BW: ${bwMB} MB / 25 GB · Transforms: ${transforms} / ${transformLimit}`,
          pct,
          meta: {
            storageMB, storageLimitMB, storagePct,
            bwMB, bwLimitMB, bwPct,
            transforms, transformLimit, transformPct,
            creditsUsed, creditsLimit,
            migrated, migrationTotal,
            overQuota: pct >= 100 || (creditsUsed !== null && creditsUsed >= creditsLimit),
          },
        }
      } catch (e: any) {
        return { id: 'cloudinary', name: 'Cloudinary (migrating → ImageKit)', critical: false, ok: false, ms: Date.now() - start, detail: e.message, pct: 0 }
      }
    })(),

    // 4b. ImageKit — new image CDN (replacing Cloudinary)
    (async () => {
      const start = Date.now()
      const privateKey = process.env.IMAGEKIT_PRIVATE_KEY
      if (!privateKey) {
        return {
          id: 'imagekit', name: 'Image CDN (ImageKit)', critical: false,
          ok: false, ms: 0, detail: 'IMAGEKIT_PRIVATE_KEY not configured', pct: 0,
        }
      }

      // Read migration progress first (always available locally)
      let migrated = 0, migrationFailed = 0, migrationTotal = 0
      try {
        const progressFile = path.join(process.cwd(), 'scripts', 'imagekit_migration_progress.json')
        if (fs.existsSync(progressFile)) {
          const prog = JSON.parse(fs.readFileSync(progressFile, 'utf8'))
          migrated = Object.keys(prog.done || {}).length
          migrationFailed = (prog.failed || []).length
        }
      } catch {}

      try {
        const auth = 'Basic ' + Buffer.from(privateKey + ':').toString('base64')
        // Use files list API to verify key works + get approximate file count in /sakayan folder
        const res = await fetch('https://api.imagekit.io/v1/files?path=/sakayan&skip=0&limit=1', {
          headers: { Authorization: auth },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        // Get total count from headers or response
        const totalHeader = res.headers.get('x-total-count')
        const fileCount = totalHeader ? parseInt(totalHeader) : null

        return {
          id: 'imagekit', name: 'Image CDN (ImageKit)', critical: false,
          ok: true, ms: Date.now() - start,
          detail: `API reachable · Free: 5 GB storage · 25 GB/mo bandwidth · Unlimited transforms`,
          pct: 0,
          meta: { fileCount, migrated, migrationFailed },
        }
      } catch (e: any) {
        return {
          id: 'imagekit', name: 'Image CDN (ImageKit)', critical: false,
          ok: false, ms: Date.now() - start,
          detail: e.message, pct: 0,
          meta: { migrated, migrationFailed },
        }
      }
    })(),

    // 5. Cloudflare Worker — tile proxy (100K req/day free, daily reset)
    (async () => {
      const start = Date.now()
      const workerUrl = 'https://sakayan-tile-proxy.privanindivan.workers.dev'
      // Ping with a real tile (z=14, Manila area)
      const { ok, ms } = await pingUrl(`${workerUrl}/14/13486/7776`, 6000)
      return {
        id: 'cf-worker', name: 'Tile Proxy (Cloudflare Worker)', critical: true,
        ok, ms,
        detail: ok
          ? 'Tile proxy live · Free: 100K req/day · Handles all Mapillary tile traffic · No usage API on free plan'
          : 'Worker unreachable — Mapillary dots will not load',
        pct: 0,
        meta: { note: 'Usage resets daily; no API to read live count on free plan' },
      }
    })(),

    // 7. Mapillary
    (async () => {
      const token = process.env.MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN
      const { ok, ms } = await pingUrl(
        `https://graph.mapillary.com/images?access_token=${token}&fields=id&bbox=120.9,14.5,121.0,14.6&limit=1`,
        6000
      )
      return { id: 'mapillary', name: 'Mapillary (Street View)', critical: false, ok, ms, detail: ok ? 'API reachable · Fair use, no hard cap' : 'Unreachable', pct: 0 }
    })(),

    // 9. Geoapify (search)
    (async () => {
      const key = process.env.GEOAPIFY_KEY
      if (!key) {
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

    // 10. OSM Tiles
    (async () => {
      const { ok, ms } = await pingUrl('https://tile.openstreetmap.org/12/3254/1885.png', 6000)
      return { id: 'osm', name: 'OSM Map Tiles', critical: false, ok, ms, detail: ok ? 'Tiles serving · Free (fair use)' : 'Unreachable', pct: 0 }
    })(),

    // 11. OSRM Routing
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
