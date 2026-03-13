import { useState } from 'react'
import { TYPE_COLORS } from '../data/sampleData'

function dist(a, b) {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng)
}

function findNearest(point, markers) {
  if (!markers.length) return null
  return markers.reduce((best, m) => dist(m, point) < dist(best, point) ? m : best)
}

// Find all named lines that contain both fromId and toId.
// Returns array of { lineName, lineColor, stopIds } or null.
function findRoutesByLines(fromId, toId, lines) {
  if (fromId === toId) return null
  const results = []

  for (const line of lines) {
    const i = line.stopIds.indexOf(fromId)
    const j = line.stopIds.indexOf(toId)
    if (i === -1 || j === -1 || i === j) continue
    // Slice in the correct direction (lines are bidirectional)
    const stopIds = i < j
      ? line.stopIds.slice(i, j + 1)
      : line.stopIds.slice(j, i + 1).reverse()
    results.push({ lineName: line.name, lineColor: line.color, stopIds })
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

// Total base fare across a path
function pathFare(stops) {
  const fares = stops.slice(0, -1).map(s => s.fare).filter(f => f != null)
  if (!fares.length) return null
  return fares.reduce((a, b) => a + b, 0)
}

export default function DirectionPanel({ fromPoint, toPoint, markers, lines, onClose, onMarkerSelect }) {
  const [selectedIdx, setSelectedIdx] = useState(0)

  const nearFrom = findNearest(fromPoint, markers)
  const nearTo   = findNearest(toPoint,   markers)

  const routes = nearFrom && nearTo
    ? findRoutesByLines(nearFrom.id, nearTo.id, lines)
    : null

  const safeIdx = routes ? Math.min(selectedIdx, routes.length - 1) : 0
  const route   = routes?.[safeIdx] ?? null

  const steps = []
  if (route) {
    const stops = route.stopIds.map(id => markers.find(m => m.id === id)).filter(Boolean)
    steps.push({ kind: 'walk', label: `Walk to ${stops[0].name}` })
    for (let i = 0; i < stops.length - 1; i++) {
      steps.push({ kind: 'ride', from: stops[i], to: stops[i + 1], lineColor: route.lineColor })
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

      {/* Route count label */}
      {routes && (
        <div className="route-count-label">
          {routes.length === 1
            ? '1 route found'
            : `${routes.length} routes found — tap to switch`}
        </div>
      )}

      {/* Route option cards — shown when 2+ routes */}
      {routes && routes.length > 1 && (
        <div className="route-options-row">
          {routes.map((r, i) => {
            const stops  = r.stopIds.map(id => markers.find(m => m.id === id)).filter(Boolean)
            const fare   = pathFare(stops)
            const active = safeIdx === i
            return (
              <button
                key={i}
                className={`route-option-card${active ? ' route-option-active' : ''}`}
                style={active ? { borderColor: r.lineColor, background: r.lineColor + '18' } : {}}
                onClick={() => setSelectedIdx(i)}
              >
                <span
                  className="route-option-line-dot"
                  style={{ background: r.lineColor }}
                />
                <span className="route-option-num">{r.lineName || `Route ${i + 1}`}</span>
                <span className="route-option-stops">{r.stopIds.length - 1} stop{r.stopIds.length - 1 !== 1 ? 's' : ''}</span>
                {fare != null && <span className="route-option-fare">₱{Math.round(fare)}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Steps for selected route */}
      <div className="dir-steps">
        {routes === null && (
          <p className="dir-no-route">
            No route found. Make sure a route line passes through both stops.
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
