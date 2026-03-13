import { useEffect, useState } from 'react'
import {
  MapContainer, TileLayer, Marker, Polyline,
  useMapEvents, useMap,
} from 'react-leaflet'
import L from 'leaflet'
import RoadRoute from './RoadRoute'
import { TYPE_COLORS } from '../data/sampleData'

const PHILIPPINES = [12.8797, 121.7740]
const DEFAULT_ZOOM = 6
const GREY = '#9CA3AF'

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

function MapController({ fromPoint, toPoint, userLocation, flyTarget, focusedSegment, markers, fitBoundsPoints }) {
  const map = useMap()

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
}) {
  const hasActiveRoute = activeStopIds && activeStopIds.length > 0

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer
        center={PHILIPPINES}
        zoom={DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={true}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        {/* Saved connections — grey by default, colored when part of active route or focused */}
        {connections.map(conn => {
          const from = markers.find(m => m.id === conn.fromId)
          const to   = markers.find(m => m.id === conn.toId)
          if (!from || !to) return null

          const isActiveRoute = activeConnIds?.includes(conn.id)
          const isFocused = focusedSegment && (
            (conn.fromId === focusedSegment.fromId && conn.toId === focusedSegment.toId) ||
            (conn.fromId === focusedSegment.toId   && conn.toId === focusedSegment.fromId)
          )

          const lineColor   = (isActiveRoute || isFocused)
            ? (conn.color || TYPE_COLORS[from.type] || '#4A90D9')
            : GREY
          const lineWeight  = isFocused ? 8 : 5
          const lineOpacity = isFocused ? 1 : (isActiveRoute ? 1 : 0.45)

          if (conn.geometry) {
            return (
              <Polyline key={conn.id} positions={conn.geometry}
                color={lineColor} weight={lineWeight} opacity={lineOpacity} interactive={false} />
            )
          }
          return (
            <RoadRoute
              key={conn.id}
              route={{ id: conn.id, waypoints: [[from.lat, from.lng], [to.lat, to.lng]], color: lineColor }}
            />
          )
        })}

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

        {markers.map(marker => {
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
      </MapContainer>
    </div>
  )
}
