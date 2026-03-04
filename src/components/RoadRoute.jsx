import { useState, useEffect } from 'react'
import { Polyline, Tooltip } from 'react-leaflet'

export default function RoadRoute({ route }) {
  const [positions, setPositions] = useState(null)

  useEffect(() => {
    // OSRM uses lng,lat order
    const coords = route.waypoints
      .map(([lat, lng]) => `${lng},${lat}`)
      .join(';')

    fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
    )
      .then(r => r.json())
      .then(data => {
        const geom = data.routes?.[0]?.geometry?.coordinates
        if (geom) {
          // GeoJSON gives [lng, lat] — Leaflet needs [lat, lng]
          setPositions(geom.map(([lng, lat]) => [lat, lng]))
        }
      })
      .catch(() => {
        // Fallback to straight waypoints if OSRM is unreachable
        setPositions(route.waypoints)
      })
  }, [route.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!positions) return null

  return (
    <Polyline
      positions={positions}
      color={route.color}
      weight={5}
      opacity={0.85}
    >
      <Tooltip sticky direction="top" className="route-tooltip">
        {route.label}
      </Tooltip>
    </Polyline>
  )
}
