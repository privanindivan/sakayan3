import { TYPE_COLORS } from '../data/sampleData'

function dist(a, b) {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng)
}

function findNearest(point, markers) {
  if (!markers.length) return null
  return markers.reduce((best, m) => dist(m, point) < dist(best, point) ? m : best)
}

function bfs(startId, endId, connections) {
  if (startId === endId) return [startId]
  const queue   = [[startId]]
  const visited = new Set([startId])
  while (queue.length) {
    const path    = queue.shift()
    const current = path[path.length - 1]
    const neighbors = connections
      .filter(c => c.fromId === current || c.toId === current)
      .map(c => c.fromId === current ? c.toId : c.fromId)
    for (const n of neighbors) {
      if (visited.has(n)) continue
      const next = [...path, n]
      if (n === endId) return next
      visited.add(n)
      queue.push(next)
    }
  }
  return null
}

// Short vehicle label for display
function vehicleLabel(type) {
  if (type === 'Jeepney')    return 'Jeep'
  if (type === 'UV Express') return 'UV'
  return type
}

function vehicleEmoji(type) {
  if (type === 'Train')    return '🚆'
  if (type === 'Bus')      return '🚌'
  if (type === 'Tricycle') return '🛺'
  return '🚐'
}

export default function DirectionPanel({ fromPoint, toPoint, markers, connections, onClose, onMarkerSelect }) {
  const nearFrom = findNearest(fromPoint, markers)
  const nearTo   = findNearest(toPoint,   markers)

  const path = nearFrom && nearTo
    ? bfs(nearFrom.id, nearTo.id, connections)
    : null

  const steps = []
  if (path?.length) {
    const stops = path.map(id => markers.find(m => m.id === id))
    steps.push({ kind: 'walk', label: `Walk → ${stops[0].name}` })
    for (let i = 0; i < stops.length - 1; i++) {
      steps.push({ kind: 'ride', from: stops[i], to: stops[i + 1] })
    }
    steps.push({ kind: 'walk', label: `Walk → ${toPoint.name || 'destination'}` })
  }

  return (
    // No overlay div — panel sits at bottom, map stays interactive above it
    <div className="dir-panel">
      <div className="dir-drag-handle" />

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

      <div className="dir-steps">
        {path === null && (
          <p className="dir-no-route">No route found via connected stops — line shown on map.</p>
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
