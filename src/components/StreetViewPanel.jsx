import { useState, useEffect } from 'react'

export default function StreetViewPanel({ image, onClose }) {
  const [expanded, setExpanded] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [thumbUrl, setThumbUrl] = useState(null)

  useEffect(() => {
    if (!image?.id) return
    setExpanded(false)
    setLoaded(false)
    setThumbUrl(image.thumbnailUrl || null)
    if (image.thumbnailUrl) return
    let cancelled = false
    fetch(`/api/mapillary/thumb?id=${image.id}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.url) setThumbUrl(d.url) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [image?.id])

  if (!image) return null

  const gmapsUrl = `https://maps.google.com/?layer=c&cbll=${image.lat},${image.lng}`

  return (
    <>
      {/* Bottom-left thumbnail card — image only, no label text */}
      {!expanded && (
        <div className="sv-panel" onClick={() => { setLoaded(false); setExpanded(true) }}>
          {thumbUrl
            ? <img src={thumbUrl} alt="Street view" className="sv-thumb" />
            : <div className="sv-thumb" style={{ display:'flex', alignItems:'center', justifyContent:'center', background:'#1f2937', color:'#9ca3af', fontSize:12 }}>Loading…</div>
          }
          <button
            className="sv-panel-close"
            onClick={(e) => { e.stopPropagation(); onClose() }}
            aria-label="Close"
          >✕</button>
        </div>
      )}

      {/* Full-screen Mapillary viewer */}
      {expanded && (
        <div className="sv-fullscreen">
          <div className="sv-fullscreen-bar">
            <a
              href={gmapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sv-gmaps-btn"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" style={{ flexShrink: 0 }}>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#EA4335"/>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 1.87.63 3.59 1.67 4.98L12 2z" fill="#C5221F"/>
                <circle cx="12" cy="9" r="2.5" fill="white"/>
              </svg>
              Open in Google Maps Street View
            </a>
            <button
              className="sv-fullscreen-close"
              onClick={() => setExpanded(false)}
              aria-label="Close"
            >✕</button>
          </div>

          {/* Loading overlay — same feel as initial site load */}
          {!loaded && (
            <div className="sv-loading">
              <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
              <div className="sv-loading-text">Loading Street View…</div>
            </div>
          )}

          <iframe
            title="Mapillary Street View"
            src={`https://www.mapillary.com/embed?image_key=${image.id}&style=photo`}
            className="sv-iframe"
            style={{ opacity: loaded ? 1 : 0 }}
            allow="xr-spatial-tracking; fullscreen"
            allowFullScreen
            onLoad={() => setLoaded(true)}
          />
        </div>
      )}
    </>
  )
}
