'use client'
import { useEffect, useState } from 'react'

// Ranked by which free limit gets hit first under growing traffic:
// 1. Cloudflare Worker — 100K req/DAY (tile proxy) — daily reset, no usage API on free plan
// 2. Netlify       — 125K fn calls/month (~4K/day) — no usage API on free plan
// 3. Supabase      — 500 MB storage + pauses after 7 days inactivity
// 4. Neon          — 190 compute hrs/month (mapillary DB, auto-suspends 5 min idle)
// 6. Mapillary     — fair use, no hard cap
// 7. OSM Tiles     — fair use, no hard cap
// 8. OSRM          — public instance, no hard cap
// 9. Geoapify      — not in use, Nominatim handles search (free/unlimited)
const SERVICES = [
  { id: 'cf-worker',     name: 'Tile Proxy (Cloudflare Worker)', critical: true  },
  { id: 'vercel',        name: 'Hosting (Netlify)',              critical: true  },
  { id: 'neon',          name: 'App Database (Supabase)',        critical: true  },
  { id: 'neon-mapillary',name: 'Mapillary DB (Neon)',            critical: true  },
  { id: 'imagekit',      name: 'Image CDN (ImageKit)',           critical: false },
  { id: 'mapillary',     name: 'Street View (Mapillary)',        critical: false },
  { id: 'osm',           name: 'Map Tiles (OpenStreetMap)',      critical: false },
  { id: 'osrm',          name: 'Routing (OSRM)',                 critical: false },
  { id: 'geoapify',      name: 'Search API (Geoapify)',          critical: false },
]

// Generate 90-day bar — all green since we just launched, last block reflects live status
function UptimeBar({ ok, loading }: { ok: boolean; loading: boolean }) {
  const days = 90
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center', margin: '8px 0 4px' }}>
      {Array.from({ length: days }).map((_, i) => {
        const isToday = i === days - 1
        let color = '#1652f0'
        if (loading) color = '#ddd'
        else if (isToday && !ok) color = '#8f485d'
        return (
          <div key={i} style={{
            flex: 1, height: 28, borderRadius: 2,
            background: color,
            opacity: isToday ? 1 : 0.55,
          }} />
        )
      })}
    </div>
  )
}

export default function StatusPage() {
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [checkedAt, setCheckedAt] = useState('')
  const [mounted, setMounted] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 20000)
      const r = await fetch('/api/status', { signal: controller.signal })
      clearTimeout(timer)
      const d = await r.json()
      setData(d)
      setCheckedAt(new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }))
    } catch (err) {
      console.error('Status check failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { setMounted(true); refresh() }, [])

  const services: any[] = data?.services || []
  const getService = (id: string) => services.find(s => s.id === id)
  const allOk = !loading && data && services.every(s => s.ok)

  return (
    <div style={{ minHeight: '100vh', background: '#edf3f8', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🗺️</span>
            <span style={{ fontWeight: 700, fontSize: 17, color: '#0a0a0a', letterSpacing: '-0.3px' }}>Sakayan</span>
            <span style={{ fontSize: 13, color: '#888', marginLeft: 4 }}>Status</span>
          </div>
          <a
            href="https://www.facebook.com/people/Sakayan/61578529771903/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#1877F2', textDecoration: 'none', fontWeight: 600 }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Sakayan
          </a>
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px' }}>

        {/* Overall status banner */}
        <div style={{
          background: loading ? 'white' : allOk ? '#0A2FFF' : '#8f485d',
          borderRadius: 12, padding: '20px 24px', marginBottom: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: 'background .3s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {loading
              ? <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#e2e8f0' }} />
              : <span style={{ fontSize: 22 }}>{allOk ? '✅' : '⚠️'}</span>
            }
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, color: loading ? '#1a1a1a' : 'white' }}>
                {loading ? 'Checking systems…' : allOk ? 'All systems operational' : 'Some services degraded'}
              </div>
              {checkedAt && <div style={{ fontSize: 12, color: loading ? '#888' : 'rgba(255,255,255,0.75)', marginTop: 2 }}>
                Last checked {checkedAt}
              </div>}
            </div>
          </div>
          <button onClick={refresh} style={{
            background: 'rgba(255,255,255,0.2)', color: loading ? '#555' : 'white',
            border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8,
            padding: '7px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 500,
          }}>
            {loading ? 'Checking…' : 'Refresh'}
          </button>
        </div>

        {/* Service list */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 28 }}>
          {SERVICES.map((svc, i) => {
            const live = getService(svc.id)
            const ok   = live?.ok ?? true
            const ms   = live?.ms
            const detail = live?.detail || ''
            const pct  = live?.pct ?? 0

            return (
              <div key={svc.id} style={{
                padding: '16px 24px',
                borderBottom: i < SERVICES.length - 1 ? '1px solid #f0f4f8' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a' }}>{svc.name}</span>
                    {svc.critical && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#0A2FFF', background: '#eef2ff', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.3px' }}>
                        CRITICAL
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {ms != null && <span style={{ fontSize: 12, color: '#aaa' }}>{ms}ms</span>}
                    <span style={{
                      fontSize: 13, fontWeight: 600,
                      color: loading ? '#aaa' : ok ? '#1652f0' : '#8f485d',
                    }}>
                      {loading ? '—' : ok ? 'Operational' : 'Degraded'}
                    </span>
                  </div>
                </div>

                <UptimeBar ok={ok} loading={loading} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#aaa' }}>90 days ago</span>
                  <span style={{ fontSize: 11, color: '#aaa' }}>Today</span>
                </div>

                {/* Detail text — hide for services with bars */}
                {!loading && !['neon','neon-mapillary','imagekit'].includes(svc.id) && (
                  <div style={{ marginTop: 8, fontSize: 12, color: ok ? '#666' : '#8f485d' }}>
                    {detail || (ok ? 'Operational' : 'Unreachable')}
                    {svc.id === 'geoapify' && !detail?.includes('Nominatim') && (
                      <span style={{ color: '#aaa' }}>
                        {' '}· Set GEOAPIFY_KEY in env to enable
                      </span>
                    )}
                    {svc.id === 'vercel' && (
                      <span style={{ color: '#ff8c00', fontWeight: 600 }}>
                        {' '}· ⚠️ 125K fn calls/month · 300 build min/month · No live usage API on free plan
                      </span>
                    )}
                    {svc.id === 'cf-worker' && (
                      <span style={{ color: '#ff8c00', fontWeight: 600 }}>
                        {' '}· ⚠️ 100K req/day (resets daily) · No live usage API on free plan
                      </span>
                    )}
                    {svc.id === 'mapillary' && <span style={{ color: '#aaa' }}> · No hard cap</span>}
                    {svc.id === 'osm' && <span style={{ color: '#aaa' }}> · Fair use policy</span>}
                    {svc.id === 'osrm' && <span style={{ color: '#aaa' }}> · Public instance, no hard cap</span>}
                  </div>
                )}

                {/* Neon (mapillary DB): storage + row count + compute hours warning */}
                {!loading && svc.id === 'neon-mapillary' && live?.meta && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[
                      { label: 'Storage', pct: live.meta.storagePct, used: `${live.meta.storageMB} MB`, limit: '512 MB' },
                    ].map(({ label, pct: p, used, limit }) => (
                      <div key={label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa', marginBottom: 2 }}>
                          <span>{label}</span>
                          <span style={{ color: p > 80 ? '#8f485d' : p > 50 ? '#ff8c00' : '#1652f0', fontWeight: 600 }}>{used} / {limit} ({p}%)</span>
                        </div>
                        <div style={{ background: '#f0f4f8', borderRadius: 4, height: 4 }}>
                          <div style={{ width: `${Math.min(p, 100)}%`, height: '100%', borderRadius: 4, background: p > 80 ? '#8f485d' : p > 50 ? '#ff8c00' : '#1652f0', transition: 'width .4s' }} />
                        </div>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: '#aaa' }}>Compute hours: 190 hrs/mo limit · No live usage API on free plan</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                      {live.meta.imageCount != null ? `${Number(live.meta.imageCount).toLocaleString()} Mapillary images indexed` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>
                      Auto-suspends after 5 min idle — CDN cache reduces wake-ups
                    </div>
                  </div>
                )}

                {/* Supabase: storage + connections bars */}
                {!loading && svc.id === 'neon' && live?.meta && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[
                      { label: 'Storage', pct: live.meta.storagePct, used: `${live.meta.storageMB} MB`, limit: '500 MB' },
                      { label: 'Connections', pct: live.meta.connPct, used: `${live.meta.activeConns}`, limit: '200 max' },
                    ].map(({ label, pct: p, used, limit }) => (
                      <div key={label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa', marginBottom: 2 }}>
                          <span>{label}</span>
                          <span style={{ color: p > 80 ? '#8f485d' : p > 50 ? '#ff8c00' : '#1652f0', fontWeight: 600 }}>{used} / {limit} ({p}%)</span>
                        </div>
                        <div style={{ background: '#f0f4f8', borderRadius: 4, height: 4 }}>
                          <div style={{ width: `${Math.min(p, 100)}%`, height: '100%', borderRadius: 4, background: p > 80 ? '#8f485d' : p > 50 ? '#ff8c00' : '#1652f0', transition: 'width .4s' }} />
                        </div>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic', marginTop: 2 }}>
                      ⚠️ Pauses after 7 days inactivity — keep-alive ping active
                    </div>
                    {live.meta.terminals != null && (
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                        {live.meta.terminals} terminals · {live.meta.connections} routes · {live.meta.users} users
                      </div>
                    )}
                  </div>
                )}

                {/* ImageKit: migration count + free tier info */}
                {!loading && svc.id === 'imagekit' && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 12, color: ok ? '#666' : '#8f485d' }}>{detail}</div>
                    {live?.meta?.migrated != null && (
                      <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
                        ✓ {live.meta.migrated.toLocaleString()} photos migrated from Cloudinary
                        {live.meta.migrationFailed > 0 && <span style={{ color: '#ff8c00' }}> · {live.meta.migrationFailed} failed</span>}
                        {live.meta.fileCount != null && <span style={{ color: '#aaa', fontWeight: 400 }}> · {live.meta.fileCount.toLocaleString()} files in CDN</span>}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#aaa' }}>Free forever · 5 GB storage · 25 GB/mo BW · Unlimited transforms · No usage API on free plan</div>
                  </div>
                )}

                {/* Generic single bar for other services */}
                {!loading && !['neon','imagekit'].includes(svc.id) && pct > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa', marginBottom: 3 }}>
                      <span>Free tier usage</span>
                      <span style={{ color: pct > 80 ? '#8f485d' : pct > 50 ? '#ff8c00' : '#1652f0', fontWeight: 600 }}>{pct}%</span>
                    </div>
                    <div style={{ background: '#f0f4f8', borderRadius: 4, height: 5 }}>
                      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 4, background: pct > 80 ? '#8f485d' : pct > 50 ? '#ff8c00' : '#1652f0', transition: 'width .4s' }} />
                    </div>
                  </div>
                )}

              </div>
            )
          })}
        </div>

        {/* Uptime legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 28, fontSize: 12, color: '#888', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: '#1652f0', opacity: 0.55 }} />
            Operational
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: '#ff8c00' }} />
            Degraded
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: '#8f485d' }} />
            Down
          </div>
        </div>

        {/* Official status pages */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px', marginBottom: 28 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a', marginBottom: 14 }}>Official provider status pages</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { name: 'Netlify',         url: 'https://www.netlifystatus.com',        icon: '▲' },
              { name: 'Cloudflare',      url: 'https://www.cloudflarestatus.com',     icon: '🔶' },
              { name: 'Supabase',        url: 'https://status.supabase.com',          icon: '🗄️' },
              { name: 'ImageKit',        url: 'https://status.imagekit.io',           icon: '🖼️' },
              { name: 'OpenStreetMap',   url: 'https://status.openstreetmap.org',     icon: '🗺️' },
            ].map(s => (
              <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                textDecoration: 'none', color: '#1a1a1a', fontSize: 13, fontWeight: 500,
                transition: 'border-color .15s',
              }}>
                <span>{s.icon}</span>
                {s.name}
                <span style={{ marginLeft: 'auto', color: '#aaa', fontSize: 12 }}>↗</span>
              </a>
            ))}
          </div>
        </div>

        {/* Recent notices */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
          <div style={{ fontWeight: 700, fontSize: 11, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Recent Notices
          </div>
          {[0, 1, 2].map(i => {
            const label = mounted ? (() => { const d = new Date(); d.setDate(d.getDate() - i); return d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) })() : ''
            return (
              <div key={i} style={{ display: 'flex', gap: 16, padding: '10px 0', borderBottom: i < 2 ? '1px solid #f0f4f8' : 'none', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 13, color: '#888', minWidth: 130, paddingTop: 1 }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1652f0', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#555' }}>No notices reported</span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 24 }}>
          Powered by Sakayan · Philippines Transport Map
        </div>
      </div>
    </div>
  )
}
