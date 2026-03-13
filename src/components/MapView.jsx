import { useEffect, useState } from 'react'
import {
  MapContainer, TileLayer, Marker, Polyline,
  useMapEvents, useMap,
} from 'react-leaflet'
import L from 'leaflet'
import RoadRoute from './RoadRoute'
import { TYPE_COLORS } from '../data/sampleData'

const METRO_MANILA = [14.5820, 121.0090]
const DEFAULT_ZOOM = 13

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

function buildLineIcon(type, order) {
  const color = TYPE_COLORS[type] || '#E74C3C'
  return L.divIcon({
    html: `<div style="position:relative;width:25px;height:41px">
      <div style="position:absolute;top:-6px;left:-6px;width:37px;height:37px;border:3px solid ${color};border-radius:50%;animation:pulse-ring 1s infinite;opacity:.6"></div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">
        <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="${color}" stroke="white" stroke-width="2.5"/>
        <circle cx="12.5" cy="12.5" r="4.5" fill="white"/>
        ${order > 0 ? `<text x="12.5" y="16" text-anchor="middle" font-size="8" font-weight="bold" fill="${color}">${order}</text>` : ''}
      </svg>
    </div>`,
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

function MapController({ fromPoint, toPoint, userLocation, flyTarget }) {
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
  markers, lines, buildingLine,
  onMarkerClick, onMapClick,
  fromPoint, toPoint, userLocation, flyTarget,
  addingMode, pendingLatLng,
}) {
  // Map: stopId → order in building line (1-based), 0 if not in building line
  const buildingOrderMap = {}
  if (buildingLine) {
    buildingLine.stopIds.forEach((id, i) => { buildingOrderMap[id] = i + 1 })
  }

  // Building preview: dashed polyline connecting tapped stops in sequence
  const buildingPreviewPositions = buildingLine?.stopIds.length >= 2
    ? buildingLine.stopIds
        .map(id => markers.find(m => m.id === id))
        .filter(Boolean)
        .map(m => [m.lat, m.lng])
    : null

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
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

        {/* Render each saved line as road-snapped segments */}
        {lines.map(line =>
          line.stopIds.slice(0, -1).map((fromId, i) => {
            const toId  = line.stopIds[i + 1]
            const from  = markers.find(m => m.id === fromId)
            const to    = markers.find(m => m.id === toId)
            if (!from || !to) return null
            return (
              <RoadRoute
                key={`${line.id}-${i}`}
                route={{
                  id:        `${line.id}-${i}`,
                  waypoints: [[from.lat, from.lng], [to.lat, to.lng]],
                  color:     line.color,
                }}
              />
            )
          })
        )}

        {/* Building preview — dashed straight line */}
        {buildingPreviewPositions && (
          <Polyline
            positions={buildingPreviewPositions}
            color={buildingLine.color}
            weight={3}
            opacity={0.7}
            dashArray="8 6"
            interactive={false}
          />
        )}

        <UserRoute fromPoint={fromPoint} toPoint={toPoint} />

        {markers.map(marker => {
          const order = buildingOrderMap[marker.id] ?? 0
          const icon  = buildingLine
            ? buildLineIcon(marker.type, order)
            : buildIcon(marker.type)
          return (
            <Marker
              key={marker.id}
              position={[marker.lat, marker.lng]}
              icon={icon}
              eventHandlers={{ click: () => onMarkerClick(marker) }}
            />
          )
        })}

        {fromPoint   && <Marker position={[fromPoint.lat,   fromPoint.lng]}   icon={fromIcon}   />}
        {toPoint     && <Marker position={[toPoint.lat,     toPoint.lng]}     icon={toIcon}     />}
        {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon} />}
        {addingMode && pendingLatLng && (
          <Marker position={[pendingLatLng.lat, pendingLatLng.lng]} icon={pendingIcon} />
        )}
        {flyTarget && (
          <Marker position={[flyTarget.lat, flyTarget.lng]} icon={searchIcon} />
        )}

        <ClickHandler onMapClick={onMapClick} />
        <MapController fromPoint={fromPoint} toPoint={toPoint} userLocation={userLocation} flyTarget={flyTarget} />
      </MapContainer>
    </div>
  )
}
