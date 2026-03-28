import React from 'react'
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { WordReveal } from '../utils/WordReveal'

export function SceneSolutionV2() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const bgScale = interpolate(frame, [0, 150], [1.05, 1], { extrapolateRight: 'clamp' })

  // "We built it." slams in
  const builtSc = spring({ frame: Math.max(0, frame - 5), fps, from: 0.5, to: 1, config: { damping: 14, stiffness: 160 } })
  const builtOp = interpolate(frame, [5, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // Subtitle word by word
  const subStart = 32

  // Pill badge "crowdsourced" bounces in
  const pillStart = subStart + 7 * 5  // after "We're building the first" (5 words)
  const pillSc = spring({ frame: Math.max(0, frame - pillStart), fps, from: 0.3, to: 1, config: { damping: 12, stiffness: 140 } })
  const pillOp = interpolate(frame, [pillStart, pillStart + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // "transport map." line
  const tmStart = pillStart + 18
  const tmOp = interpolate(frame, [tmStart, tmStart + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const tmY = interpolate(frame, [tmStart, tmStart + 18], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // Pin pulse animation
  const pinPulse = 1 + Math.sin(frame * 0.15) * 0.06

  return (
    <AbsoluteFill>
      {/* Map with pins background */}
      <AbsoluteFill style={{ transform: `scale(${bgScale})`, transformOrigin: 'center' }}>
        <Img
          src={staticFile('screenshots/map-zoomed-pins.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* Gradient overlay — top heavy so pins show at bottom */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.5) 100%)',
      }} />

      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 32, padding: '0 60px',
      }}>

        {/* "We built it." — punchy headline */}
        <div style={{
          opacity: builtOp, transform: `scale(${builtSc})`,
          fontFamily: 'Montserrat, sans-serif', fontWeight: 900,
          fontSize: 96, color: '#fff', textAlign: 'center',
          textShadow: '0 4px 24px rgba(0,0,0,0.7)',
          lineHeight: 1,
        }}>
          We built it. ✅
        </div>

        {/* "We're building the first" */}
        <WordReveal
          text="The first"
          startFrame={subStart}
          stagger={8}
          effect="slide-up"
          wordStyle={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 800,
            fontSize: 60, color: 'rgba(255,255,255,0.9)',
            textShadow: '0 2px 16px rgba(0,0,0,0.7)',
          }}
        />

        {/* "crowdsourced" pill badge — hero word */}
        <div style={{ opacity: pillOp, transform: `scale(${pillSc} * ${pinPulse})` }}>
          <div style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 900,
            fontSize: 72, color: '#fff',
            background: '#E8342A',
            padding: '20px 56px', borderRadius: 20,
            boxShadow: '0 8px 40px rgba(232,52,42,0.55)',
            letterSpacing: '-1px',
            transform: `scale(${pinPulse})`,
          }}>
            crowdsourced
          </div>
        </div>

        {/* "transport map. 🗺️" */}
        <div style={{
          opacity: tmOp, transform: `translateY(${tmY}px)`,
          fontFamily: 'Montserrat, sans-serif', fontWeight: 800,
          fontSize: 60, color: 'rgba(255,255,255,0.9)',
          textShadow: '0 2px 16px rgba(0,0,0,0.7)',
          textAlign: 'center',
        }}>
          transport map. 🗺️
        </div>

      </AbsoluteFill>
    </AbsoluteFill>
  )
}
