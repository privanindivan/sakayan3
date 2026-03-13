import { useState, useCallback, useEffect } from 'react'
import MapView         from './components/MapView'
import SearchBar       from './components/SearchBar'
import AddMarkerForm   from './components/AddMarkerForm'
import MarkerModal     from './components/MarkerModal'
import DirectionPanel  from './components/DirectionPanel'
import PinModal        from './components/PinModal'
import { useAdminAuth } from './hooks/useAdminAuth'
import { INITIAL_MARKERS } from './data/sampleData'

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota exceeded */ }
}

const LINE_PALETTE = ['#FF6B35', '#4A90D9', '#27AE60', '#F39C12', '#8E44AD', '#E74C3C', '#1ABC9C', '#16A085']

export default function App() {
  const [markers,        setMarkers]        = useState(() => load('sakayan_markers', INITIAL_MARKERS))
  const [lines,          setLines]          = useState(() => load('sakayan_lines',   []))
  const [selectedMarker, setSelectedMarker] = useState(null)
  const [pendingLatLng,  setPendingLatLng]  = useState(null)
  const [showForm,       setShowForm]       = useState(false)
  const [fromPoint,      setFromPoint]      = useState(null)
  const [toPoint,        setToPoint]        = useState(null)
  const [userLocation,   setUserLocation]   = useState(null)
  const [locating,       setLocating]       = useState(false)
  const [buildingLine,   setBuildingLine]   = useState(null)  // { name, color, stopIds } | null
  const [flyTarget,      setFlyTarget]      = useState(null)
  const [searchResetKey, setSearchResetKey] = useState(0)

  const { isAdmin, requireAdmin, showPinModal, onPinSuccess, onPinCancel } = useAdminAuth()

  useEffect(() => { save('sakayan_markers', markers) }, [markers])
  useEffect(() => { save('sakayan_lines',   lines)   }, [lines])

  useEffect(() => {
    if (!flyTarget) return
    const t = setTimeout(() => setFlyTarget(null), 1500)
    return () => clearTimeout(t)
  }, [flyTarget])

  const handleRoute = useCallback((from, to) => {
    setFromPoint(from)
    setToPoint(to)
  }, [])

  const handleMapClick = useCallback((latlng) => {
    if (showForm) setPendingLatLng(latlng)
  }, [showForm])

  const handleDeleteMarker = useCallback((markerId) => {
    setMarkers(prev => prev.filter(m => m.id !== markerId))
    // Remove stop from all lines; drop lines that fall below 2 stops
    setLines(prev =>
      prev
        .map(l => ({ ...l, stopIds: l.stopIds.filter(id => id !== markerId) }))
        .filter(l => l.stopIds.length >= 2)
    )
    setSelectedMarker(null)
  }, [])

  // ── Line building ──────────────────────────────────────────────────
  const handleStartNewLine = useCallback((linesCount) => {
    const color = LINE_PALETTE[linesCount % LINE_PALETTE.length]
    setBuildingLine({ name: `Line ${linesCount + 1}`, color, stopIds: [] })
    setSelectedMarker(null)
  }, [])

  const handleAddStopToLine = useCallback((markerId) => {
    setBuildingLine(prev => {
      if (!prev) return prev
      if (prev.stopIds.includes(markerId)) return prev   // no duplicates
      return { ...prev, stopIds: [...prev.stopIds, markerId] }
    })
  }, [])

  const handleUndoLastStop = useCallback(() => {
    setBuildingLine(prev => {
      if (!prev || prev.stopIds.length === 0) return prev
      return { ...prev, stopIds: prev.stopIds.slice(0, -1) }
    })
  }, [])

  const handleFinishLine = useCallback(() => {
    if (!buildingLine || buildingLine.stopIds.length < 2) {
      setBuildingLine(null)
      return
    }
    setLines(prev => [...prev, {
      id:      Date.now(),
      name:    buildingLine.name.trim() || `Line ${prev.length + 1}`,
      color:   buildingLine.color,
      stopIds: buildingLine.stopIds,
    }])
    setBuildingLine(null)
  }, [buildingLine])

  const handleCancelLine = useCallback(() => setBuildingLine(null), [])

  const handleDeleteLine = useCallback((lineId) => {
    setLines(prev => prev.filter(l => l.id !== lineId))
  }, [])
  // ───────────────────────────────────────────────────────────────────

  const handleMarkerClick = useCallback((marker) => {
    if (showForm) return
    if (buildingLine !== null) {
      handleAddStopToLine(marker.id)
      return
    }
    setSelectedMarker(marker)
  }, [showForm, buildingLine, handleAddStopToLine])

  const handleAddMarker = (data) => {
    setMarkers(prev => [...prev, { id: Date.now(), ...data }])
    setShowForm(false)
    setPendingLatLng(null)
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setPendingLatLng(null)
  }

  const handleLocate = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  return (
    <div className="app">
      <SearchBar onRoute={handleRoute} onFlyTo={(t) => setFlyTarget(t)} markers={markers} resetKey={searchResetKey} />

      <MapView
        markers={markers}
        lines={lines}
        buildingLine={buildingLine}
        onMarkerClick={handleMarkerClick}
        onMapClick={handleMapClick}
        fromPoint={fromPoint}
        toPoint={toPoint}
        userLocation={userLocation}
        flyTarget={flyTarget}
        addingMode={showForm}
        pendingLatLng={pendingLatLng}
      />

      {/* Corner buttons */}
      <div className="corner-btns">
        <button
          className="icon-btn locate-btn"
          onClick={handleLocate}
          aria-label="My location"
          title="My location"
        >
          {locating ? '…' : '◎'}
        </button>
        <button
          className={`icon-btn fab-btn ${showForm ? 'fab-cancel' : ''}`}
          onClick={() => {
            if (showForm) handleCancelForm()
            else requireAdmin(() => {
              setShowForm(true)
              setPendingLatLng(null)
              setBuildingLine(null)
            })
          }}
          aria-label={showForm ? 'Cancel' : 'Add stop'}
        >
          {showForm ? '✕' : '+'}
        </button>
      </div>

      {/* Line-building banner */}
      {buildingLine && (
        <div className="line-build-banner">
          <div
            className="line-build-swatch"
            style={{ background: buildingLine.color }}
          />
          <input
            className="line-build-name"
            value={buildingLine.name}
            onChange={e => setBuildingLine(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Line name…"
          />
          <span className="line-build-count">
            {buildingLine.stopIds.length} stop{buildingLine.stopIds.length !== 1 ? 's' : ''}
          </span>
          {buildingLine.stopIds.length > 0 && (
            <button className="line-build-undo" onClick={handleUndoLastStop} title="Undo last stop">↩</button>
          )}
          <button
            className="line-build-done"
            onClick={handleFinishLine}
            disabled={buildingLine.stopIds.length < 2}
          >
            ✓ Done
          </button>
          <button className="line-build-cancel" onClick={handleCancelLine}>✕</button>
        </div>
      )}

      {/* New Route Line button — admin only, not while building */}
      {isAdmin && !buildingLine && !showForm && (
        <button
          className="new-line-fab"
          onClick={() => handleStartNewLine(lines.length)}
          title="New route line"
        >
          🛤 New Line
        </button>
      )}

      {showForm && (
        <AddMarkerForm
          pendingLatLng={pendingLatLng}
          onSubmit={handleAddMarker}
          onCancel={handleCancelForm}
        />
      )}

      {fromPoint && toPoint && (
        <DirectionPanel
          fromPoint={fromPoint}
          toPoint={toPoint}
          markers={markers}
          lines={lines}
          onClose={() => { setFromPoint(null); setToPoint(null); setSearchResetKey(k => k + 1) }}
          onMarkerSelect={(m) => setSelectedMarker(m)}
        />
      )}

      {selectedMarker && (
        <MarkerModal
          marker={selectedMarker}
          lines={lines}
          isAdmin={isAdmin}
          requireAdmin={requireAdmin}
          onClose={() => setSelectedMarker(null)}
          onSave={(updated) => {
            setMarkers(prev => prev.map(m => m.id === updated.id ? updated : m))
            setSelectedMarker(updated)
          }}
          onDelete={handleDeleteMarker}
          onDeleteLine={handleDeleteLine}
        />
      )}

      {showPinModal && (
        <PinModal onSuccess={onPinSuccess} onCancel={onPinCancel} />
      )}
    </div>
  )
}
