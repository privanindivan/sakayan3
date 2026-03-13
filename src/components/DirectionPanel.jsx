import { useState } from 'react'
import { TYPE_COLORS } from '../data/sampleData'

const ROUTE_COLORS = ['#4A90D9', '#FF6B35', '#27AE60', '#F39C12', '#8E44AD', '#E74C3C', '#1ABC9C']

function dist(a, b) {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng)
}

function findNearest(point, markers) {
  if (!markers.length) return null
  return markers.reduce((best, m) => dist(m, point) < dist(best, point) ? m : best)
}

// Build adjacency map: stopId → Set of connected stopIds
function buildAdjacency(connections) {
  const adj = {}
  for (const c of connections) {
    if (!adj[c.fromId]) adj[c.fromId] = new Set()
    if (!adj[c.toId])   adj[c.toId]   = new Set()
    adj[c.fromId].add(c.toId)
    adj[c.toId].add(c.fromId)
  }
  return adj
}

// DFS to find ALL simple paths from startId to endId
// Returns array of stopId arrays (each is a path)
function findAllPaths(startId, endId, adj, maxDepth = 10) {
  const results = []
  const visited = new Set()

  function dfs(current, path) {
    if (path.length > maxDepth) return
    if (current === endId) {
      results.push([...path])
      return
    }
    const neighbors = adj[current]
    if (!neighbors) return
    for (const next of neighbors) {
      if (!visited.has(next)) {
        visited.add(next)
        path.push(next)
        dfs(next, path)
        path.pop()
        visited.delete(next)
      }
    }
  }

  visited.add(startId)
  dfs(startId, [startId])
  // Sort by path length (shortest first)
  results.sort((a, b) => a.length - b.length)
  return results
}

function vehicleLabel(type) {
  if (type === 'UV Express') return 'UV'
  if (type === 'Jeepney')    return 'Jeep'
  return type
}

function vehicleEmoji(type) {
  if (type === 'Train')    return '🚆'
  if (type === 'Bus')      return '🚌'
  if (type === 'Tricycle') return '🛺'
  return '🚐'
}

function pathFare(stops) {
  const fares = stops.slice(0, -1).map(s => s.fare).filter(f => f != null)
  if (!fares.length) return null
  return fares.reduce((a, b) => a + b, 0)
}

export default function DirectionPanel({ fromPoint, toPoint, markers, connections, onClose, onMarkerSelect }) {
  const [selectedIdx, setSelectedIdx] = useState(0)

  const nearFrom = findNearest(fromPoint, markers)
  const nearTo   = findNearest(toPoint,   markers)

  const adj = buildAdjacency(connections)
  const allPaths = nearFrom && nearTo && nearFrom.id !== nearTo.id
    ? findAllPaths(nearFrom.id, nearTo.id, adj)
    : []

  // Build route objects: assign a color to each path
  const routes = allPaths.map((stopIds, i) => ({
    stopIds,
    color: ROUTE_COLORS[i % ROUTE_COLORS.length],
    label: `Route ${i + 1}`,
  }))

  const safeIdx = routes.length > 0 ? Math.min(selectedIdx, routes.length - 1) : 0
  const route   = routes[safeIdx] ?? null

  const steps = []
  if (route) {
    const stops = route.stopIds.map(id => markers.find(m => m.id === id)).filter(Boolean)
    steps.push({ kind: 'walk', label: `Walk to ${stops[0].name}` })
    for (let i = 0; i < stops.length - 1; i++) {
      steps.push({ kind: 'ride', from: stops[i], to: stops[i + 1], lineColor: route.color })
    }
    steps.push({ kind: 'walk', label: `Walk to ${toPoint.name || 'destination'}` })
  }

  return (
    <div className="dir-panel">
      <div className="dir-drag-handle" />

      {/* From / To header */}
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

      {/* Snapped stops */}
      {nearFrom && nearTo && (
        <div className="dir-snap-row">
          <span className="dir-snap-stop"
            style={{ borderColor: TYPE_COLORS[nearFrom.type] || '#888' }}>
            {nearFrom.name}
          </span>
          <span className="dir-snap-arrow">→</span>
          <span className="dir-snap-stop"
            style={{ borderColor: TYPE_COLORS[nearTo.type] || '#888' }}>
            {nearTo.name}
          </span>
        </div>
      )}

      {/* Route count */}
      {routes.length > 0 && (
        <div className="route-count-label">
          {routes.length === 1
            ? '1 route found'
            : `${routes.length} routes found — tap to switch`}
        </div>
      )}

      {/* Route option cards — shown when 2+ routes */}
      {routes.length > 1 && (
        <div className="route-options-row">
          {routes.map((r, i) => {
            const stops  = r.stopIds.map(id => markers.find(m => m.id === id)).filter(Boolean)
            const fare   = pathFare(stops)
            const active = safeIdx === i
            return (
              <button
                key={i}
                className={`route-option-card${active ? ' route-option-active' : ''}`}
                style={active ? { borderColor: r.color, background: r.color + '18' } : {}}
                onClick={() => setSelectedIdx(i)}
              >
                <span className="route-option-line-dot" style={{ background: r.color }} />
                <span className="route-option-num">{r.label}</span>
                <span className="route-option-stops">{r.stopIds.length - 1} stop{r.stopIds.length - 1 !== 1 ? 's' : ''}</span>
                {fare != null && <span className="route-option-fare">₱{Math.round(fare)}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Steps */}
      <div className="dir-steps">
        {routes.length === 0 && (
          <p className="dir-no-route">
            No route found. Connect the stops to create a route.
          </p>
        )}

        {route !== null && steps.map((step, i) =>
          step.kind === 'walk' ? (
            <div key={i} className="dir-step walk-step">
              <span className="dir-step-ico">🚶</span>
              <span className="dir-step-txt">{step.label}</span>
            </div>
          ) : (
            <div
              key={i}
              className="dir-step ride-step"
              onClick={() => onMarkerSelect?.(step.from)}
            >
              <span
                className="dir-step-ico ride-ico"
                style={{ background: step.lineColor || TYPE_COLORS[step.from.type] || '#6366F1' }}
              >
                {vehicleEmoji(step.from.type)}
              </span>
              <div className="dir-step-body">
                <span className="dir-ride-label" style={{ color: step.lineColor || TYPE_COLORS[step.from.type] || '#6366F1' }}>
                  {vehicleLabel(step.from.type)}
                  {step.from.fare != null && (
                    <span className="dir-step-fare"> · ₱{step.from.fare}</span>
                  )}
                </span>
                <span className="dir-ride-route">{step.from.name} → {step.to.name}</span>
              </div>
              <span className="dir-step-arrow">›</span>
            </div>
          )
        )}
      </div>
    </div>
  )
}
