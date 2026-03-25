import { useEffect, useState, useRef } from 'react'
import {
  MapContainer, TileLayer, Marker, Polyline, Tooltip,
  useMapEvents, useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.vectorgrid'
import RoadRoute from './RoadRoute'
import { TYPE_COLORS } from '../data/sampleData'

const MAPILLARY_MIN_ZOOM = 13

function MapillaryLayer({ onImageClick }) {
  const map = useMap()
  const layerRef = useRef(null)
  const onImageClickRef = useRef(onImageClick)
  onImageClickRef.current = onImageClick

  useEffect(() => {
    if (!L.vectorGrid) return

    // Custom pane above markerPane (z=600) so dots render on top of transit markers
    if (!map.getPane('mapillaryPane')) {
      map.createPane('mapillaryPane')
      map.getPane('mapillaryPane').style.zIndex = '620'
    }

    const layer = L.vectorGrid.protobuf(
      `/api/maptile?z={z}&x={x}&y={y}`,
      {
        minZoom: MAPILLARY_MIN_ZOOM,
        maxNativeZoom: 14,
        pane: 'mapillaryPane',
        vectorTileLayerStyles: {
          image: { weight: 1.5, color: '#ffffff', fillColor: '#22C55E', fillOpacity: 1, radius: 4, fill: true },
          sequence: { weight: 0, opacity: 0, fill: false },
          overview: { weight: 0, opacity: 0, fill: false, radius: 0 },
        },
        interactive: true,
        getFeatureId: f => f.properties.id,
      }
    )

    layer.on('click', e => {
      L.DomEvent.stopPropagation(e)
      onImageClickRef.current({ id: e.layer.properties.id, lat: e.latlng.lat, lng: e.latlng.lng })
    })

    layer.addTo(map)
    layerRef.current = layer

    return () => { layer.remove() }
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

  const MARKER_MIN_ZOOM = 13  // hide all markers below this zoom to prevent lag

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
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
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
              <Polyline key={conn.id} positions={conn.geometry}
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
              <Polyline key={`focused-${conn.id}`} positions={conn.geometry}
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
