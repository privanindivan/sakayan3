import { useState } from 'react'
import { TYPE_COLORS } from '../data/sampleData'

function dist(a, b) {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng)
}

function findNearest(point, markers) {
  if (!markers.length) return null
  return markers.reduce((best, m) => dist(m, point) < dist(best, point) ? m : best)
}

// Find up to maxPaths distinct paths; returns array of id-arrays, or null if none found
function findTopPaths(startId, endId, connections, maxPaths = 3) {
  if (startId === endId) return [[startId]]
  const results = []
  const queue   = [[startId]]
  let minLen    = Infinity

  while (queue.length > 0 && results.length < maxPaths) {
    const path    = queue.shift()
    const pathLen = path.length

    // Don't chase paths longer than shortest-found + 3 extra hops
    if (pathLen > Math.min(minLen + 3, 15)) continue

    const current   = path[pathLen - 1]
    const neighbors = connections
      .filter(c => c.fromId === current || c.toId === current)
      .map(c => c.fromId === current ? c.toId : c.fromId)
      .filter(n => !path.includes(n))

    for (const n of neighbors) {
      const next = [...path, n]
      if (n === endId) {
        results.push(next)
        if (next.length < minLen) minLen = next.length
        if (results.length >= maxPaths) break
      } else {
        queue.push(next)
      }
    }
  }

  return results.length > 0 ? results : null
}

// Short vehicle label
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

// Summarise unique vehicle types in a path
function pathTypeChips(stops) {
  const seen = new Set()
  return stops
    .filter(s => { if (seen.has(s.type)) return false; seen.add(s.type); return true })
    .map(s => ({ type: s.type, color: TYPE_COLORS[s.type] || '#888' }))
}

// Total base fare across a path (stops that have a fare field)
function pathFare(stops) {
  const fares = stops.slice(0, -1).map(s => s.fare).filter(f => f != null)
  if (!fares.length) return null
  return fares.reduce((a, b) => a + b, 0)
}

export default function DirectionPanel({ fromPoint, toPoint, markers, connections, onClose, onMarkerSelect }) {
  const [selectedIdx, setSelectedIdx] = useState(0)

  const nearFrom = findNearest(fromPoint, markers)
  const nearTo   = findNearest(toPoint,   markers)

  const paths = nearFrom && nearTo
    ? findTopPaths(nearFrom.id, nearTo.id, connections)
    : null

  // Guard: if selected index is out of bounds (e.g. paths changed), clamp to 0
  const safeIdx = paths ? Math.min(selectedIdx, paths.length - 1) : 0
  const path    = paths?.[safeIdx] ?? null

  const steps = []
  if (path?.length) {
    const stops = path.map(id => markers.find(m => m.id === id)).filter(Boolean)
    steps.push({ kind: 'walk', label: `Walk to ${stops[0].name}` })
    for (let i = 0; i < stops.length - 1; i++) {
      steps.push({ kind: 'ride', from: stops[i], to: stops[i + 1] })
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

      {/* Route count label — always shown when routes exist */}
      {paths && (
        <div className="route-count-label">
          {paths.length === 1
            ? '1 route via connected stops'
            : `${paths.length} routes found — tap to switch`}
        </div>
      )}

      {/* Route option cards — only shown when 2+ routes found */}
      {paths && paths.length > 1 && (
        <div className="route-options-row">
          {paths.map((p, i) => {
            const stops = p.map(id => markers.find(m => m.id === id)).filter(Boolean)
            const chips  = pathTypeChips(stops)
            const fare   = pathFare(stops)
            const active = safeIdx === i
            return (
              <button
                key={i}
                className={`route-option-card${active ? ' route-option-active' : ''}`}
                onClick={() => setSelectedIdx(i)}
              >
                <span className="route-option-num">Route {i + 1}</span>
                <span className="route-option-stops">{p.length - 1} stop{p.length - 1 !== 1 ? 's' : ''}</span>
                <div className="route-option-chips">
                  {chips.map(c => (
                    <span key={c.type} className="rt-chip" style={{ background: c.color }}>
                      {vehicleLabel(c.type)}
                    </span>
                  ))}
                </div>
                {fare != null && <span className="route-option-fare">₱{Math.round(fare)}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Steps for selected route */}
      <div className="dir-steps">
        {paths === null && (
          <p className="dir-no-route">No route found via connected stops.</p>
        )}

        {path !== null && steps.map((step, i) =>
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
                style={{ background: TYPE_COLORS[step.from.type] || '#6366F1' }}
              >
                {vehicleEmoji(step.from.type)}
              </span>
              <div className="dir-step-body">
                <span className="dir-ride-label" style={{ color: TYPE_COLORS[step.from.type] || '#6366F1' }}>
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
