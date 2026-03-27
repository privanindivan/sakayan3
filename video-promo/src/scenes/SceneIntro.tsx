import React from 'react'
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

export function SceneIntro() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const bgOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' })

  const logoScale = spring({ frame, fps, from: 0.3, to: 1, config: { damping: 12, stiffness: 80 } })
  const logoOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })

  const titleY = interpolate(frame, [18, 40], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const titleOpacity = interpolate(frame, [18, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const subY = interpolate(frame, [30, 52], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const subOpacity = interpolate(frame, [30, 52], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ background: '#E8342A', opacity: bgOpacity }}>
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 32,
      }}>
        {/* Logo */}
        <div style={{
          transform: `scale(${logoScale})`,
          opacity: logoOpacity,
          borderRadius: 32,
          overflow: 'hidden',
          boxShadow: '0 12px 48px rgba(0,0,0,0.35)',
        }}>
          <Img src={staticFile('logo.png')} width={220} height={220} style={{ display: 'block' }} />
        </div>

        {/* App name */}
        <div style={{
          transform: `translateY(${titleY}px)`,
          opacity: titleOpacity,
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 900,
            fontSize: 96,
            color: '#fff',
            letterSpacing: '-2px',
            lineHeight: 1,
          }}>
            SAKAYAN
          </div>
        </div>

        {/* Tagline */}
        <div style={{
          transform: `translateY(${subY}px)`,
          opacity: subOpacity,
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700,
            fontSize: 36,
            color: 'rgba(255,255,255,0.9)',
            letterSpacing: '0.5px',
          }}>
            Philippine Crowdsourced Transport Map
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
