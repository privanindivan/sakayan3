import React from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

export function SceneHookV2() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Opening red flash
  const flashOp = interpolate(frame, [0, 2, 8], [1, 0.4, 0], { extrapolateRight: 'clamp' })

  // "MILLIONS" slams in
  const sc1 = spring({ frame: Math.max(0, frame - 3), fps, from: 2.0, to: 1, config: { damping: 20, stiffness: 280, mass: 0.7 } })
  const op1 = interpolate(frame, [3, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // "RIDE" slams in
  const sc2 = spring({ frame: Math.max(0, frame - 12), fps, from: 2.0, to: 1, config: { damping: 20, stiffness: 280, mass: 0.7 } })
  const op2 = interpolate(frame, [12, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // "JEEPNEYS" — huge red slam
  const sc3 = spring({ frame: Math.max(0, frame - 22), fps, from: 2.4, to: 1, config: { damping: 22, stiffness: 300, mass: 0.8 } })
  const op3 = interpolate(frame, [22, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const glow3 = interpolate(frame, [22, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // Sub line slides up
  const subY = interpolate(frame, [36, 52], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const subOp = interpolate(frame, [36, 52], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // Scanline bar decoration
  const barW = interpolate(frame, [28, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ background: '#080808', overflow: 'hidden' }}>

      {/* Opening red flash */}
      <AbsoluteFill style={{ background: '#E8342A', opacity: flashOp, pointerEvents: 'none' }} />

      {/* Subtle grid lines — cinematic texture */}
      <AbsoluteFill style={{ pointerEvents: 'none', opacity: 0.04 }}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute', top: i * 96, left: 0, right: 0,
            height: 1, background: '#fff',
          }} />
        ))}
      </AbsoluteFill>

      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 12,
      }}>

        {/* MILLIONS */}
        <div style={{
          opacity: op1, transform: `scale(${sc1})`,
          fontFamily: 'Montserrat, sans-serif', fontWeight: 900,
          fontSize: 88, color: '#ffffff',
          letterSpacing: '-2px', lineHeight: 1,
        }}>
          MILLIONS
        </div>

        {/* RIDE */}
        <div style={{
          opacity: op2, transform: `scale(${sc2})`,
          fontFamily: 'Montserrat, sans-serif', fontWeight: 900,
          fontSize: 88, color: '#ffffff',
          letterSpacing: '-2px', lineHeight: 1, marginTop: -8,
        }}>
          RIDE
        </div>

        {/* Red divider bar */}
        <div style={{
          width: `${barW * 340}px`, height: 6,
          background: '#E8342A', borderRadius: 3,
          marginTop: 8, marginBottom: 8,
          boxShadow: `0 0 ${24 * glow3}px rgba(232,52,42,0.8)`,
        }} />

        {/* JEEPNEYS — the hero word */}
        <div style={{
          opacity: op3, transform: `scale(${sc3})`,
          fontFamily: 'Montserrat, sans-serif', fontWeight: 900,
          fontSize: 128, color: '#E8342A',
          letterSpacing: '-3px', lineHeight: 1,
          textShadow: `0 0 ${60 * glow3}px rgba(232,52,42,0.6), 0 4px 32px rgba(0,0,0,0.5)`,
        }}>
          JEEPNEYS 🚌
        </div>

        {/* Sub line */}
        <div style={{
          opacity: subOp, transform: `translateY(${subY}px)`,
          fontFamily: 'Montserrat, sans-serif', fontWeight: 600,
          fontSize: 38, color: 'rgba(255,255,255,0.65)',
          textAlign: 'center', padding: '0 80px',
          marginTop: 20,
        }}>
          ...with no map of terminals or stops.
        </div>

      </AbsoluteFill>
    </AbsoluteFill>
  )
}
