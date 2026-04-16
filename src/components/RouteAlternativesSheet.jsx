import { useState, useEffect } from 'react'

export default function RouteAlternativesSheet({
  fromStop, toStop,
  alternatives, loading,
  onConfirm, onReject, onCancel,
  onFocusAlt,   // (altId | null) → tells map which route to highlight
}) {
  const [focused, setFocused] = useState(null)

  // Auto-focus first option once loaded
  useEffect(() => {
    if (!loading && alternatives.length > 0) {
      setFocused(alternatives[0].id)
      onFocusAlt?.(alternatives[0].id)
    }
  }, [loading, alternatives.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const focus = (id) => {
    setFocused(id)
    onFocusAlt?.(id)
  }

  return (
    <div className="route-alts-sheet">
      <div className="route-alts-header">
        <div className="route-alts-title-wrap">
          <span className="route-alts-title">Choose the correct route</span>
          <span className="route-alts-stops">{fromStop?.name ?? '…'} → {toStop?.name ?? '…'}</span>
        </div>
        <button className="route-alts-close" onClick={onCancel} aria-label="Cancel">✕</button>
      </div>

      <div className="route-alts-list">
        {loading && <div className="route-alts-loading">Finding routes…</div>}
        {!loading && alternatives.length === 0 && <div className="route-alts-empty">No routes found.</div>}
        {!loading && alternatives.map((alt, i) => {
          const dist = alt.distance >= 1000
            ? `${(alt.distance / 1000).toFixed(1)} km`
            : alt.distance != null ? `${Math.round(alt.distance)} m` : null
          const isShortest = alternatives.length > 1 && i === 0
          const isFocused  = focused === alt.id
          return (
            <div
              key={alt.id}
              className={`route-alt-row${isFocused ? ' route-alt-row--active' : ''}`}
              onClick={() => focus(alt.id)}
            >
              <span
                className="route-alt-dot"
                style={{
                  background: alt.color,
                  transform: isFocused ? 'scale(1.35)' : 'scale(1)',
                  transition: 'transform 0.15s',
                  boxShadow: isFocused ? `0 0 0 3px ${alt.color}44` : 'none',
                }}
              />
              <span className="route-alt-row-label">
                Option {i + 1}
                {isShortest && <span className="route-alt-tag">Shortest</span>}
              </span>
              {dist && <span className="route-alt-row-dist">{dist}</span>}
              <div className="route-alt-row-actions">
                <button
                  className="route-alt-confirm"
                  onClick={(e) => { e.stopPropagation(); onConfirm(alt.id, null) }}
                  title="Use this route"
                >✓</button>
                <button
                  className="route-alt-reject"
                  onClick={(e) => { e.stopPropagation(); onReject(alt.id) }}
                  title="Not this one"
                >✗</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
