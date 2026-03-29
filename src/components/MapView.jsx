import { useEffect, useState, useRef } from 'react'
import {
  MapContainer, TileLayer, Marker, Polyline, Tooltip,
  useMapEvents, useMap,
} from 'react-leaflet'
import L from 'leaflet'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import RoadRoute from './RoadRoute'
import { TYPE_COLORS } from '../data/sampleData'

const MAPILLARY_TILE_ZOOM = 14
const MAPILLARY_TOKEN = process.env.NEXT_PUBLIC_MAPILLARY_TOKEN || ''

// Convert lat/lng → tile XY
function latLngToTile(lat, lng, zoom) {
  const n = Math.pow(2, zoom)
  const x = Math.floor((lng + 180) / 360 * n)
  const sinLat = Math.sin(lat * Math.PI / 180)
  const y = Math.floor((1 - Math.log((1 + sinLat) / (1 - sinLat)) / (2 * Math.PI)) / 2 * n)
  return { x, y }
}

// Convert vector tile pixel coords → lat/lng
function tilePixelToLatLng(px, py, tx, ty, zoom, extent = 4096) {
  const n = Math.pow(2, zoom)
  const lng = (tx + px / extent) / n * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (ty + py / extent) / n)))
  return { lat: latRad * 180 / Math.PI, lng }
}

// Fetch Mapillary MVT vector tile — returns all image positions in tile
async function fetchMapillaryTile(tx, ty, zoom) {
  const res = await fetch(`https://tiles.mapillary.com/maps/vtp/mly1_public/2/${zoom}/${tx}/${ty}?access_token=${MAPILLARY_TOKEN}`)
  if (!res.ok) return []
  const buf = await res.arrayBuffer()
  const tile = new VectorTile(new Pbf(new Uint8Array(buf)))
  const layer = tile.layers['image']
  if (!layer) return []
  const images = []
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i)
    const geom = feature.loadGeometry()
    if (!geom.length || !geom[0].length) continue
    const { x, y } = geom[0][0]
    const { lat, lng } = tilePixelToLatLng(x, y, tx, ty, zoom, layer.extent)
    images.push({ id: String(feature.properties.id), lat, lng })
  }
  return images
}

// Pure-canvas Mapillary layer — fetches Mapillary's actual tile data server-side,
// draws all dots in one canvas context. Zero Leaflet layer objects per dot.
function MapillaryLayer({ onImageClick }) {
  const map = useMap()
  const stateRef = useRef({ images: [], tileCache: {}, pendingTiles: new Set(), rafId: null, timer: null })
  const onImageClickRef = useRef(onImageClick)
  onImageClickRef.current = onImageClick

  useEffect(() => {
    const s = stateRef.current

    // Canvas attached to map container (not a pane), never moves — we redraw on every map move
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:650'
    map.getContainer().appendChild(canvas)

    const draw = () => {
      s.rafId = null
      const size = map.getSize()
      if (canvas.width !== size.x) canvas.width = size.x
      if (canvas.height !== size.y) canvas.height = size.y
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, size.x, size.y)
      if (map.getZoom() < MAPILLARY_TILE_ZOOM) return
      ctx.fillStyle = '#22C55E'
      for (const img of s.images) {
        const pt = map.latLngToContainerPoint([img.lat, img.lng])
        if (pt.x < -5 || pt.x > size.x + 5 || pt.y < -5 || pt.y > size.y + 5) continue
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const schedDraw = () => { if (!s.rafId) s.rafId = requestAnimationFrame(draw) }

    const fetchTiles = () => {
      clearTimeout(s.timer)
      s.timer = setTimeout(async () => {
        if (map.getZoom() < MAPILLARY_TILE_ZOOM) { s.images = []; schedDraw(); return }

        // Get all z14 tiles visible in current viewport
        const b = map.getBounds()
        const tMin = latLngToTile(b.getNorth(), b.getWest(), MAPILLARY_TILE_ZOOM)
        const tMax = latLngToTile(b.getSouth(), b.getEast(), MAPILLARY_TILE_ZOOM)
        const needed = []
        for (let tx = tMin.x; tx <= tMax.x; tx++) {
          for (let ty = tMin.y; ty <= tMax.y; ty++) {
            needed.push(`${MAPILLARY_TILE_ZOOM}/${tx}/${ty}`)
          }
        }

        // Fetch only uncached tiles in parallel
        const uncached = needed.filter(k => !(k in s.tileCache) && !s.pendingTiles.has(k))
        uncached.forEach(k => s.pendingTiles.add(k))

        await Promise.all(uncached.map(async k => {
          const [, tx, ty] = k.split('/').map(Number)
          try {
            s.tileCache[k] = await fetchMapillaryTile(tx, ty, MAPILLARY_TILE_ZOOM)
          } catch {
            s.tileCache[k] = []
          } finally {
            s.pendingTiles.delete(k)
          }
        }))

        // Merge all cached tiles for visible area into one images array
        s.images = needed.flatMap(k => s.tileCache[k] || [])
        schedDraw()
      }, 350)
    }

    const handleClick = (e) => {
      if (map.getZoom() < MAPILLARY_TILE_ZOOM) return
      const pt = e.containerPoint
      let closest = null, minDist = 14
      for (const img of s.images) {
        const ip = map.latLngToContainerPoint([img.lat, img.lng])
        const d = Math.hypot(pt.x - ip.x, pt.y - ip.y)
        if (d < minDist) { minDist = d; closest = img }
      }
      if (closest) onImageClickRef.current(closest)
    }

    let lastMoveDrawn = 0
    const throttledDraw = () => {
      const now = Date.now()
      if (now - lastMoveDrawn > 100) { lastMoveDrawn = now; schedDraw() }
    }
    map.on('move', throttledDraw)
    map.on('zoom', schedDraw)
    map.on('moveend', schedDraw)
    map.on('moveend', fetchTiles)
    map.on('zoomend', fetchTiles)
    map.on('click', handleClick)
    fetchTiles()

    return () => {
      clearTimeout(s.timer)
      if (s.rafId) cancelAnimationFrame(s.rafId)
      map.off('move', schedDraw)
      map.off('zoom', schedDraw)
      map.off('moveend', fetchTiles)
      map.off('zoomend', fetchTiles)
      map.off('click', handleClick)
      canvas.remove()
    }
  }, [map])

  return null
}

const PHILIPPINES = [14.55, 121.02]  // Ortigas/Mandaluyong — best Mapillary coverage for mobile
const DEFAULT_ZOOM = 13

const MAP_VIEW_KEY = 'sakayan_map_view_v2'

function getSavedView() {
  try {
    const v = localStorage.getItem(MAP_VIEW_KEY)
    if (v) {
      const { lat, lng, zoom } = JSON.parse(v)
      if (lat && lng && zoom) return { center: [lat, lng], zoom: Math.max(zoom, DEFAULT_ZOOM) }
    }
  } catch {}
  return { center: PHILIPPINES, zoom: DEFAULT_ZOOM }
}
const PH_BOUNDS = [[4.5, 116.0], [21.5, 127.0]]
const GREY = '#9CA3AF'

// Guard against geometry stored as [lng, lat] instead of [lat, lng].
// For the Philippines: lat is 5–21, lng is 116–128. If first coord > 90, it's lng.
function normGeom(geometry) {
  if (!geometry || !geometry.length) return geometry
  const [a] = geometry[0]
  return Math.abs(a) > 90 ? geometry.map(([ln, la]) => [la, ln]) : geometry
}

// Check whether a connection matches the current focused segment.
// Prefers matching by connId (set when clicking from MarkerModal) so
// the comparison is always exact, with a fromId/toId fallback for
// focus set from DirectionPanel or waypoint clicks.
function isConnFocused(conn, focusedSegment) {
  if (!focusedSegment) return false
  if (focusedSegment.connId != null) return conn.id === focusedSegment.connId
  return (
    (conn.fromId === focusedSegment.fromId && conn.toId === focusedSegment.toId) ||
    (conn.fromId === focusedSegment.toId   && conn.toId === focusedSegment.fromId)
  )
}

function buildIcon(color, pulse = false) {
  if (pulse) {
    return L.divIcon({
      html: `<div style="position:relative;width:25px;height:41px">
        <div style="position:absolute;top:-6px;left:-6px;width:37px;height:37px;border:3px solid ${color};border-radius:50%;animation:pulse-ring 1s infinite;opacity:.6"></div>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
          <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="${color}" stroke="white" stroke-width="2.5"/>
          <circle cx="12.5" cy="12.5" r="4.5" fill="white"/>
        </svg>
      </div>`,
      className: '', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
    })
  }
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
      <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
      <circle cx="12.5" cy="12.5" r="4.5" fill="white"/>
    </svg>`,
    className: '', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
  })
}

const fromIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
    <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#22C55E" stroke="white" stroke-width="1.5"/>
    <circle cx="12.5" cy="12.5" r="4.5" fill="white"/>
  </svg>`,
  className: '', iconSize: [25, 41], iconAnchor: [12, 41],
})

const toIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
    <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#EF4444" stroke="white" stroke-width="1.5"/>
    <circle cx="12.5" cy="12.5" r="4.5" fill="white"/>
  </svg>`,
  className: '', iconSize: [25, 41], iconAnchor: [12, 41],
})

const userIcon = L.divIcon({
  html: `<div class="user-dot"><div class="user-pulse"></div></div>`,
  className: '', iconSize: [20, 20], iconAnchor: [10, 10],
})

const searchIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
    <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#6366F1" stroke="white" stroke-width="1.5"/>
    <circle cx="12.5" cy="12.5" r="4.5" fill="white"/>
  </svg>`,
  className: '', iconSize: [25, 41], iconAnchor: [12, 41],
})

function buildWaypointIcon(color) {
  return L.divIcon({
    html: `<div style="width:14px;height:14px;background:white;border:3px solid ${color};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

const pendingIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
    <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#888" stroke="white" stroke-width="1.5" stroke-dasharray="3 2"/>
    <circle cx="12.5" cy="12.5" r="4.5" fill="white"/>
  </svg>`,
  className: '', iconSize: [25, 41], iconAnchor: [12, 41],
})

function ClickHandler({ onMapClick }) {
  useMapEvents({ click(e) { onMapClick(e.latlng) } })
  return null
}

function BoundsTracker({ onBoundsChange, onZoomChange }) {
  const map = useMap()
  useEffect(() => {
    onBoundsChange(map.getBounds())
    onZoomChange(map.getZoom())
    const handler = () => { onBoundsChange(map.getBounds()); onZoomChange(map.getZoom()) }
    map.on('moveend', handler)
    map.on('zoomend', handler)
    return () => { map.off('moveend', handler); map.off('zoomend', handler) }
  }, [map, onBoundsChange, onZoomChange])
  return null
}

function MapController({ fromPoint, toPoint, userLocation, flyTarget, focusedSegment, markers, fitBoundsPoints }) {
  const map = useMap()

  // Expose map on window so Playwright tests can control zoom/pan
  useEffect(() => { window.__leafletMap = map }, [map])

  // Persist map position to localStorage
  useEffect(() => {
    const handler = () => {
      const c = map.getCenter()
      localStorage.setItem(MAP_VIEW_KEY, JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }))
    }
    map.on('moveend', handler)
    map.on('zoomend', handler)
    return () => { map.off('moveend', handler); map.off('zoomend', handler) }
  }, [map])

  useEffect(() => {
    if (fromPoint && toPoint) {
      map.fitBounds(
        [[fromPoint.lat, fromPoint.lng], [toPoint.lat, toPoint.lng]],
        { padding: [60, 60], maxZoom: 15, animate: true }
      )
    }
  }, [fromPoint, toPoint]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (userLocation) map.flyTo([userLocation.lat, userLocation.lng], 16, { duration: 1.2 })
  }, [userLocation]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (flyTarget) map.flyTo([flyTarget.lat, flyTarget.lng], 16, { duration: 1.2 })
  }, [flyTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focusedSegment || !markers) return
    const from = markers.find(m => m.id === focusedSegment.fromId)
    const to   = markers.find(m => m.id === focusedSegment.toId)
    if (from && to) {
      map.fitBounds(
        [[from.lat, from.lng], [to.lat, to.lng]],
        { padding: [80, 80], maxZoom: 16, animate: true }
      )
    }
  }, [focusedSegment]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fitBoundsPoints || fitBoundsPoints.length < 2) return
    map.fitBounds(fitBoundsPoints, { padding: [80, 80], maxZoom: 16, animate: true })
  }, [fitBoundsPoints]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

function UserRoute({ fromPoint, toPoint }) {
  const [positions, setPositions] = useState(null)

  useEffect(() => {
    if (!fromPoint || !toPoint) { setPositions(null); return }
    const coords = `${fromPoint.lng},${fromPoint.lat};${toPoint.lng},${toPoint.lat}`
    fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
      .then(r => r.json())
      .then(data => {
        const geom = data.routes?.[0]?.geometry?.coordinates
        setPositions(geom ? geom.map(([lng, lat]) => [lat, lng])
          : [[fromPoint.lat, fromPoint.lng], [toPoint.lat, toPoint.lng]])
      })
      .catch(() => setPositions([[fromPoint.lat, fromPoint.lng], [toPoint.lat, toPoint.lng]]))
  }, [fromPoint, toPoint])

  if (!fromPoint || !toPoint) return null
  if (!positions) {
    return (
      <Polyline
        positions={[[fromPoint.lat, fromPoint.lng], [toPoint.lat, toPoint.lng]]}
        color="#6366F1" weight={3} opacity={0.3} dashArray="6 8"
      />
    )
  }
  return (
    <>
      <Polyline positions={positions} color="white" weight={9} opacity={0.9} interactive={false} />
      <Polyline positions={positions} color="#6366F1" weight={5} opacity={1} />
    </>
  )
}

export default function MapView({
  markers, connections, pendingAlternatives,
  connectingFrom,
  onMarkerClick, onMapClick,
  fromPoint, toPoint, userLocation, flyTarget,
  addingMode, pendingLatLng,
  activeStopIds,
  activeConnIds,
  focusedSegment,
  fitBoundsPoints,
  addingWaypointMode,
  pendingWpLatLng,
  onWaypointClick,
  onStreetViewClick,
  showStreetPhotos,
}) {
  const [mapBounds, setMapBounds] = useState(null)
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM)
  const hasActiveRoute = activeStopIds && activeStopIds.length > 0

  const MARKER_MIN_ZOOM = 14  // hide all markers below this zoom to prevent lag

  // Only render markers visible in the current viewport (+ always show active/focused ones)
  const alwaysVisible = new Set([
    ...(activeStopIds || []),
    focusedSegment?.fromId,
    focusedSegment?.toId,
    connectingFrom,
  ].filter(Boolean))
  const visibleMarkers = mapZoom < MARKER_MIN_ZOOM
    ? markers.filter(m => alwaysVisible.has(m.id))  // only show active/route markers when zoomed out
    : mapBounds
      ? markers.filter(m => mapBounds.contains([m.lat, m.lng]) || alwaysVisible.has(m.id))
      : markers

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {/* Custom attribution — must be outside MapContainer so it renders in the DOM */}
      <div style={{
        position: 'absolute', bottom: 0, right: 0, zIndex: 1000,
        background: 'rgba(255,255,255,0.85)', padding: '2px 8px',
        borderTopLeftRadius: 6, fontSize: 11, pointerEvents: 'auto',
      }}>
        <a
          href="https://www.facebook.com/people/Sakayan/61578529771903/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#1877F2', textDecoration: 'none', fontWeight: 600 }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="#1877F2">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          Sakayan
        </a>
      </div>
      <MapContainer
        center={getSavedView().center}
        zoom={getSavedView().zoom}
        minZoom={5}
        maxBounds={PH_BOUNDS}
        maxBoundsViscosity={1.0}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          key={showStreetPhotos ? 'light' : 'osm'}
          url={showStreetPhotos
            ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
            : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}
          attribution=''
          maxZoom={19}
        />

        {/* Saved connections — always grey unless part of active route */}
        {connections.map(conn => {
          const from = markers.find(m => m.id === conn.fromId)
          const to   = markers.find(m => m.id === conn.toId)
          if (!from || !to) return null

          const isActiveRoute = activeConnIds?.includes(conn.id)
          const lineColor   = isActiveRoute ? (conn.color || TYPE_COLORS[from.type] || '#4A90D9') : GREY
          const lineOpacity = isActiveRoute ? 1 : 0.45

          if (conn.geometry) {
            return (
              <Polyline key={conn.id} positions={normGeom(conn.geometry)}
                color={lineColor} weight={5} opacity={lineOpacity} interactive={false} />
            )
          }
          return (
            <RoadRoute key={conn.id}
              route={{ id: conn.id, waypoints: [[from.lat, from.lng], [to.lat, to.lng]], color: lineColor, weight: 5, opacity: lineOpacity }}
            />
          )
        })}

        {/* Focused connection — separate overlay mounted fresh on top so color always applies */}
        {focusedSegment && connections.filter(conn => isConnFocused(conn, focusedSegment)).map(conn => {
          const from = markers.find(m => m.id === conn.fromId)
          const to   = markers.find(m => m.id === conn.toId)
          if (!from || !to) return null
          const lineColor = conn.color || TYPE_COLORS[from.type] || '#4A90D9'
          if (conn.geometry) {
            return (
              <Polyline key={`focused-${conn.id}`} positions={normGeom(conn.geometry)}
                color={lineColor} weight={5} opacity={1} interactive={false} />
            )
          }
          return (
            <RoadRoute key={`focused-${conn.id}`}
              route={{ id: `focused-${conn.id}`, waypoints: [[from.lat, from.lng], [to.lat, to.lng]], color: lineColor, weight: 5, opacity: 1 }}
            />
          )
        })}

        {/* Intermediate stops (waypoints) along each connection */}
        {connections.flatMap(conn => {
          const wps = conn.waypoints || []
          const isActiveRoute = activeConnIds?.includes(conn.id)
          const isFocused = isConnFocused(conn, focusedSegment)
          const wpColor = (isActiveRoute || isFocused) ? (conn.color || GREY) : GREY
          return wps.map(wp => (
            <Marker
              key={`wp-${wp.id}`}
              position={[wp.lat, wp.lng]}
              icon={buildWaypointIcon(wpColor)}
              eventHandlers={{
                click: (e) => {
                  e.originalEvent?.stopPropagation()
                  onWaypointClick?.(conn.fromId, conn.toId)
                }
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{wp.name}</span>
              </Tooltip>
            </Marker>
          ))
        })}

        {/* Pending waypoint pin */}
        {addingWaypointMode && pendingWpLatLng && (
          <Marker position={[pendingWpLatLng.lat, pendingWpLatLng.lng]} icon={pendingIcon} />
        )}

        {/* Pending alternatives — distinct colors so user can match Option N to map line */}
        {pendingAlternatives.map(alt => (
          <Polyline
            key={`alt-${alt.id}`}
            positions={alt.positions}
            color={alt.color}
            weight={6}
            opacity={0.7}
            interactive={false}
          />
        ))}

        <UserRoute fromPoint={fromPoint} toPoint={toPoint} />

        {visibleMarkers.map(marker => {
          let color = GREY
          let pulse = false

          if (connectingFrom === marker.id) {
            // Source marker in connect mode → green + pulse
            color = '#22C55E'
            pulse = true
          } else if (connectingFrom !== null) {
            // Other markers in connect mode → grey + pulse (tappable targets)
            color = GREY
            pulse = true
          } else if (focusedSegment && (marker.id === focusedSegment.fromId || marker.id === focusedSegment.toId)) {
            // Part of focused segment → type color + pulse
            color = TYPE_COLORS[marker.type] || '#4A90D9'
            pulse = true
          } else if (hasActiveRoute && activeStopIds.includes(marker.id)) {
            // Part of active route → type color
            color = TYPE_COLORS[marker.type] || '#4A90D9'
          }

          return (
            <Marker
              key={marker.id}
              position={[marker.lat, marker.lng]}
              icon={buildIcon(color, pulse)}
              eventHandlers={{ click: () => onMarkerClick(marker) }}
            />
          )
        })}

        {fromPoint    && <Marker position={[fromPoint.lat,    fromPoint.lng]}    icon={fromIcon}   />}
        {toPoint      && <Marker position={[toPoint.lat,      toPoint.lng]}      icon={toIcon}     />}
        {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}   />}
        {addingMode && pendingLatLng && (
          <Marker position={[pendingLatLng.lat, pendingLatLng.lng]} icon={pendingIcon} />
        )}
        {flyTarget && (
          <Marker position={[flyTarget.lat, flyTarget.lng]} icon={searchIcon} />
        )}

        <BoundsTracker onBoundsChange={setMapBounds} onZoomChange={setMapZoom} />
        <ClickHandler onMapClick={onMapClick} />
        <MapController
          fromPoint={fromPoint}
          toPoint={toPoint}
          userLocation={userLocation}
          flyTarget={flyTarget}
          focusedSegment={focusedSegment}
          fitBoundsPoints={fitBoundsPoints}
          markers={markers}
        />
        {showStreetPhotos && <MapillaryLayer onImageClick={onStreetViewClick} />}
      </MapContainer>
    </div>
  )
}
