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
  const [positions, setPositions] = useState(route.waypoints)

  useEffect(() => {
    const coords = route.waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)

    fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { signal: controller.signal }
    )
      .then(r => r.json())
      .then(data => {
        const geom = data.routes?.[0]?.geometry?.coordinates
        if (geom) setPositions(geom.map(([lng, lat]) => [lat, lng]))
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer))
  }, [route.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <StyledRoute
      positions={positions}
      color={route.color}
      weight={route.weight}
      opacity={route.opacity}
    />
  )
}
