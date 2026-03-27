import React from 'react'
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'

export function SceneSolution() {
  const frame = useCurrentFrame()

  const bgScale = interpolate(frame, [0, 180], [1.05, 1], { extrapolateRight: 'clamp' })

  const line1Y = interpolate(frame, [8, 32], [50, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const line1Op = interpolate(frame, [8, 32], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const line2Y = interpolate(frame, [30, 55], [50, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const line2Op = interpolate(frame, [30, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const TEXT: React.CSSProperties = {
    fontFamily: 'Montserrat, sans-serif',
    fontWeight: 800,
    fontSize: 62,
    color: '#fff',
    lineHeight: 1.25,
    textAlign: 'center',
    textShadow: '0 3px 16px rgba(0,0,0,0.7)',
    padding: '0 60px',
  }

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${bgScale})`, transformOrigin: 'center center' }}>
        <Img src={staticFile('screenshots/map-zoomed-pins.png')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>

      <AbsoluteFill style={{ background: 'rgba(0,0,0,0.25)' }} />

      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 44 }}>
        <div style={{ transform: `translateY(${line1Y}px)`, opacity: line1Op, ...TEXT }}>
          We're building the first crowdsourced transport map.
        </div>
        <div style={{ transform: `translateY(${line2Y}px)`, opacity: line2Op }}>
          <div style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 900,
            fontSize: 62,
            color: '#fff',
            textAlign: 'center',
            background: 'rgba(232,52,42,0.92)',
            padding: '24px 64px',
            borderRadius: 20,
          }}>
            Help us fix the map.
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
