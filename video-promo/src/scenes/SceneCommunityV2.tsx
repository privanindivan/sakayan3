import React from 'react'
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { WordReveal } from '../utils/WordReveal'

export function SceneCommunityV2() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const imgOp = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' })
  const imgScale = interpolate(frame, [0, 180], [1.05, 1], { extrapolateRight: 'clamp' })

  // "map-connections" screenshot — shows the routing lines
  // Hero stat: animated counter
  const statStart = 15
  const statSc = spring({ frame: Math.max(0, frame - statStart), fps, from: 0.4, to: 1, config: { damping: 14, stiffness: 130 } })
  const statOp = interpolate(frame, [statStart, statStart + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // Word by word main line
  const wordStart = statStart + 28

  // "Help us fix the map." CTA
  const ctaStart = wordStart + 6 * 8 + 10  // after ~6 words
  const ctaSc = spring({ frame: Math.max(0, frame - ctaStart), fps, from: 0.6, to: 1, config: { damping: 14, stiffness: 150 } })
  const ctaOp = interpolate(frame, [ctaStart, ctaStart + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // Pulsing CTA button
  const ctaPulse = 1 + Math.sin(frame * 0.1) * 0.025

  return (
    <AbsoluteFill>
      {/* Map connections screenshot */}
      <AbsoluteFill style={{ opacity: imgOp, transform: `scale(${imgScale})`, transformOrigin: 'center top' }}>
        <Img
          src={staticFile('screenshots/map-connections.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
        />
      </AbsoluteFill>

      {/* Bottom gradient */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, transparent 20%, rgba(0,0,0,0.45) 55%, rgba(8,8,8,0.88) 100%)',
      }} />

      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end',
        paddingBottom: 120, padding: '0 56px 120px',
        gap: 28,
      }}>

        {/* Word by word main copy */}
        <WordReveal
          text="Every terminal you add helps a commuter find their way."
          startFrame={wordStart}
          stagger={7}
          effect="slide-up"
          style={{ maxWidth: 900 }}
          wordStyle={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 900,
            fontSize: 58, color: '#fff', lineHeight: 1.25,
            textShadow: '0 3px 18px rgba(0,0,0,0.7)',
          }}
        />

        {/* "Help us fix the map." CTA */}
        <div style={{
          opacity: ctaOp,
          transform: `scale(${ctaSc * ctaPulse})`,
        }}>
          <div style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 900,
            fontSize: 58, color: '#fff',
            background: '#E8342A',
            padding: '22px 56px', borderRadius: 20,
            boxShadow: '0 8px 36px rgba(232,52,42,0.5)',
            textAlign: 'center',
          }}>
            Help us fix the map. 🔧
          </div>
        </div>

      </AbsoluteFill>
    </AbsoluteFill>
  )
}
