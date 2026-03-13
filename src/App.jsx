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

export default function App() {
  const [markers,        setMarkers]        = useState(() => load('sakayan_markers',     INITIAL_MARKERS))
  const [connections,    setConnections]    = useState(() => load('sakayan_connections', []))
  const [selectedMarker, setSelectedMarker] = useState(null)
  const [pendingLatLng,  setPendingLatLng]  = useState(null)
  const [showForm,       setShowForm]       = useState(false)
  const [fromPoint,      setFromPoint]      = useState(null)
  const [toPoint,        setToPoint]        = useState(null)
  const [userLocation,   setUserLocation]   = useState(null)
  const [locating,       setLocating]       = useState(false)
  const [connectingFrom, setConnectingFrom] = useState(null)
  const [flyTarget,      setFlyTarget]      = useState(null)
  const [searchResetKey, setSearchResetKey] = useState(0)

  const { isAdmin, requireAdmin, showPinModal, onPinSuccess, onPinCancel } = useAdminAuth()

  useEffect(() => { save('sakayan_markers',     markers)     }, [markers])
  useEffect(() => { save('sakayan_connections', connections) }, [connections])

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

  const handleConnect = useCallback((fromId, toId) => {
    if (fromId === toId) return
    setConnections(prev => [
      ...prev,
      { id: `${fromId}-${toId}-${Date.now()}`, fromId, toId },
    ])
  }, [])

  const handleRemoveConnection = useCallback((connId) => {
    setConnections(prev => prev.filter(c => c.id !== connId))
  }, [])

  const handleDeleteMarker = useCallback((markerId) => {
    setMarkers(prev => prev.filter(m => m.id !== markerId))
    setConnections(prev => prev.filter(c => c.fromId !== markerId && c.toId !== markerId))
    setSelectedMarker(null)
  }, [])

  const handleStartConnect = useCallback((markerId) => {
    setConnectingFrom(markerId)
    setSelectedMarker(null)
  }, [])

  const handleCancelConnect = useCallback(() => setConnectingFrom(null), [])

  const handleMarkerClick = useCallback((marker) => {
    if (showForm) return
    if (connectingFrom !== null) {
      if (connectingFrom !== marker.id) handleConnect(connectingFrom, marker.id)
      setConnectingFrom(null)
      return
    }
    setSelectedMarker(marker)
  }, [showForm, connectingFrom, handleConnect])

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
        connections={connections}
        connectingFrom={connectingFrom}
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
              setConnectingFrom(null)
            })
          }}
          aria-label={showForm ? 'Cancel' : 'Add stop'}
        >
          {showForm ? '✕' : '+'}
        </button>
      </div>

      {/* Connect-mode banner */}
      {connectingFrom && (
        <div className="line-build-banner">
          <span className="line-build-count">
            Tap another stop to connect
          </span>
          <button className="line-build-cancel" onClick={handleCancelConnect}>✕ Cancel</button>
        </div>
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
          connections={connections}
          onClose={() => { setFromPoint(null); setToPoint(null); setSearchResetKey(k => k + 1) }}
          onMarkerSelect={(m) => setSelectedMarker(m)}
        />
      )}

      {selectedMarker && (
        <MarkerModal
          marker={selectedMarker}
          connections={connections}
          markers={markers}
          isAdmin={isAdmin}
          requireAdmin={requireAdmin}
          onClose={() => setSelectedMarker(null)}
          onSave={(updated) => {
            setMarkers(prev => prev.map(m => m.id === updated.id ? updated : m))
            setSelectedMarker(updated)
          }}
          onDelete={handleDeleteMarker}
          onRemoveConnection={handleRemoveConnection}
          onStartConnect={handleStartConnect}
        />
      )}

      {showPinModal && (
        <PinModal onSuccess={onPinSuccess} onCancel={onPinCancel} />
      )}
    </div>
  )
}
