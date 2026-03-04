import { useEffect } from 'react'
import {
  MapContainer, TileLayer, Marker,
  useMapEvents, useMap,
} from 'react-leaflet'
import L from 'leaflet'
import RoadRoute from './RoadRoute'
import { SAMPLE_ROUTES, TYPE_COLORS } from '../data/sampleData'

// Center on Metro Manila by default
const METRO_MANILA = [14.5820, 121.0090]
const DEFAULT_ZOOM = 13

function buildIcon(type) {
  const color = TYPE_COLORS[type] || '#E74C3C'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
    <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
    <circle cx="12.5" cy="12.5" r="4.5" fill="white"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize:    [25, 41],
    iconAnchor:  [12, 41],
    popupAnchor: [1, -34],
  })
}

const pendingIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
    <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#888" stroke="white" stroke-width="1.5" stroke-dasharray="3 2"/>
    <circle cx="12.5" cy="12.5" r="4.5" fill="white"/>
  </svg>`,
  className: '',
  iconSize:   [25, 41],
  iconAnchor: [12, 41],
})

function ClickHandler({ onMapClick }) {
  useMapEvents({ click(e) { onMapClick(e.latlng) } })
  return null
}

function FlyToHandler({ flyTo }) {
  const map = useMap()
  useEffect(() => {
    if (flyTo) map.flyTo([flyTo.lat, flyTo.lng], 15, { duration: 1.5 })
  }, [flyTo, map])
  return null
}

export default function MapView({ markers, onMarkerClick, onMapClick, flyTo, addingMode, pendingLatLng }) {
  return (
    <MapContainer
      center={METRO_MANILA}
      zoom={DEFAULT_ZOOM}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
      attributionControl={true}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
        maxZoom={19}
      />

      {/* Road-aligned routes via OSRM */}
      {SAMPLE_ROUTES.map(route => (
        <RoadRoute key={route.id} route={route} />
      ))}

      {/* Markers */}
      {markers.map(marker => (
        <Marker
          key={marker.id}
          position={[marker.lat, marker.lng]}
          icon={buildIcon(marker.type)}
          eventHandlers={{ click: () => onMarkerClick(marker) }}
        />
      ))}

      {/* Ghost pin while adding */}
      {addingMode && pendingLatLng && (
        <Marker
          position={[pendingLatLng.lat, pendingLatLng.lng]}
          icon={pendingIcon}
        />
      )}

      <ClickHandler onMapClick={onMapClick} />
      <FlyToHandler flyTo={flyTo} />
    </MapContainer>
  )
}
