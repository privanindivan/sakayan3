export default function RouteAlternativesSheet({
  fromStop, toStop,
  alternatives, loading,
  onConfirm, onReject, onCancel,
}) {
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

      {!loading && alternatives.map(alt => (
        <div key={alt.id} className="route-alt-item">
          <span className="route-alt-dot" style={{ background: alt.color }} />
          <span className="route-alt-label">Option {alt.id + 1}</span>
          <div className="route-alt-actions">
            <button
              className="route-alt-confirm"
              onClick={() => onConfirm(alt.id)}
              aria-label="Keep this route"
              title="Keep this route"
            >
              ✓
            </button>
            <button
              className="route-alt-reject"
              onClick={() => onReject(alt.id)}
              aria-label="Remove this route"
              title="Remove this route"
            >
              ✗
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
