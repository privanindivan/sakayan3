import React from 'react'
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'

export function SceneCommunity() {
  const frame = useCurrentFrame()

  const imgOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' })
  const imgScale = interpolate(frame, [0, 150], [1.04, 1], { extrapolateRight: 'clamp' })

  const cardY = interpolate(frame, [15, 45], [60, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const cardOp = interpolate(frame, [15, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill>
      {/* Full screenshot background */}
      <AbsoluteFill style={{ opacity: imgOp, transform: `scale(${imgScale})`, transformOrigin: 'center top' }}>
        <Img
          src={staticFile('screenshots/modal-info.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
        />
      </AbsoluteFill>

      {/* Bottom gradient for text readability — not a solid black cover */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.78) 100%)',
      }} />

      {/* Text at bottom */}
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end',
        paddingBottom: 140, padding: '0 60px 140px',
      }}>
        <div style={{
          transform: `translateY(${cardY}px)`,
          opacity: cardOp,
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 900,
            fontSize: 62,
            color: '#fff',
            lineHeight: 1.25,
            marginBottom: 24,
            textShadow: '0 3px 16px rgba(0,0,0,0.6)',
          }}>
            Every terminal you edit/add helps a commuter find their way.
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
