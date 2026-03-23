import { useState } from 'react'

function fmtDist(meters) {
  if (meters == null) return null
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`
}

export default function RouteAlternativesSheet({
  fromStop, toStop,
  alternatives, loading,
  onConfirm, onReject, onCancel,
}) {
  const [fares, setFares] = useState({})

  const setFare = (id, val) => setFares(prev => ({ ...prev, [id]: val }))

  return (
    <div className="route-alts-sheet">
      <div className="route-alts-header">
        <div className="route-alts-title-wrap">
          <span className="route-alts-title">Choose the correct route</span>
          <span className="route-alts-stops">
            {fromStop?.name ?? '…'} → {toStop?.name ?? '…'}
          </span>
        </div>
        <button className="route-alts-close" onClick={onCancel} aria-label="Cancel">✕</button>
      </div>

      {loading && (
        <div className="route-alts-loading">Finding route options…</div>
      )}

      {!loading && alternatives.length === 0 && (
        <div className="route-alts-empty">No routes found between these stops.</div>
      )}

      {!loading && alternatives.map((alt, i) => {
        const dist    = fmtDist(alt.distance)
        const isShortest = alternatives.length > 1 && i === 0
        const fareVal = fares[alt.id] ?? ''
        return (
          <div key={alt.id} className="route-alt-item">
            <div className="route-alt-info">
              <span className="route-alt-dot" style={{ background: alt.color }} />
              <div className="route-alt-meta">
                <span className="route-alt-label">
                  Option {alt.id + 1}
                  {isShortest && <span className="route-alt-tag">Shorter</span>}
                </span>
                {dist && <span className="route-alt-dist">{dist}</span>}
              </div>
            </div>
            <div className="route-alt-fare-row">
              <span className="fare-prefix">₱</span>
              <input
                className="route-alt-fare-input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                placeholder="Fare (optional)"
                value={fareVal}
                onChange={e => setFare(alt.id, e.target.value)}
              />
            </div>
            <div className="route-alt-actions">
              <button
                className="route-alt-confirm"
                onClick={() => onConfirm(alt.id, fareVal !== '' ? Number(fareVal) : null)}
                aria-label="Keep this route"
                title="Keep this route"
              >✓</button>
              <button
                className="route-alt-reject"
                onClick={() => onReject(alt.id)}
                aria-label="Remove this route"
                title="Remove this route"
              >✗</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
