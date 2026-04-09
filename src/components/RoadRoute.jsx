import { useState, useEffect } from 'react'
import { Polyline } from 'react-leaflet'

// Double-layer polyline: white casing + colored line so routes pop against OSM tiles
function StyledRoute({ positions, color, weight = 5, opacity = 1, dashed = false }) {
  const dash = dashed ? '8 8' : undefined
  return (
    <>
      {/* White casing underneath */}
      <Polyline
        positions={positions}
        color="white"
        weight={weight + 4}
        opacity={0.9}
        dashArray={dash}
        interactive={false}
      />
      {/* Colored line on top */}
      <Polyline
        positions={positions}
        color={color}
        weight={weight}
        opacity={opacity}
        dashArray={dash}
        interactive={false}
      />
    </>
  )
}

export default function RoadRoute({ route }) {
  const [positions, setPositions] = useState(null)

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
        setPositions(geom ? geom.map(([lng, lat]) => [lat, lng]) : route.waypoints)
      })
      .catch(() => setPositions(route.waypoints))
  }, [route.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!positions) {
    return (
      <StyledRoute
        positions={route.waypoints}
        color={route.color}
        weight={route.weight}
        opacity={route.opacity}
        dashed
      />
    )
  }

  return (
    <StyledRoute
      positions={positions}
      color={route.color}
      weight={route.weight}
      opacity={route.opacity}
    />
  )
}
