import { useState, useEffect } from 'react'
import { Polyline, Tooltip } from 'react-leaflet'

export default function RoadRoute({ route }) {
  const [positions, setPositions] = useState(null) // null = loading

  useEffect(() => {
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
          setPositions(geom.map(([lng, lat]) => [lat, lng]))
        } else {
          setPositions(route.waypoints) // fallback
        }
      })
      .catch(() => setPositions(route.waypoints)) // fallback on network error
  }, [route.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // While loading: show a faint dashed line between waypoints so the route area is visible
  if (!positions) {
    return (
      <Polyline
        positions={route.waypoints}
        color={route.color}
        weight={3}
        opacity={0.3}
        dashArray="6 8"
      >
        <Tooltip sticky>{route.label}</Tooltip>
      </Polyline>
    )
  }

  return (
    <Polyline
      positions={positions}
      color={route.color}
      weight={5}
      opacity={0.85}
    >
      <Tooltip sticky>{route.label}</Tooltip>
    </Polyline>
  )
}
