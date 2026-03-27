import React from 'react'
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'

export function SceneGreenDots() {
  const frame = useCurrentFrame()

  const bgScale = interpolate(frame, [0, 210], [1.05, 1], { extrapolateRight: 'clamp' })

  const label1Y = interpolate(frame, [10, 35], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const label1Op = interpolate(frame, [10, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const label2Y = interpolate(frame, [45, 70], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const label2Op = interpolate(frame, [45, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const panelY = interpolate(frame, [100, 135], [300, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const panelOp = interpolate(frame, [100, 135], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const TEXT: React.CSSProperties = {
    fontFamily: 'Montserrat, sans-serif',
    fontWeight: 800,
    fontSize: 58,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 1.2,
    textShadow: '0 2px 12px rgba(0,0,0,0.8)',
    padding: '0 60px',
  }

  return (
    <AbsoluteFill>
      {/* Green dots map background — full screen */}
      <AbsoluteFill style={{ transform: `scale(${bgScale})`, transformOrigin: 'center' }}>
        <Img
          src={staticFile('screenshots/map-streetview.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* Very light overlay — let the green shine */}
      <AbsoluteFill style={{ background: 'rgba(0,0,0,0.22)' }} />

      {/* Top labels */}
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 120 }}>
        <div style={{ transform: `translateY(${label1Y}px)`, opacity: label1Op, ...TEXT }}>
          🟢 Green dots = real street photos
        </div>

        <div style={{ height: 36 }} />

        <div style={{ transform: `translateY(${label2Y}px)`, opacity: label2Op, ...TEXT }}>
          Tap any dot to see what the terminal looks like from the street
        </div>
      </AbsoluteFill>

      {/* Street view panel slides up from bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        transform: `translateY(${panelY}px)`,
        opacity: panelOp,
      }}>
        <Img
          src={staticFile('screenshots/streetview-panel.png')}
          style={{ width: '100%', height: 480, objectFit: 'cover', objectPosition: 'bottom', borderRadius: '24px 24px 0 0' }}
        />
      </div>
    </AbsoluteFill>
  )
}
