import React from 'react'
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'

export function SceneProblem() {
  const frame = useCurrentFrame()

  const bgScale = interpolate(frame, [0, 180], [1.06, 1], { extrapolateRight: 'clamp' })

  const line1Y = interpolate(frame, [10, 35], [50, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const line1Op = interpolate(frame, [10, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const line2Y = interpolate(frame, [35, 60], [50, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const line2Op = interpolate(frame, [35, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const line3Y = interpolate(frame, [75, 100], [50, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const line3Op = interpolate(frame, [75, 100], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const TEXT: React.CSSProperties = {
    fontFamily: 'Montserrat, sans-serif',
    fontWeight: 800,
    fontSize: 62,
    color: '#fff',
    lineHeight: 1.2,
    textAlign: 'center',
    textShadow: '0 3px 16px rgba(0,0,0,0.7)',
    padding: '0 60px',
  }

  return (
    <AbsoluteFill>
      {/* Map background */}
      <AbsoluteFill style={{ transform: `scale(${bgScale})`, transformOrigin: 'center center' }}>
        <Img src={staticFile('screenshots/map-wide.png')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>

      {/* Overlay — just enough for text contrast */}
      <AbsoluteFill style={{ background: 'rgba(0,0,0,0.28)' }} />

      {/* Text block */}
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
        <div style={{ transform: `translateY(${line1Y}px)`, opacity: line1Op, ...TEXT }}>
          Millions ride jeepneys and buses every day
        </div>
        <div style={{ transform: `translateY(${line2Y}px)`, opacity: line2Op, ...TEXT }}>
          ...with no map of terminals or stops.
        </div>
        <div style={{
          transform: `translateY(${line3Y}px)`, opacity: line3Op,
          background: '#E8342A', borderRadius: 20, padding: '28px 56px',
        }}>
          <div style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 900, fontSize: 62, color: '#fff',
            textAlign: 'center', lineHeight: 1.2,
          }}>
            No live database.{'\n'}No live site. Nothing.
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
