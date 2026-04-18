import { useState, useRef, useEffect, useCallback } from 'react'
import { TYPE_COLORS } from '../data/sampleData'

const ROUTE_COLORS = ['#4A90D9', '#FF6B35', '#27AE60', '#F39C12', '#8E44AD', '#E74C3C', '#1ABC9C']

const PEEK_H  = 72   // px — just drag handle + endpoint names visible
const HALF_H  = 0.46  // % of window height
const FULL_H  = 0.88  // % of window height

function dist(a, b) {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng)
}
// Return up to k nearest terminals sorted by distance
function findKNearest(point, markers, k = 8) {
  return [...markers].sort((a, b) => dist(a, point) - dist(b, point)).slice(0, k)
}
function buildAdjacency(connections) {
  const adj = {}
  for (const c of connections) {
    if (!adj[c.fromId]) adj[c.fromId] = []
    if (!adj[c.toId])   adj[c.toId]   = []
    adj[c.fromId].push({ connId: c.id, neighborId: c.toId,   color: c.color || '' })
    adj[c.toId].push(  { connId: c.id, neighborId: c.fromId, color: c.color || '' })
  }
  return adj
}
function findAllPaths(startId, endId, adj, maxDepth = 10, maxResults = 30) {
  const results      = []
  const visitedStops = new Set()
  function dfs(current, stopPath, colors, connPath) {
    if (results.length >= maxResults) return
    if (stopPath.length > maxDepth) return
    if (current === endId) {
      results.push({ stopIds: [...stopPath], colors: [...colors], connIds: [...connPath] })
      return
    }
    const edges = adj[current]
    if (!edges) return
    for (const { connId, neighborId, color } of edges) {
      if (!visitedStops.has(neighborId)) {
        visitedStops.add(neighborId)
        stopPath.push(neighborId)
        colors.push(color)
        connPath.push(connId)
        dfs(neighborId, stopPath, colors, connPath)
        stopPath.pop()
        colors.pop()
        connPath.pop()
        visitedStops.delete(neighborId)
      }
    }
  }
  visitedStops.add(startId)
  dfs(startId, [startId], [], [])
  results.sort((a, b) => a.stopIds.length - b.stopIds.length)
  return results
}
function pathColor(colors, idx) {
  return colors[idx] || ROUTE_COLORS[idx % ROUTE_COLORS.length]
}
function vehicleEmoji(type) {
  if (type === 'Train')    return '🚆'
  if (type === 'Bus')      return '🚌'
  if (type === 'Tricycle') return '🛺'
  return '🚐'
}
// km/h averages per vehicle type for straight-line fallback estimates
const SPEED_KMH = { Jeep: 25, Bus: 30, 'UV Express': 35, Tricycle: 15, Train: 60 }
const WALK_KMH  = 4.5
// Straight-line → road-distance factors (haversine underestimates actual road length)
const ROAD_FACTOR = 1.4
const WALK_FACTOR = 1.3

function haversineKm(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(s))
}
// Check if point is within thresholdKm of any geometry coordinate (samples every 3rd point)
function geometryNear(point, geometry, thresholdKm = 1.5) {
  if (!geometry || !geometry.length) return false
  for (let i = 0; i < geometry.length; i += 3) {
    const [lat, lng] = geometry[i]
    if (haversineKm(point, { lat, lng }) <= thresholdKm) return true
  }
  return false
}
// Walk time from point to nearest geometry coordinate
function walkSecsToGeometry(point, geometry) {
  if (!geometry || !geometry.length) return null
  let minKm = Infinity
  for (let i = 0; i < geometry.length; i += 2) {
    const [lat, lng] = geometry[i]
    const d = haversineKm(point, { lat, lng })
    if (d < minKm) minKm = d
  }
  return Math.round((minKm * WALK_FACTOR / WALK_KMH) * 3600)
}
function estimateSecs(fromM, toM) {
  return Math.round((haversineKm(fromM, toM) * ROAD_FACTOR / (SPEED_KMH[fromM.type] ?? 25)) * 3600)
}
function walkSecs(a, b) {
  return Math.round((haversineKm(a, b) * WALK_FACTOR / WALK_KMH) * 3600)
}

// Returns the duration (seconds) for a single connection, using stored value or estimating.
function connDuration(conn, markers) {
  if (conn.duration != null) return conn.duration
  if (!markers) return null
  const from = markers.find(m => m.id === conn.fromId)
  const to   = markers.find(m => m.id === conn.toId)
  return (from && to) ? estimateSecs(from, to) : null
}

function pathFare(connIds, connections) {
  const fares = connIds.map(id => connections.find(c => c.id === id)?.fare).filter(f => f != null).map(Number)
  if (!fares.length) return null
  return fares.reduce((a, b) => a + b, 0)
}
function segmentFare(fromId, toId, connections) {
  const conn = connections.find(c =>
    (c.fromId === fromId && c.toId === toId) ||
    (c.fromId === toId   && c.toId === fromId)
  )
  return conn?.fare ?? null
}
function pathDuration(connIds, connections, markers) {
  const durations = connIds
    .map(id => connections.find(c => c.id === id))
    .filter(Boolean)
    .map(conn => connDuration(conn, markers))
    .filter(d => d != null)
  if (!durations.length) return null
  return durations.reduce((a, b) => a + b, 0)
}
function segmentDuration(fromId, toId, connections, markers) {
  const conn = connections.find(c =>
    (c.fromId === fromId && c.toId === toId) ||
    (c.fromId === toId   && c.toId === fromId)
  )
  return conn ? connDuration(conn, markers) : null
}
function fmtDuration(secs) {
  if (secs == null) return null
  const mins = Math.round(secs / 60)
  if (mins < 60) return `~${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `~${h}h ${m}m` : `~${h}h`
}

// ── Swipe-to-snap hook ─────────────────────────────────────────────────────
function useSwipeSheet(sheetRef) {
  const [snap,    setSnap]    = useState('half')   // 'peek' | 'half' | 'full'
  const dragging  = useRef(false)
  const startY    = useRef(0)
  const startH    = useRef(0)

  const snapHeight = useCallback((s) => {
    const wh = window.innerHeight
    if (s === 'peek') return PEEK_H
    if (s === 'full') return Math.round(wh * FULL_H)
    return Math.round(wh * HALF_H)
  }, [])

  // Apply live height while dragging (no transition)
  const applyH = (h) => {
    if (!sheetRef.current) return
    sheetRef.current.style.transition = 'none'
    sheetRef.current.style.height = h + 'px'
  }

  // Snap to state (with transition)
  const snapTo = useCallback((s) => {
    setSnap(s)
    if (!sheetRef.current) return
    sheetRef.current.style.transition = 'height 0.28s cubic-bezier(0.32,0.72,0,1)'
    sheetRef.current.style.height = snapHeight(s) + 'px'
  }, [sheetRef, snapHeight])

  const onPointerDown = useCallback((e) => {
    dragging.current = true
    startY.current = e.touches ? e.touches[0].clientY : e.clientY
    startH.current = sheetRef.current?.getBoundingClientRect().height ?? snapHeight('half')
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [sheetRef, snapHeight])

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const delta   = startY.current - clientY       // +ve = finger moved up = taller sheet
    const wh      = window.innerHeight
    const newH    = Math.max(PEEK_H, Math.min(Math.round(wh * FULL_H), startH.current + delta))
    applyH(newH)
  }, [])

  const onPointerUp = useCallback((e) => {
    if (!dragging.current) return
    dragging.current = false
    const wh = window.innerHeight
    const h  = sheetRef.current?.getBoundingClientRect().height ?? snapHeight('half')
    // Snap to nearest breakpoint
    const peekH = PEEK_H
    const halfH = Math.round(wh * HALF_H)
    const fullH = Math.round(wh * FULL_H)
    const dists = [
      { s: 'peek', d: Math.abs(h - peekH) },
      { s: 'half', d: Math.abs(h - halfH) },
      { s: 'full', d: Math.abs(h - fullH) },
    ]
    const best = dists.reduce((a, b) => a.d < b.d ? a : b).s
    snapTo(best)
  }, [sheetRef, snapHeight, snapTo])

  // Sync height when snap state changes from outside (e.g. initial mount)
  useEffect(() => {
    snapTo(snap)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { snap, snapTo, onPointerDown, onPointerMove, onPointerUp }
}

export default function DirectionPanel({
  fromPoint, toPoint, markers, connections,
  onClose, onActiveRoute, onSegmentFocus,
}) {
  const sheetRef  = useRef(null)
  const { snap, snapTo, onPointerDown, onPointerMove, onPointerUp } = useSwipeSheet(sheetRef)

  const [expanded, setExpanded] = useState({})
  const [sortBy, setSortBy]     = useState('best')

  const adj           = buildAdjacency(connections)
  // If the point came from a terminal search, use it directly; else find nearest
  const fromExact = fromPoint.id ? markers.find(m => m.id === fromPoint.id) : null
  const toExact   = toPoint.id   ? markers.find(m => m.id === toPoint.id)   : null
  const fromCandidates = fromExact ? [fromExact, ...findKNearest(fromPoint, markers, 7).filter(m => m.id !== fromExact.id)] : findKNearest(fromPoint, markers, 8)
  const toCandidates   = toExact   ? [toExact,   ...findKNearest(toPoint,   markers, 7).filter(m => m.id !== toExact.id)]   : findKNearest(toPoint,   markers, 8)

  // Try all from/to candidate pairs and collect unique routes
  const seenStopKeys = new Set()
  const allFoundRoutes = []
  for (const fc of fromCandidates) {
    for (const tc of toCandidates) {
      if (fc.id === tc.id) continue
      const paths = findAllPaths(fc.id, tc.id, adj, 10, 20)
      for (const path of paths) {
        // Deduplicate by stop sequence — same stops = same route regardless of conn IDs
        const key = (path.stopIds ?? []).join(',')
        if (seenStopKeys.has(key)) continue
        seenStopKeys.add(key)
        allFoundRoutes.push({ ...path, fromMarker: fc, toMarker: tc })
        if (allFoundRoutes.length >= 8) break // cap total results shown
      }
      if (allFoundRoutes.length >= 8) break
    }
    if (allFoundRoutes.length >= 8) break
  }

  // Circular routes: check if any circular connection's geometry passes near both points
  if (allFoundRoutes.length < 8) {
    for (const conn of connections) {
      if (conn.fromId !== conn.toId) continue
      if (allFoundRoutes.length >= 8) break
      const key = `circ:${conn.id}`
      if (seenStopKeys.has(key)) continue
      const terminal = markers.find(m => m.id === conn.fromId)
      if (!terminal) continue
      const fromNear = geometryNear(fromPoint, conn.geometry, 1.5)
      const toNear   = geometryNear(toPoint,   conn.geometry, 1.5)
      if (fromNear && toNear) {
        seenStopKeys.add(key)
        allFoundRoutes.push({
          stopIds: [terminal.id, terminal.id],
          colors: [conn.color || '#4A90D9'],
          connIds: [conn.id],
          fromMarker: terminal,
          toMarker: terminal,
          isCircular: true,
        })
      }
    }
  }

  const routes = allFoundRoutes.map(({ stopIds, connIds, colors, fromMarker, toMarker, isCircular }, i) => {
    const fare     = pathFare(connIds ?? [], connections)
    const rideDur  = pathDuration(connIds ?? [], connections, markers)
    const circConn = isCircular ? connections.find(c => c.id === connIds?.[0]) : null
    const wIn      = isCircular && circConn?.geometry
      ? walkSecsToGeometry(fromPoint, circConn.geometry)
      : walkSecs(fromPoint, fromMarker)
    const wOut     = isCircular && circConn?.geometry
      ? walkSecsToGeometry(toPoint, circConn.geometry)
      : walkSecs(toMarker, toPoint)
    const duration = rideDur != null ? rideDur + wIn + wOut : (wIn != null && wOut != null ? wIn + wOut : null)
    return {
      stopIds, connIds, colors, fromMarker, toMarker, isCircular,
      walkInSecs: wIn, walkOutSecs: wOut,
      color: colors[0] || ROUTE_COLORS[i % ROUTE_COLORS.length],
      label: `Route ${i + 1}`,
      fare, duration,
    }
  })

  const sortedRoutes = [...routes].sort((a, b) => {
    if (sortBy === 'cheapest') {
      if (a.fare == null && b.fare == null) return 0
      if (a.fare == null) return 1
      if (b.fare == null) return -1
      return a.fare - b.fare
    }
    if (sortBy === 'fastest') {
      if (a.duration == null && b.duration == null) return 0
      if (a.duration == null) return 1
      if (b.duration == null) return -1
      return a.duration - b.duration
    }
    // 'best': fewest transfers (hops), tiebreak by duration
    const hopsA = a.stopIds.length - 1
    const hopsB = b.stopIds.length - 1
    if (hopsA !== hopsB) return hopsA - hopsB
    if (a.duration == null) return 1
    if (b.duration == null) return -1
    return a.duration - b.duration
  })

  // On mount, tell parent which route is active (first one) and expand it
  useEffect(() => {
    if (routes.length > 0) {
      onActiveRoute?.(routes[0].stopIds, routes[0].connIds ?? [])
      setExpanded({ 0: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = (i) => {
    setExpanded(prev => {
      const open = !prev[i]
      if (open) onActiveRoute?.(routes[i].stopIds, routes[i].connIds ?? [])
      return { ...prev, [i]: open }
    })
  }

  const buildSteps = (route) => {
    if (route.isCircular) {
      const conn = connections.find(c => c.id === route.connIds?.[0])
      const color = route.colors[0] || '#4A90D9'
      return [
        { kind: 'walk', label: `Walk to boarding point`, secs: route.walkInSecs },
        { kind: 'ride', from: route.fromMarker, to: route.toMarker, segColor: color, connId: route.connIds?.[0], circular: true },
        { kind: 'walk', label: `Walk to ${toPoint.name || 'destination'}`, secs: route.walkOutSecs },
      ]
    }
    const stops = route.stopIds.map(id => markers.find(m => m.id === id)).filter(Boolean)
    if (!stops.length) return []
    const steps = [{ kind: 'walk', label: `Walk to ${route.fromMarker.name}`, secs: route.walkInSecs }]
    for (let i = 0; i < stops.length - 1; i++) {
      steps.push({ kind: 'ride', from: stops[i], to: stops[i + 1], segColor: pathColor(route.colors, i), connId: route.connIds?.[i] })
    }
    steps.push({ kind: 'walk', label: `Walk to ${toPoint.name || 'destination'}`, secs: route.walkOutSecs })
    return steps
  }

  const isPeeking = snap === 'peek'

  return (
    <div
      ref={sheetRef}
      className="dir-panel"
      style={{ overflow: isPeeking ? 'hidden' : 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      {/* Drag handle — pointer events here trigger swipe */}
      <div
        className="dir-drag-handle-wrap"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
        style={{ touchAction: 'none', cursor: 'ns-resize', padding: '10px 0 4px' }}
      >
        <div className="dir-drag-handle" />
      </div>

      {/* Header always visible */}
      <div className="dir-header">
        <div className="dir-endpoints">
          <div className="dir-endpoint">
            <span className="dir-dot from-dot" />
            <span className="dir-endpoint-name">{fromPoint.name || 'Starting point'}</span>
          </div>
          <div className="dir-endpoint-line" />
          <div className="dir-endpoint">
            <span className="dir-dot to-dot" />
            <span className="dir-endpoint-name">{toPoint.name || 'Destination'}</span>
          </div>
        </div>
        <button className="dir-close" onClick={onClose} aria-label="Close">&#x2715;</button>
      </div>

      {/* Scrollable body — hidden when peeking */}
      <div className="dir-body" style={{ overflowY: isPeeking ? 'hidden' : 'auto', flex: 1 }}>
        {routes.length > 0 && (
          <div className="dir-snap-row">
            <span className="dir-snap-stop" style={{ borderColor: TYPE_COLORS[routes[0].fromMarker.type] || '#888' }}>
              {routes[0].isCircular ? (fromCandidates[0]?.name || routes[0].fromMarker.name) : routes[0].fromMarker.name}
            </span>
            <span className="dir-snap-arrow">→</span>
            <span className="dir-snap-stop" style={{ borderColor: TYPE_COLORS[routes[0].toMarker.type] || '#888' }}>
              {routes[0].isCircular ? (toCandidates[0]?.name || routes[0].toMarker.name) : routes[0].toMarker.name}
            </span>
          </div>
        )}

        {routes.length === 0 && (() => {
          const nearFrom = fromCandidates[0]
          const nearTo   = toCandidates[0]
          const wFrom    = nearFrom ? fmtDuration(walkSecs(fromPoint, nearFrom)) : null
          const wTo      = nearTo   ? fmtDuration(walkSecs(toPoint,   nearTo))   : null
          return (
            <div className="dir-no-route-block">
              <div className="dir-no-route-icon">🔍</div>
              <p className="dir-no-route-title">No connected route found</p>
              <p className="dir-no-route-sub">No transit connection exists yet between these areas.</p>
              {nearFrom && (
                <div className="dir-no-route-hint">
                  <span className="dir-dot from-dot" style={{display:'inline-block',marginRight:6}}/>
                  <span>Nearest stop to origin: <b>{nearFrom.name}</b></span>
                  {wFrom && <span className="dir-no-route-walk"> · {wFrom} walk</span>}
                </div>
              )}
              {nearTo && (
                <div className="dir-no-route-hint">
                  <span className="dir-dot to-dot" style={{display:'inline-block',marginRight:6}}/>
                  <span>Nearest stop to destination: <b>{nearTo.name}</b></span>
                  {wTo && <span className="dir-no-route-walk"> · {wTo} walk</span>}
                </div>
              )}
            </div>
          )
        })()}

        {/* Sort pills — only show when there are multiple routes */}
        {routes.length > 1 && (
          <div className="dir-sort-row">
            {[
              { key: 'best',     label: 'Best' },
              { key: 'fastest',  label: '⚡ Fastest' },
              { key: 'cheapest', label: '₱ Cheapest' },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`dir-sort-pill${sortBy === key ? ' dir-sort-pill-active' : ''}`}
                onClick={() => setSortBy(key)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* All routes shown as accordion */}
        {sortedRoutes.map((route, i) => {
          const { fare, duration } = route
          const steps = buildSteps(route)
          const open     = !!expanded[i]
          return (
            <div key={i} className="dir-route-block">
              <button
                className={`dir-route-header${open ? ' dir-route-header-open' : ''}`}
                onClick={() => toggleExpand(i)}
                style={{ borderLeft: `4px solid ${route.color}` }}
              >
                <span className="dir-route-dot" style={{ background: route.color }} />
                <span className="dir-route-title">{route.label}</span>
                <span className="dir-route-hops">{route.isCircular ? 'Circular' : `${route.stopIds.length - 1} hop${route.stopIds.length - 1 !== 1 ? 's' : ''}`}</span>
                {fmtDuration(duration) && <span className="dir-route-fare">{fmtDuration(duration)}</span>}
                {fare != null && <span className="dir-route-fare">₱{Math.round(fare)}</span>}
                <span className="dir-route-chevron">{open ? '▲' : '▼'}</span>
              </button>

              {open && (
                <div className="dir-steps">
                  {steps.map((step, si) => {
                    if (step.kind === 'walk') return (
                      <div key={si} className="dir-step walk-step">
                        <span className="dir-step-ico">🚶</span>
                        <span className="dir-step-txt">{step.label}</span>
                        {step.secs > 0 && <span className="dir-step-fare">{fmtDuration(step.secs)}</span>}
                      </div>
                    )
                    const segDurStr  = fmtDuration(segmentDuration(step.from.id, step.to.id, connections, markers))
                    const segFareVal = segmentFare(step.from.id, step.to.id, connections)
                    return (
                      <div
                        key={si}
                        className="dir-step ride-step"
                        onClick={() => {
                          onSegmentFocus?.(step.from.id, step.to.id, step.connId)
                          if (snap === 'full') snapTo('half')
                        }}
                      >
                        <span className="dir-step-ico ride-ico" style={{ background: step.segColor }}>
                          {vehicleEmoji(step.from.type)}
                        </span>
                        <div className="dir-step-body">
                          <span className="dir-ride-label" style={{ color: step.segColor }}>
                            {step.from.type}
                            {segDurStr  && <span className="dir-step-fare"> · {segDurStr}</span>}
                            {segFareVal != null && <span className="dir-step-fare"> · ₱{segFareVal}</span>}
                          </span>
                          <span className="dir-ride-route">{step.circular ? `Circular route via ${step.from.name}` : `${step.from.name} → ${step.to.name}`}</span>
                        </div>
                        <span className="dir-step-arrow">›</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Tap-to-expand hint when peeking */}
      {isPeeking && (
        <div
          className="dir-peek-tap"
          onClick={() => snapTo('half')}
        >
          Tap to expand
        </div>
      )}
    </div>
  )
}
