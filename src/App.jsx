import { useState, useCallback, useEffect, useRef } from 'react'
import MapView                from './components/MapView'
import StreetViewPanel        from './components/StreetViewPanel'
import SearchBar              from './components/SearchBar'
import AddMarkerForm          from './components/AddMarkerForm'
import MarkerModal            from './components/MarkerModal'
import UserProfile            from './components/UserProfile'
import DirectionPanel         from './components/DirectionPanel'
import RouteAlternativesSheet from './components/RouteAlternativesSheet'
import AuthModal              from './components/AuthModal'
import { DURATION_FACTORS, TYPE_COLORS } from './data/sampleData'

// Attach stored token to every API request (for Google OAuth users on different port)
function apiFetch(url, options = {}) {
  const token = localStorage.getItem('sakayan_token')
  const headers = { ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

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

const BADGE_EMOJI = {
  newcomer: '🌱',
  explorer: '🧭',
  guide: '🗺️',
  navigator: '⭐',
  pioneer: '🏆',
}

const ALT_COLORS = ['#4A90D9', '#FF6B35', '#27AE60', '#F39C12', '#8E44AD']

export default function App() {
  const [markers,        setMarkers]        = useState([])
  const [connections,    setConnections]    = useState([])
  const [loading,        setLoading]        = useState(true)
  const [user,           setUser]           = useState(null)
  const [authChecked,    setAuthChecked]    = useState(false)
  const [showAuth,       setShowAuth]       = useState(false)

  const [selectedMarker, setSelectedMarker] = useState(null)
  const [pendingLatLng,  setPendingLatLng]  = useState(null)
  const [showForm,       setShowForm]       = useState(false)   // add mode active
  const [showAddForm,    setShowAddForm]    = useState(false)   // full detail form visible
  const [fromPoint,      setFromPoint]      = useState(null)
  const [toPoint,        setToPoint]        = useState(null)
  const [userLocation,   setUserLocation]   = useState(null)
  const [locating,       setLocating]       = useState(false)
  const [connectingFrom, setConnectingFrom] = useState(null)
  const [pendingConnect, setPendingConnect] = useState(null)
  const [flyTarget,      setFlyTarget]      = useState(null)
  const [fitBoundsPoints,setFitBoundsPoints] = useState(null)
  const [searchResetKey, setSearchResetKey] = useState(0)
  const [profileUserId,  setProfileUserId]  = useState(null)
  const [streetViewImg,  setStreetViewImg]  = useState(null)
  const [activeStopIds,  setActiveStopIds]  = useState([])
  const [activeConnIds,  setActiveConnIds]  = useState([])
  const [focusedSegment, setFocusedSegment] = useState(null)
  const [routePrefill,   setRoutePrefill]   = useState(null)
  const [addingWaypoint, setAddingWaypoint] = useState(null)
  const [pendingWpLatLng, setPendingWpLatLng] = useState(null)
  const [showStreetPhotos, setShowStreetPhotos] = useState(false)
  const [savingMarker,   setSavingMarker]   = useState(false)
  const shownAuthPrompt = useRef(false)

  // Handle OAuth redirect (after Google login)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const authToken = params.get('auth_token')
    const authUser  = params.get('auth_user')
    if (authToken && authUser) {
      try {
        localStorage.setItem('sakayan_token', authToken)
        setUser(JSON.parse(decodeURIComponent(authUser)))
      } catch {}
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (params.get('auth_error')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Check auth and load data on mount
  useEffect(() => {
    Promise.all([
      apiFetch('/api/auth/me').then(r => r.json()),
      apiFetch('/api/terminals').then(r => r.json()),
      apiFetch('/api/connections').then(r => r.json()),
    ]).then(([authData, terminalsData, connectionsData]) => {
      if (authData.user) setUser(authData.user)

      // Map terminals to sakayan2 marker format
      setMarkers((terminalsData.terminals || []).map(t => ({
        id: t.id,
        lat: t.lat,
        lng: t.lng,
        name: t.name,
        type: t.type,
        details: t.details || '',
        schedule: t.schedule,
        images: t.images || [],
        likes: t.likes || 0,
        dislikes: t.dislikes || 0,
        outdated_votes: t.outdated_votes || 0,
        created_by: t.created_by,
        creator_name: t.creator_name,
        my_vote: t.my_vote,
      })))

      // Map connections to sakayan2 format
      setConnections((connectionsData.connections || []).map(c => ({
        id: c.id,
        fromId: c.from_id || c.fromId,
        toId: c.to_id || c.toId,
        geometry: c.geometry,
        color: c.color || '#4A90D9',
        fare: c.fare,
        duration: c.duration_secs,
        waypoints: c.waypoints || [],
        budget_level: c.budget_level,
        likes: c.likes || 0,
        created_by: c.created_by,
      })))

      setLoading(false)
      setAuthChecked(true)

      // Auto-open terminal from URL ?t=<id>
      const tid = new URLSearchParams(window.location.search).get('t')
      if (tid) {
        const found = (terminalsData.terminals || []).find(t => String(t.id) === String(tid))
        if (found) setSelectedMarker({
          id: found.id, lat: found.lat, lng: found.lng, name: found.name,
          type: found.type, details: found.details || '', schedule: found.schedule,
          images: found.images || [], likes: found.likes || 0, dislikes: found.dislikes || 0,
          outdated_votes: found.outdated_votes || 0, created_by: found.created_by,
          creator_name: found.creator_name, my_vote: found.my_vote,
        })
      }

      // Show auth prompt once on first visit if not logged in
      if (!authData.user && !localStorage.getItem('sakayan_auth_dismissed')) {
        setTimeout(() => setShowAuth(true), 800)
        shownAuthPrompt.current = true
      }
    }).catch(() => {
      setLoading(false)
      setAuthChecked(true)
    })
  }, [])

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

  const handleSaveWaypoint = useCallback(async (name) => {
    if (!addingWaypoint || !pendingWpLatLng || !name.trim()) return
    const conn = connections.find(c => c.id === addingWaypoint.connId)
    if (!conn) return
    const newWaypoints = [...(conn.waypoints || []), {
      id: String(Date.now()),
      lat: pendingWpLatLng.lat,
      lng: pendingWpLatLng.lng,
      name: name.trim()
    }]
    try {
      const res = await apiFetch(`/api/connections/${addingWaypoint.connId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints: newWaypoints }),
      })
      if (res.ok) {
        setConnections(prev => prev.map(c =>
          c.id === addingWaypoint.connId ? { ...c, waypoints: newWaypoints } : c
        ))
      }
    } catch {}
    setAddingWaypoint(null)
    setPendingWpLatLng(null)
  }, [addingWaypoint, pendingWpLatLng, connections])

  const handleCancelWaypoint = useCallback(() => {
    setAddingWaypoint(null)
    setPendingWpLatLng(null)
  }, [])

  const handleRemoveWaypoint = useCallback(async (connId, wpId) => {
    const conn = connections.find(c => c.id === connId)
    if (!conn) return
    const newWaypoints = (conn.waypoints || []).filter(w => w.id !== wpId)
    try {
      const res = await apiFetch(`/api/connections/${connId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints: newWaypoints }),
      })
      if (res.ok) {
        setConnections(prev => prev.map(c =>
          c.id === connId ? { ...c, waypoints: newWaypoints } : c
        ))
      }
    } catch {}
  }, [connections])

  const handleMarkerClick = useCallback((marker) => {
    if (showForm) return
    if (fromPoint && toPoint) return   // direction panel active — ignore marker taps
    if (connectingFrom !== null) {
      if (connectingFrom !== marker.id) {
        const fromM = markers.find(m => m.id === connectingFrom)
        if (!fromM) { setConnectingFrom(null); return }

        const snap = { fromId: connectingFrom, toId: marker.id, alternatives: [], loading: true }
        setPendingConnect(snap)
        setConnectingFrom(null)

        const coords = `${fromM.lng},${fromM.lat};${marker.lng},${marker.lat}`
        fetch(
          `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=3`
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
                  duration: route.duration,
                }))
              : [{ id: 0, positions: [[fromM.lat, fromM.lng], [marker.lat, marker.lng]], color: ALT_COLORS[0], distance: null }]
            setPendingConnect(prev =>
              prev && prev.fromId === snap.fromId && prev.toId === snap.toId
                ? { ...prev, alternatives, loading: false }
                : prev
            )
          })
          .catch(() => {
            setPendingConnect(prev =>
              prev && prev.fromId === snap.fromId && prev.toId === snap.toId
                ? { ...prev, alternatives: [{ id: 0, positions: [[fromM.lat, fromM.lng], [marker.lat, marker.lng]], color: ALT_COLORS[0] }], loading: false }
                : prev
            )
          })
      } else {
        setConnectingFrom(null)
      }
      return
    }
    setSelectedMarker(marker)
    window.history.pushState({}, '', `?t=${marker.id}`)
    const connectedIds = connections
      .filter(c => c.fromId === marker.id || c.toId === marker.id)
      .map(c => c.fromId === marker.id ? c.toId : c.fromId)
    const allPts = [marker, ...connectedIds.map(id => markers.find(m => m.id === id)).filter(Boolean)]
    if (allPts.length > 1) setFitBoundsPoints(allPts.map(p => [p.lat, p.lng]))
    else setFitBoundsPoints(null)
  }, [showForm, fromPoint, toPoint, connectingFrom, markers, connections])

  const handleConfirmAlt = useCallback(async (altId, fare) => {
    if (!pendingConnect) return
    const alt = pendingConnect.alternatives.find(a => a.id === altId)
    if (!alt) return

    const fromM = markers.find(m => m.id === pendingConnect.fromId)
    const color = TYPE_COLORS[fromM?.type] || '#4A90D9'
    const duration_secs = alt.duration != null
      ? Math.round(alt.duration * (DURATION_FACTORS[fromM?.type] ?? 1.4))
      : null

    try {
      const res = await apiFetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromId: pendingConnect.fromId,
          toId: pendingConnect.toId,
          geometry: alt.positions,
          color,
          fare: fare ?? null,
          duration_secs,
          waypoints: [],
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const conn = data.connection
        setConnections(prev => [...prev, {
          id: conn.id,
          fromId: conn.from_id || conn.fromId,
          toId: conn.to_id || conn.toId,
          geometry: alt.positions,
          color,
          fare: fare ?? null,
          duration: duration_secs,
          waypoints: [],
          likes: 0,
          created_by: user?.id,
        }])
      }
    } catch {}

    setPendingConnect(prev => {
      if (!prev) return null
      const remaining = prev.alternatives.filter(a => a.id !== altId)
      return remaining.length === 0 ? null : { ...prev, alternatives: remaining }
    })
    setFocusedSegment(null)
  }, [pendingConnect, markers, user])

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

  const handleRemoveConnection = useCallback(async (connId) => {
    try {
      const res = await apiFetch(`/api/connections/${connId}`, { method: 'DELETE' })
      if (res.ok) {
        setConnections(prev => prev.filter(c => c.id !== connId))
      }
    } catch {}
  }, [])

  const handleDeleteMarker = useCallback(async (markerId) => {
    try {
      const res = await apiFetch(`/api/terminals/${markerId}`, { method: 'DELETE' })
      if (res.ok) {
        setMarkers(prev => prev.filter(m => m.id !== markerId))
        setConnections(prev => prev.filter(c => c.fromId !== markerId && c.toId !== markerId))
        setSelectedMarker(null)
      }
    } catch {}
  }, [])

  const handleAddMarker = async (data) => {
    if (!user) { setShowAuth(true); return }
    setSavingMarker(true)
    try {
      const res = await apiFetch('/api/terminals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const result = await res.json()
        const t = result.terminal
        setMarkers(prev => [...prev, {
          id: t.id, lat: t.lat, lng: t.lng, name: t.name,
          type: t.type, details: t.details || '', schedule: t.schedule,
          images: t.images || [], likes: 0, dislikes: 0, outdated_votes: 0,
          created_by: t.created_by, creator_name: user.username,
        }])
        setShowForm(false)
        setShowAddForm(false)
        setPendingLatLng(null)
      }
    } catch {} finally { setSavingMarker(false) }
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setShowAddForm(false)
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

  const handleVote = async (entity_type, entity_id, vote_type) => {
    if (!user) { setShowAuth(true); return }
    try {
      const res = await apiFetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type, entity_id, vote_type }),
      })
      if (res.ok) {
        const data = await res.json()
        if (entity_type === 'terminal') {
          setMarkers(prev => prev.map(m => {
            if (m.id !== entity_id) return m
            const col = vote_type === 'like' ? 'likes' : vote_type === 'dislike' ? 'dislikes' : 'outdated_votes'
            const newM = { ...m, my_vote: data.voted ? vote_type : null }
            newM[col] = data.voted ? (m[col] || 0) + 1 : Math.max(0, (m[col] || 0) - 1)
            return newM
          }))
          if (selectedMarker?.id === entity_id) {
            setSelectedMarker(prev => {
              if (!prev) return prev
              const col = vote_type === 'like' ? 'likes' : vote_type === 'dislike' ? 'dislikes' : 'outdated_votes'
              const updated = { ...prev, my_vote: data.voted ? vote_type : null }
              updated[col] = data.voted ? (prev[col] || 0) + 1 : Math.max(0, (prev[col] || 0) - 1)
              return updated
            })
          }
        }
      }
    } catch {}
  }

  const isAdmin = user?.role === 'admin'
  const requireAuth = (cb) => {
    if (!user) { setShowAuth(true); return }
    cb()
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <img src="/logo.png" alt="Sakayan" className="loading-logo" />
        <span className="loading-text loading-dots">Loading</span>
      </div>
    )
  }

  return (
    <div className="app">
      <SearchBar onRoute={handleRoute} onFlyTo={(t) => setFlyTarget(t)} markers={markers} resetKey={searchResetKey} prefill={routePrefill} />

      {/* Top-right: auth */}
      <div className="top-right-bar">
        {user ? (
          <div className="user-chip">
            <span className="user-badge-emoji">{BADGE_EMOJI[user.badge] || '🌱'}</span>
            <button
              className="user-chip-name"
              onClick={() => setProfileUserId(user.id)}
              title="View my profile"
            >{user.username}</button>
            <button className="user-chip-logout" onClick={() => {
              if (!window.confirm('Log out?')) return
              apiFetch('/api/auth/logout', { method: 'POST' })
              localStorage.removeItem('sakayan_token')
              localStorage.removeItem('sakayan_auth_dismissed')
              setUser(null)
              setShowForm(false)
              setShowAddForm(false)
              setPendingLatLng(null)
              setConnectingFrom(null)
              setSelectedMarker(null)
            }}>✕</button>
          </div>
        ) : (
          <button className="login-chip" onClick={() => setShowAuth(true)}>
            🔑 Login
          </button>
        )}
      </div>

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
        onWaypointClick={(fromId, toId) => setFocusedSegment({ fromId, toId })}
        onStreetViewClick={(img) => setStreetViewImg(img)}
        showStreetPhotos={showStreetPhotos}
      />

      {/* Street Photos toggle — bottom left */}
      <button
        className={`icon-btn street-photos-btn ${showStreetPhotos ? 'street-photos-on' : ''}`}
        onClick={() => setShowStreetPhotos(v => !v)}
        aria-label="Toggle Street Photos"
        title="Street Photos"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="9" cy="9" r="7" fill={showStreetPhotos ? '#22C55E' : '#9CA3AF'} stroke="white" strokeWidth="1.5"/>
        </svg>
        <span style={{ fontSize: 11, marginLeft: 4, fontWeight: 600, color: showStreetPhotos ? '#22C55E' : '#9CA3AF' }}>Street Photos</span>
      </button>

      {/* Corner buttons — locate only for anonymous; locate + add for logged-in */}
      <div className="corner-btns">
        <button className="icon-btn locate-btn" onClick={handleLocate} aria-label="My location" title="My location">
          {locating ? '…' : '◎'}
        </button>
        {user && (
          <button
            className={`icon-btn fab-btn ${showAddForm ? 'fab-cancel' : showForm ? 'fab-active' : ''}`}
            onClick={() => {
              if (showForm) handleCancelForm()
              else { setShowForm(true); setPendingLatLng(null); setConnectingFrom(null) }
            }}
            aria-label={showForm ? 'Cancel adding' : 'Add stop'}
          >
            {showAddForm ? '✕' : '+'}
          </button>
        )}
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

      {addingWaypoint && pendingWpLatLng && (
        <WaypointNameForm
          onSave={handleSaveWaypoint}
          onRetap={() => setPendingWpLatLng(null)}
          onCancel={handleCancelWaypoint}
        />
      )}

      {/* Pin placed — confirm card (✓ / ✗) before opening full form */}
      {showForm && pendingLatLng && !showAddForm && (
        <div className="pin-confirm-card">
          <div className="pin-confirm-label">
            📍 Pin placed
            <span>{pendingLatLng.lat.toFixed(5)}, {pendingLatLng.lng.toFixed(5)}</span>
          </div>
          <button
            className="pin-confirm-cancel"
            onClick={() => setPendingLatLng(null)}
            aria-label="Remove pin"
          >✕</button>
          <button
            className="pin-confirm-ok"
            onClick={() => setShowAddForm(true)}
            aria-label="Confirm pin"
          >✓</button>
        </div>
      )}

      {/* Full detail form — only after pin confirmed */}
      {showAddForm && (
        <AddMarkerForm
          pendingLatLng={pendingLatLng}
          onSubmit={handleAddMarker}
          onCancel={handleCancelForm}
          saving={savingMarker}
        />
      )}

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
            setRoutePrefill(null)
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
          user={user}
          isAdmin={isAdmin}
          requireAdmin={(cb) => {
            if (!user) { setShowAuth(true); return }
            cb()
          }}
          onClose={() => { setSelectedMarker(null); window.history.replaceState({}, '', window.location.pathname) }}
          saving={savingMarker}
          onSave={async (updated) => {
            setSavingMarker(true)
            try {
              const res = await apiFetch(`/api/terminals/${updated.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated),
              })
              if (res.ok) {
                setMarkers(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m))
                setSelectedMarker(updated)
              }
            } catch {} finally { setSavingMarker(false) }
          }}
          onDelete={handleDeleteMarker}
          onRemoveConnection={handleRemoveConnection}
          onUpdateConnection={(updated) => setConnections(prev => prev.map(c => c.id === updated.id ? { ...c, fare: updated.fare, duration: updated.duration_secs } : c))}
          onStartConnect={handleStartConnect}
          onAddWaypoint={handleStartAddWaypoint}
          onRemoveWaypoint={handleRemoveWaypoint}
          onVote={handleVote}
          onConnClick={(connId, fromId, toId) => {
            const fromMarker = markers.find(m => m.id === fromId)
            const toMarker   = markers.find(m => m.id === toId)
            setSelectedMarker(null)
            if (fromMarker && toMarker) {
              const fp = { lat: fromMarker.lat, lng: fromMarker.lng, name: fromMarker.name }
              const tp = { lat: toMarker.lat,   lng: toMarker.lng,   name: toMarker.name   }
              setFromPoint(fp)
              setToPoint(tp)
              setRoutePrefill({ from: fp, to: tp })
            } else {
              setFocusedSegment({ connId, fromId, toId })
            }
          }}
          onOpenProfile={(uid) => setProfileUserId(uid)}
        />
      )}

      {profileUserId && (
        <UserProfile userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}

      <StreetViewPanel image={streetViewImg} onClose={() => setStreetViewImg(null)} />

      {showAuth && (
        <AuthModal
          onClose={() => {
            setShowAuth(false)
            localStorage.setItem('sakayan_auth_dismissed', '1')
          }}
          onSuccess={(loggedInUser) => {
            setUser(loggedInUser)
            setShowAuth(false)
          }}
        />
      )}

      <div style={{
        position: 'fixed', bottom: 8, left: 10, zIndex: 9999,
        fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
        color: 'rgba(255,255,255,0.85)', background: 'rgba(10,6,0,0.35)',
        padding: '3px 7px', borderRadius: 6, pointerEvents: 'none',
        fontFamily: "'Sora', sans-serif", textTransform: 'uppercase',
        backdropFilter: 'blur(4px)',
      }}>beta</div>

    </div>
  )
}
