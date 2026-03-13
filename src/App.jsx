import { useState, useCallback, useEffect } from 'react'
import MapView                from './components/MapView'
import SearchBar              from './components/SearchBar'
import AddMarkerForm          from './components/AddMarkerForm'
import MarkerModal            from './components/MarkerModal'
import DirectionPanel         from './components/DirectionPanel'
import RouteAlternativesSheet from './components/RouteAlternativesSheet'
import { INITIAL_MARKERS, TYPE_COLORS } from './data/sampleData'

function WaypointNameForm({ onSave, onRetap, onCancel }) {
  const [name, setName] = useState('')
  return (
    <div className="waypoint-name-form">
      <p className="waypoint-form-hint">Name this intermediate stop</p>
      <input
        className="edit-field"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="e.g. Crossing, Poblacion, Market…"
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter' && name.trim()) onSave(name)
          if (e.key === 'Escape') onRetap()
        }}
      />
      <div className="waypoint-form-actions">
        <button className="btn-save" onClick={() => onSave(name)} disabled={!name.trim()}>Save stop</button>
        <button className="btn-cancel-edit" onClick={onRetap}>Re-tap</button>
        <button className="btn-cancel-edit" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota exceeded */ }
}

const ALT_COLORS = ['#4A90D9', '#FF6B35', '#27AE60', '#F39C12', '#8E44AD']

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
  // { fromId, toId, alternatives: [{id, positions, color}], loading }
  const [pendingConnect, setPendingConnect] = useState(null)
  const [flyTarget,      setFlyTarget]      = useState(null)
  const [fitBoundsPoints,setFitBoundsPoints] = useState(null)
  const [searchResetKey, setSearchResetKey] = useState(0)
  const [activeStopIds,  setActiveStopIds]  = useState([])
  const [activeConnIds,  setActiveConnIds]  = useState([])
  const [focusedSegment, setFocusedSegment] = useState(null)
  const [addingWaypoint, setAddingWaypoint] = useState(null)  // { connId } | null
  const [pendingWpLatLng, setPendingWpLatLng] = useState(null)

  const isAdmin = true
  const requireAdmin = (cb) => cb()

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
    if (showForm) { setPendingLatLng(latlng); return }
    if (addingWaypoint && !pendingWpLatLng) { setPendingWpLatLng(latlng) }
  }, [showForm, addingWaypoint, pendingWpLatLng])

  const handleStartConnect = useCallback((markerId) => {
    setConnectingFrom(markerId)
    setSelectedMarker(null)
  }, [])

  const handleCancelConnect = useCallback(() => setConnectingFrom(null), [])

  const handleStartAddWaypoint = useCallback((connId) => {
    setAddingWaypoint({ connId })
    setSelectedMarker(null)
    setPendingWpLatLng(null)
  }, [])

  const handleSaveWaypoint = useCallback((name) => {
    if (!addingWaypoint || !pendingWpLatLng || !name.trim()) return
    setConnections(prev => prev.map(c =>
      c.id === addingWaypoint.connId
        ? { ...c, waypoints: [...(c.waypoints || []), { id: String(Date.now()), lat: pendingWpLatLng.lat, lng: pendingWpLatLng.lng, name: name.trim() }] }
        : c
    ))
    setAddingWaypoint(null)
    setPendingWpLatLng(null)
  }, [addingWaypoint, pendingWpLatLng])

  const handleCancelWaypoint = useCallback(() => {
    setAddingWaypoint(null)
    setPendingWpLatLng(null)
  }, [])

  const handleRemoveWaypoint = useCallback((connId, wpId) => {
    setConnections(prev => prev.map(c =>
      c.id === connId
        ? { ...c, waypoints: (c.waypoints || []).filter(w => w.id !== wpId) }
        : c
    ))
  }, [])

  const handleMarkerClick = useCallback((marker) => {
    if (showForm) return
    if (connectingFrom !== null) {
      if (connectingFrom !== marker.id) {
        const fromM = markers.find(m => m.id === connectingFrom)
        if (!fromM) { setConnectingFrom(null); return }

        const snap = { fromId: connectingFrom, toId: marker.id, alternatives: [], loading: true }
        setPendingConnect(snap)
        setConnectingFrom(null)

        // Fetch OSRM alternatives between the two stops
        const coords = `${fromM.lng},${fromM.lat};${marker.lng},${marker.lat}`
        fetch(
          `https://router.project-osrm.org/route/v1/driving/${coords}` +
          `?overview=full&geometries=geojson&alternatives=3`
        )
          .then(r => r.json())
          .then(data => {
            const routes = data.routes || []
            const alternatives = routes.length > 0
              ? routes.map((route, i) => ({
                  id: i,
                  positions: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
                  color: ALT_COLORS[i % ALT_COLORS.length],
                  distance: route.distance,
                }))
              : [{ // fallback: straight line if OSRM returns nothing
                  id: 0,
                  positions: [[fromM.lat, fromM.lng], [marker.lat, marker.lng]],
                  color: ALT_COLORS[0],
                  distance: null,
                }]
            setPendingConnect(prev =>
              prev && prev.fromId === snap.fromId && prev.toId === snap.toId
                ? { ...prev, alternatives, loading: false }
                : prev
            )
          })
          .catch(() => {
            // Fallback straight line on network error
            setPendingConnect(prev =>
              prev && prev.fromId === snap.fromId && prev.toId === snap.toId
                ? { ...prev, alternatives: [{
                    id: 0,
                    positions: [[fromM.lat, fromM.lng], [marker.lat, marker.lng]],
                    color: ALT_COLORS[0],
                  }], loading: false }
                : prev
            )
          })
      } else {
        setConnectingFrom(null)
      }
      return
    }
    setSelectedMarker(marker)
    // Fit map to show the marker + all its connected stops
    const connectedIds = connections
      .filter(c => c.fromId === marker.id || c.toId === marker.id)
      .map(c => c.fromId === marker.id ? c.toId : c.fromId)
    const allPts = [marker, ...connectedIds.map(id => markers.find(m => m.id === id)).filter(Boolean)]
    if (allPts.length > 1) setFitBoundsPoints(allPts.map(p => [p.lat, p.lng]))
    else setFitBoundsPoints(null)
  }, [showForm, connectingFrom, markers, connections])

  // ✓ Keep this alternative → save as a connection
  const handleConfirmAlt = useCallback((altId, fare) => {
    if (!pendingConnect) return
    const alt = pendingConnect.alternatives.find(a => a.id === altId)
    if (!alt) return
    setConnections(prev => [
      ...prev,
      {
        id:       `${pendingConnect.fromId}-${pendingConnect.toId}-${Date.now()}`,
        fromId:   pendingConnect.fromId,
        toId:     pendingConnect.toId,
        geometry: alt.positions,
        color:    TYPE_COLORS[markers.find(m => m.id === pendingConnect.fromId)?.type] || '#4A90D9',
        fare:     fare ?? null,
      },
    ])
    // Remove confirmed alt; close sheet if none left
    setPendingConnect(prev => {
      if (!prev) return null
      const remaining = prev.alternatives.filter(a => a.id !== altId)
      return remaining.length === 0 ? null : { ...prev, alternatives: remaining }
    })
    setFocusedSegment(null)
  }, [pendingConnect])

  // ✗ Discard this alternative
  const handleRejectAlt = useCallback((altId) => {
    setPendingConnect(prev => {
      if (!prev) return null
      const remaining = prev.alternatives.filter(a => a.id !== altId)
      return remaining.length === 0 ? null : { ...prev, alternatives: remaining }
    })
  }, [])

  const handleCancelPendingConnect = useCallback(() => {
    setPendingConnect(null)
    setFocusedSegment(null)
  }, [])

  const handleRemoveConnection = useCallback((connId) => {
    setConnections(prev => prev.filter(c => c.id !== connId))
  }, [])

  const handleDeleteMarker = useCallback((markerId) => {
    setMarkers(prev => prev.filter(m => m.id !== markerId))
    setConnections(prev => prev.filter(c => c.fromId !== markerId && c.toId !== markerId))
    setSelectedMarker(null)
  }, [])

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
        pendingAlternatives={pendingConnect?.alternatives ?? []}
        connectingFrom={connectingFrom}
        onMarkerClick={handleMarkerClick}
        onMapClick={handleMapClick}
        fromPoint={fromPoint}
        toPoint={toPoint}
        userLocation={userLocation}
        flyTarget={flyTarget}
        addingMode={showForm}
        pendingLatLng={pendingLatLng}
        activeStopIds={activeStopIds}
        activeConnIds={activeConnIds}
        focusedSegment={focusedSegment}
        fitBoundsPoints={fitBoundsPoints}
        addingWaypointMode={!!addingWaypoint}
        pendingWpLatLng={pendingWpLatLng}
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
            else { setShowForm(true); setPendingLatLng(null); setConnectingFrom(null) }
          }}
          aria-label={showForm ? 'Cancel' : 'Add stop'}
        >
          {showForm ? '✕' : '+'}
        </button>
      </div>

      {/* Connect-mode banner */}
      {connectingFrom && !pendingConnect && (
        <div className="line-build-banner">
          <span className="line-build-count">Tap another stop to connect</span>
          <button className="line-build-cancel" onClick={handleCancelConnect}>✕ Cancel</button>
        </div>
      )}

      {/* Add-waypoint banner */}
      {addingWaypoint && !pendingWpLatLng && (
        <div className="line-build-banner">
          <span className="line-build-count">Tap map to place an intermediate stop</span>
          <button className="line-build-cancel" onClick={handleCancelWaypoint}>✕ Cancel</button>
        </div>
      )}

      {/* Waypoint name form */}
      {addingWaypoint && pendingWpLatLng && (
        <WaypointNameForm
          onSave={handleSaveWaypoint}
          onRetap={() => setPendingWpLatLng(null)}
          onCancel={handleCancelWaypoint}
        />
      )}

      {showForm && (
        <AddMarkerForm
          pendingLatLng={pendingLatLng}
          onSubmit={handleAddMarker}
          onCancel={handleCancelForm}
        />
      )}

      {/* Route alternatives confirmation sheet */}
      {pendingConnect && (
        <RouteAlternativesSheet
          fromStop={markers.find(m => m.id === pendingConnect.fromId)}
          toStop={markers.find(m => m.id === pendingConnect.toId)}
          alternatives={pendingConnect.alternatives}
          loading={pendingConnect.loading}
          onConfirm={handleConfirmAlt}
          onReject={handleRejectAlt}
          onCancel={handleCancelPendingConnect}
        />
      )}

      {fromPoint && toPoint && (
        <DirectionPanel
          fromPoint={fromPoint}
          toPoint={toPoint}
          markers={markers}
          connections={connections}
          onClose={() => {
            setFromPoint(null); setToPoint(null)
            setSearchResetKey(k => k + 1)
            setActiveStopIds([]); setActiveConnIds([])
            setFocusedSegment(null)
          }}
          onActiveRoute={(stopIds, connIds) => {
            setActiveStopIds(stopIds)
            setActiveConnIds(connIds)
            setFocusedSegment(null)
          }}
          onSegmentFocus={(fromId, toId) => setFocusedSegment({ fromId, toId })}
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
          onAddWaypoint={handleStartAddWaypoint}
          onRemoveWaypoint={handleRemoveWaypoint}
          onConnClick={(fromId, toId) => {
            setSelectedMarker(null)
            setFocusedSegment({ fromId, toId })
          }}
        />
      )}

    </div>
  )
}
