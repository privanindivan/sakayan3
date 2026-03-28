import React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

interface WordRevealProps {
  text: string
  startFrame?: number
  stagger?: number
  style?: React.CSSProperties
  wordStyle?: React.CSSProperties
  effect?: 'slide-up' | 'slam' | 'fade'
  justify?: 'center' | 'flex-start' | 'flex-end'
  lineHeight?: number
}

export function WordReveal({
  text,
  startFrame = 0,
  stagger = 7,
  style,
  wordStyle,
  effect = 'slide-up',
  justify = 'center',
  lineHeight = 1.3,
}: WordRevealProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const words = text.split(' ')

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: `0 16px`, justifyContent: justify, lineHeight, ...style }}>
      {words.map((word, i) => {
        const wf = startFrame + i * stagger
        const elapsed = Math.max(0, frame - wf)
        const opacity = interpolate(frame, [wf, wf + 10], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
        let transform = ''

        if (effect === 'slide-up') {
          const y = interpolate(frame, [wf, wf + 16], [32, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
          transform = `translateY(${y}px)`
        } else if (effect === 'slam') {
          const sc = spring({
            frame: elapsed,
            fps,
            from: 1.8,
            to: 1,
            config: { damping: 24, stiffness: 320, mass: 0.7 },
          })
          transform = `scale(${sc})`
        }

        return (
          <span key={i} style={{ display: 'inline-block', opacity, transform, ...wordStyle }}>
            {word}
          </span>
        )
      })}
    </div>
  )
}
