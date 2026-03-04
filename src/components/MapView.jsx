import { useEffect, useState } from 'react'
import {
  MapContainer, TileLayer, Marker, Polyline,
  useMapEvents, useMap,
} from 'react-leaflet'
import L from 'leaflet'
import RoadRoute from './RoadRoute'
import { SAMPLE_ROUTES, TYPE_COLORS } from '../data/sampleData'

const METRO_MANILA = [14.5820, 121.0090]
const DEFAULT_ZOOM = 13

// Colored pin per vehicle type
function buildIcon(type) {
  const color = TYPE_COLORS[type] || '#E74C3C'
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
      <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
      <circle cx="12.5" cy="12.5" r="4.5" fill="white"/>
    </svg>`,
    className: '', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
  })
}

// From pin (green)
const fromIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
    <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#22C55E" stroke="white" stroke-width="1.5"/>
    <circle cx="12.5" cy="12.5" r="4.5" fill="white"/>
  </svg>`,
  className: '', iconSize: [25, 41], iconAnchor: [12, 41],
})

// To pin (red)
const toIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
    <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#EF4444" stroke="white" stroke-width="1.5"/>
    <circle cx="12.5" cy="12.5" r="4.5" fill="white"/>
  </svg>`,
  className: '', iconSize: [25, 41], iconAnchor: [12, 41],
})

// User location dot (blue pulsing)
const userIcon = L.divIcon({
  html: `<div class="user-dot"><div class="user-pulse"></div></div>`,
  className: '', iconSize: [20, 20], iconAnchor: [10, 10],
})

// Pending pin while adding
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

// Fits map to show both from+to, or flies to userLocation
function MapController({ fromPoint, toPoint, userLocation }) {
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
    if (userLocation) {
      map.flyTo([userLocation.lat, userLocation.lng], 16, { duration: 1.2 })
    }
  }, [userLocation]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

// OSRM route between from and to
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

  // dashed placeholder while loading
  if (!positions) {
    return (
      <Polyline
        positions={[[fromPoint.lat, fromPoint.lng], [toPoint.lat, toPoint.lng]]}
        color="#6366F1" weight={3} opacity={0.3} dashArray="6 8"
      />
    )
  }

  return <Polyline positions={positions} color="#6366F1" weight={5} opacity={0.9} />
}

export default function MapView({
  markers, onMarkerClick, onMapClick,
  fromPoint, toPoint, userLocation,
  addingMode, pendingLatLng,
}) {
  return (
    <MapContainer
      center={METRO_MANILA}
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

      {/* Sample routes */}
      {SAMPLE_ROUTES.map(route => <RoadRoute key={route.id} route={route} />)}

      {/* User's searched route */}
      <UserRoute fromPoint={fromPoint} toPoint={toPoint} />

      {/* Stop markers */}
      {markers.map(marker => (
        <Marker
          key={marker.id}
          position={[marker.lat, marker.lng]}
          icon={buildIcon(marker.type)}
          eventHandlers={{ click: () => onMarkerClick(marker) }}
        />
      ))}

      {/* From / To pins */}
      {fromPoint && <Marker position={[fromPoint.lat, fromPoint.lng]} icon={fromIcon} />}
      {toPoint   && <Marker position={[toPoint.lat,   toPoint.lng]}   icon={toIcon}   />}

      {/* User location */}
      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon} />
      )}

      {/* Pending add-marker ghost pin */}
      {addingMode && pendingLatLng && (
        <Marker position={[pendingLatLng.lat, pendingLatLng.lng]} icon={pendingIcon} />
      )}

      <ClickHandler onMapClick={onMapClick} />
      <MapController fromPoint={fromPoint} toPoint={toPoint} userLocation={userLocation} />
    </MapContainer>
  )
}
