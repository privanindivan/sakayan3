import React from 'react'
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { WordReveal } from '../utils/WordReveal'

export function SceneProblemV2() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Ken Burns — slow zoom out
  const bgScale = interpolate(frame, [0, 180], [1.08, 1], { extrapolateRight: 'clamp' })
  const bgX = interpolate(frame, [0, 180], [-30, 0], { extrapolateRight: 'clamp' })

  // Line 1: word by word reveal
  const line1Done = 8 + 8 * 7  // ~64 frames for full "No official terminal map exists in the Philippines."
  // Done by ~64

  // Line 2: slides up after line 1
  const line2Start = 70
  const line2Op = interpolate(frame, [line2Start, line2Start + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const line2Y = interpolate(frame, [line2Start, line2Start + 18], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // Red "Nothing" box slams in
  const boxStart = 95
  const boxSc = spring({ frame: Math.max(0, frame - boxStart), fps, from: 0.6, to: 1, config: { damping: 16, stiffness: 180 } })
  const boxOp = interpolate(frame, [boxStart, boxStart + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // "Until now." dramatic entrance
  const untilStart = 145
  const untilSc = spring({ frame: Math.max(0, frame - untilStart), fps, from: 0.4, to: 1, config: { damping: 14, stiffness: 120 } })
  const untilOp = interpolate(frame, [untilStart, untilStart + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // Fade out earlier elements when "Until now." appears
  const earlyFade = interpolate(frame, [untilStart - 8, untilStart], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const TEXT: React.CSSProperties = {
    fontFamily: 'Montserrat, sans-serif',
    fontWeight: 800,
    fontSize: 58,
    color: '#fff',
    textAlign: 'center' as const,
    textShadow: '0 3px 20px rgba(0,0,0,0.8)',
    padding: '0 64px',
  }

  return (
    <AbsoluteFill>
      {/* Map background with pan + Ken Burns */}
      <AbsoluteFill style={{
        transform: `scale(${bgScale}) translateX(${bgX}px)`,
        transformOrigin: 'center center',
      }}>
        <Img src={staticFile('screenshots/map-wide.png')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>

      {/* Dark overlay */}
      <AbsoluteFill style={{ background: 'rgba(0,0,0,0.45)' }} />

      {/* Content */}
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 36, opacity: earlyFade }}>

        {/* Line 1 — word by word */}
        <WordReveal
          text="No official terminal map exists."
          startFrame={8}
          stagger={8}
          effect="slide-up"
          style={{ padding: '0 64px', maxWidth: 900 }}
          wordStyle={{ ...TEXT, padding: 0 }}
        />

        {/* Line 2 */}
        <div style={{ opacity: line2Op, transform: `translateY(${line2Y}px)`, ...TEXT, fontSize: 52 }}>
          No live database. No route guide.
        </div>

        {/* Red nothing box */}
        <div style={{ opacity: boxOp, transform: `scale(${boxSc})` }}>
          <div style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 900, fontSize: 64, color: '#fff',
            background: '#E8342A',
            padding: '28px 60px', borderRadius: 20,
            textAlign: 'center', lineHeight: 1.2,
            boxShadow: '0 12px 48px rgba(232,52,42,0.5)',
          }}>
            Nothing. 🚫
          </div>
        </div>
      </AbsoluteFill>

      {/* "Until now." — replaces everything */}
      <AbsoluteFill style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: untilOp, transform: `scale(${untilSc})`,
        pointerEvents: 'none',
      }}>
        <div style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 900, fontSize: 100, color: '#fff',
          textAlign: 'center',
          textShadow: '0 4px 32px rgba(0,0,0,0.7)',
        }}>
          Until now.
        </div>
      </AbsoluteFill>

    </AbsoluteFill>
  )
}
