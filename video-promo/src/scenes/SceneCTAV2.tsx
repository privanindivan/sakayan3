import React from 'react'
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

export function SceneCTAV2() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const bgScale = interpolate(frame, [0, 300], [1.07, 1], { extrapolateRight: 'clamp' })

  // Logo spring bounce
  const logoSc = spring({ frame: Math.max(0, frame - 5), fps, from: 0, to: 1, config: { damping: 13, stiffness: 100 } })
  const logoOp = interpolate(frame, [5, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // "Let's fix our transport." word slam
  const w1 = spring({ frame: Math.max(0, frame - 28), fps, from: 1.5, to: 1, config: { damping: 20, stiffness: 260, mass: 0.7 } })
  const op1 = interpolate(frame, [28, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const w2 = spring({ frame: Math.max(0, frame - 38), fps, from: 1.5, to: 1, config: { damping: 20, stiffness: 260, mass: 0.7 } })
  const op2 = interpolate(frame, [38, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const w3 = spring({ frame: Math.max(0, frame - 48), fps, from: 1.5, to: 1, config: { damping: 20, stiffness: 260, mass: 0.7 } })
  const op3 = interpolate(frame, [48, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // URL pill — hero element
  const urlStart = 75
  const urlSc = spring({ frame: Math.max(0, frame - urlStart), fps, from: 0.5, to: 1, config: { damping: 13, stiffness: 130 } })
  const urlOp = interpolate(frame, [urlStart, urlStart + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const urlPulse = 1 + Math.sin(frame * 0.09) * 0.03
  const urlGlow = interpolate(frame, [urlStart, urlStart + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // "Link in bio 👆" — TikTok native
  const linkStart = 110
  const linkOp = interpolate(frame, [linkStart, linkStart + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const linkY = interpolate(frame, [linkStart, linkStart + 20], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // Tagline fade in
  const tagStart = 140
  const tagOp = interpolate(frame, [tagStart, tagStart + 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  // Red vignette pulse for energy
  const vignetteOp = interpolate(frame, [0, 30], [0.5, 0.12], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill>
      {/* Map background */}
      <AbsoluteFill style={{ transform: `scale(${bgScale})`, transformOrigin: 'center' }}>
        <Img src={staticFile('screenshots/map-wide.png')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>

      {/* Dark gradient overlay */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.45) 35%, rgba(12,4,4,0.78) 65%, rgba(18,4,4,0.92) 100%)',
      }} />

      {/* Red radial vignette */}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(232,52,42,0.15) 100%)',
        opacity: vignetteOp,
        pointerEvents: 'none',
      }} />

      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end',
        paddingBottom: 140, gap: 32,
      }}>

        {/* Logo */}
        <div style={{
          transform: `scale(${logoSc})`, opacity: logoOp,
          borderRadius: 28, overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          marginBottom: 8,
        }}>
          <Img src={staticFile('logo.png')} width={130} height={130} style={{ display: 'block' }} />
        </div>

        {/* "Let's fix our transport." — word by word slam */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'center', padding: '0 56px' }}>
          <span style={{
            opacity: op1, transform: `scale(${w1})`, display: 'inline-block',
            fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 72, color: '#fff',
            textShadow: '0 3px 20px rgba(0,0,0,0.7)', lineHeight: 1.15,
          }}>Let's</span>
          <span style={{
            opacity: op2, transform: `scale(${w2})`, display: 'inline-block',
            fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 72, color: '#fff',
            textShadow: '0 3px 20px rgba(0,0,0,0.7)', lineHeight: 1.15,
          }}>fix our</span>
          <span style={{
            opacity: op3, transform: `scale(${w3})`, display: 'inline-block',
            fontFamily: 'Montserrat, sans-serif', fontWeight: 900, fontSize: 72, color: '#E8342A',
            textShadow: '0 3px 20px rgba(232,52,42,0.4)', lineHeight: 1.15,
          }}>transport.</span>
        </div>

        {/* URL — hero pill */}
        <div style={{
          transform: `scale(${urlSc * urlPulse})`,
          opacity: urlOp,
        }}>
          <div style={{
            fontFamily: 'Montserrat, sans-serif', fontWeight: 900,
            fontSize: 68, color: '#fff',
            background: '#E8342A',
            padding: '22px 64px', borderRadius: 22,
            boxShadow: `0 8px 32px rgba(232,52,42,0.45), 0 0 ${60 * urlGlow}px rgba(232,52,42,0.3)`,
            letterSpacing: '-0.5px', textAlign: 'center',
          }}>
            sakayan.netlify.app
          </div>
        </div>

        {/* "Link in bio 👆" — TikTok-native nudge */}
        <div style={{
          opacity: linkOp, transform: `translateY(${linkY}px)`,
          fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
          fontSize: 38, color: 'rgba(255,255,255,0.75)',
          textAlign: 'center', letterSpacing: '0.5px',
        }}>
          Link in bio 👆
        </div>

        {/* Tagline */}
        <div style={{
          opacity: tagOp,
          fontFamily: 'Montserrat, sans-serif', fontWeight: 500,
          fontSize: 28, color: 'rgba(255,255,255,0.45)',
          textAlign: 'center', letterSpacing: '1px',
        }}>
          Philippine Crowdsourced Transport Map
        </div>

      </AbsoluteFill>
    </AbsoluteFill>
  )
}
