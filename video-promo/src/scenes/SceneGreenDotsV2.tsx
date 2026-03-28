import React from 'react'
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { WordReveal } from '../utils/WordReveal'

// Animated pulsing green dot SVG
function PulsingDot({ cx, cy, delay, size = 18 }: { cx: number; cy: number; delay: number; size?: number }) {
  const frame = useCurrentFrame()
  const pulse = Math.sin((frame + delay) * 0.12) * 0.35 + 0.65
  const ringPulse = Math.sin((frame + delay) * 0.1) * 0.5 + 0.5
  const ringScale = 1 + ringPulse * 0.6

  return (
    <g>
      {/* Pulse ring */}
      <circle
        cx={cx} cy={cy} r={size * ringScale}
        fill="none" stroke="#22C55E"
        strokeWidth={2} opacity={0.4 * (1 - ringPulse * 0.5)}
      />
      {/* Core dot */}
      <circle cx={cx} cy={cy} r={size} fill="#22C55E" opacity={pulse} />
      <circle cx={cx} cy={cy} r={size * 0.5} fill="#86EFAC" opacity={0.9} />
    </g>
  )
}

export function SceneGreenDotsV2() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const bgScale = interpolate(frame, [0, 210], [1.06, 1], { extrapolateRight: 'clamp' })

  // Line 1: emoji + "Green dots = real street photos"
  const l1Op = interpolate(frame, [8, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const l1Y = interpolate(frame, [8, 28], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // Line 2: word by word
  const l2Start = 40

  // Panel slides up from bottom
  const panelStart = 110
  const panelY = interpolate(frame, [panelStart, panelStart + 35], [500, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })
  const panelOp = interpolate(frame, [panelStart, panelStart + 25], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  // Overlay badge for panel
  const badgeStart = panelStart + 40
  const badgeSc = spring({ frame: Math.max(0, frame - badgeStart), fps, from: 0.5, to: 1, config: { damping: 14, stiffness: 150 } })
  const badgeOp = interpolate(frame, [badgeStart, badgeStart + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // Animated dots scatter (decorative overlay)
  const dotsOp = interpolate(frame, [0, 20], [0, 0.85], { extrapolateRight: 'clamp' })

  const DOT_POSITIONS = [
    { cx: 180, cy: 320, delay: 0 },
    { cx: 420, cy: 480, delay: 15 },
    { cx: 680, cy: 260, delay: 30 },
    { cx: 860, cy: 420, delay: 8 },
    { cx: 300, cy: 700, delay: 22 },
    { cx: 760, cy: 600, delay: 40 },
    { cx: 540, cy: 380, delay: 12 },
    { cx: 140, cy: 560, delay: 35 },
  ]

  return (
    <AbsoluteFill>
      {/* Map background */}
      <AbsoluteFill style={{ transform: `scale(${bgScale})`, transformOrigin: 'center' }}>
        <Img
          src={staticFile('screenshots/map-streetview.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>

      {/* Very light overlay */}
      <AbsoluteFill style={{ background: 'rgba(0,0,0,0.2)' }} />

      {/* Animated SVG dots overlay */}
      <AbsoluteFill style={{ opacity: dotsOp, pointerEvents: 'none' }}>
        <svg width={1080} height={1920} style={{ position: 'absolute', top: 0, left: 0 }}>
          {DOT_POSITIONS.map((d, i) => (
            <PulsingDot key={i} {...d} size={i % 2 === 0 ? 16 : 20} />
          ))}
        </svg>
      </AbsoluteFill>

      {/* Top text area */}
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-start',
        paddingTop: 110,
      }}>

        {/* Line 1 */}
        <div style={{
          opacity: l1Op, transform: `translateY(${l1Y}px)`,
          fontFamily: 'Montserrat, sans-serif', fontWeight: 900,
          fontSize: 62, color: '#22C55E',
          textAlign: 'center', padding: '0 60px',
          textShadow: '0 3px 18px rgba(0,0,0,0.85), 0 0 40px rgba(34,197,94,0.4)',
          lineHeight: 1.2,
        }}>
          🟢 Real street-level photos
        </div>

        <div style={{ height: 28 }} />

        {/* Line 2 — word by word */}
        <WordReveal
          text="Tap any dot. See what the terminal looks like."
          startFrame={l2Start}
          stagger={6}
          effect="slide-up"
          style={{ padding: '0 60px', maxWidth: 900 }}
          wordStyle={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 800,
            fontSize: 52, color: '#fff',
            textShadow: '0 2px 14px rgba(0,0,0,0.85)',
          }}
        />

      </AbsoluteFill>

      {/* Street view panel slides up */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        transform: `translateY(${panelY}px)`,
        opacity: panelOp,
      }}>
        <Img
          src={staticFile('screenshots/streetview-panel.png')}
          style={{
            width: '100%', height: 520,
            objectFit: 'cover', objectPosition: 'top',
            borderRadius: '28px 28px 0 0',
          }}
        />
        {/* Glass overlay on panel */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 8, background: '#22C55E',
          borderRadius: '28px 28px 0 0',
        }} />
      </div>

      {/* Badge over panel */}
      <div style={{
        position: 'absolute', bottom: 520 - 40, left: '50%',
        transform: `translateX(-50%) scale(${badgeSc})`,
        opacity: badgeOp,
      }}>
        <div style={{
          fontFamily: 'Montserrat, sans-serif', fontWeight: 900,
          fontSize: 32, color: '#fff',
          background: 'rgba(34,197,94,0.95)',
          padding: '14px 40px', borderRadius: 40,
          boxShadow: '0 6px 28px rgba(34,197,94,0.5)',
          whiteSpace: 'nowrap',
        }}>
          Powered by Mapillary 📸
        </div>
      </div>

    </AbsoluteFill>
  )
}
