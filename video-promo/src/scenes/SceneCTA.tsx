import React from 'react'
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

export function SceneCTA() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const bgScale = interpolate(frame, [0, 240], [1.06, 1], { extrapolateRight: 'clamp' })

  const logoScale = spring({ frame, fps, from: 0, to: 1, config: { damping: 14, stiffness: 60 } })
  const logoOp = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' })

  const line1Y = interpolate(frame, [20, 48], [50, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const line1Op = interpolate(frame, [20, 48], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const urlScale = spring({ frame: Math.max(0, frame - 65), fps, from: 0.6, to: 1, config: { damping: 12, stiffness: 70 } })
  const urlOp = interpolate(frame, [65, 88], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const btnOp = interpolate(frame, [100, 120], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const btnPulse = 1 + Math.sin(frame * 0.08) * 0.03

  return (
    <AbsoluteFill>
      {/* Map background */}
      <AbsoluteFill style={{ transform: `scale(${bgScale})`, transformOrigin: 'center' }}>
        <Img src={staticFile('screenshots/map-wide.png')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>

      {/* Light red gradient overlay at bottom — NOT a full black cover */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.38) 40%, rgba(20,5,5,0.72) 70%, rgba(30,5,5,0.88) 100%)',
      }} />

      {/* Content */}
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end',
        paddingBottom: 160, gap: 44,
      }}>
        {/* Logo */}
        <div style={{ transform: `scale(${logoScale})`, opacity: logoOp, borderRadius: 24, overflow: 'hidden', marginBottom: 8 }}>
          <Img src={staticFile('logo.png')} width={140} height={140} style={{ display: 'block' }} />
        </div>

        {/* Main line */}
        <div style={{
          transform: `translateY(${line1Y}px)`,
          opacity: line1Op,
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 900,
          fontSize: 72,
          color: '#fff',
          textAlign: 'center',
          lineHeight: 1.15,
          textShadow: '0 3px 18px rgba(0,0,0,0.6)',
          padding: '0 56px',
        }}>
          Let's fix our transport.
        </div>

        {/* URL — the hero element */}
        <div style={{ transform: `scale(${urlScale})`, opacity: urlOp }}>
          <div style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 900,
            fontSize: 72,
            color: '#fff',
            textAlign: 'center',
            background: '#E8342A',
            padding: '22px 64px',
            borderRadius: 20,
            letterSpacing: '-0.5px',
            boxShadow: '0 8px 32px rgba(232,52,42,0.45)',
          }}>
            sakayan.netlify.app
          </div>
        </div>

      </AbsoluteFill>
    </AbsoluteFill>
  )
}
