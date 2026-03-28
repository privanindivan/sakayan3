import React from 'react'
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { linearTiming, springTiming, TransitionSeries } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { wipe } from '@remotion/transitions/wipe'
import { flip } from '@remotion/transitions/flip'
import { useAudioData, visualizeAudio } from '@remotion/media-utils'
import { SceneHookV2 } from '../scenes/SceneHookV2'
import { SceneIntro } from '../scenes/SceneIntro'
import { SceneProblemV2 } from '../scenes/SceneProblemV2'
import { SceneSolutionV2 } from '../scenes/SceneSolutionV2'
import { SceneGreenDotsV2 } from '../scenes/SceneGreenDotsV2'
import { SceneCommunityV2 } from '../scenes/SceneCommunityV2'
import { SceneCTAV2 } from '../scenes/SceneCTAV2'

// Snappy spring timing for TikTok-feel transitions
const SNAP = springTiming({ config: { damping: 26, stiffness: 200 }, durationRestThreshold: 0.001 })
const SMOOTH = springTiming({ config: { damping: 32, stiffness: 140 }, durationRestThreshold: 0.001 })

// Transition duration in frames
const T = 22

function AudioBar() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const audioData = useAudioData(staticFile('music.mp3'))
  if (!audioData) return null

  const bars = visualizeAudio({ fps, frame, audioData, numberOfSamples: 64, smoothing: true })
  const W = 1080
  const barW = W / bars.length

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={W} height={52} style={{ position: 'absolute', bottom: 0, left: 0, opacity: 0.45 }}>
        {bars.map((v, i) => {
          const h = Math.max(2, v * 44)
          const isLeft = i < bars.length / 2
          return (
            <rect
              key={i} x={i * barW + 1} y={52 - h}
              width={Math.max(1, barW - 2)} height={h}
              fill={isLeft ? 'rgba(232,52,42,0.9)' : 'rgba(255,255,255,0.85)'}
              rx={1}
            />
          )
        })}
      </svg>
    </AbsoluteFill>
  )
}

export default function TikTokPromo() {
  return (
    <AbsoluteFill style={{ background: '#080808' }}>
      <Audio src={staticFile('music.mp3')} volume={0.7} />

      <TransitionSeries>

        {/* Scene 1: Hook — dark, punchy */}
        <TransitionSeries.Sequence durationInFrames={60 + T}>
          <SceneHookV2 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={SNAP}
        />

        {/* Scene 2: Intro — red bg, logo */}
        <TransitionSeries.Sequence durationInFrames={90 + T}>
          <SceneIntro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-left' })}
          timing={SNAP}
        />

        {/* Scene 3: Problem — map bg, kinetic text */}
        <TransitionSeries.Sequence durationInFrames={180 + T}>
          <SceneProblemV2 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: 'from-left' })}
          timing={SMOOTH}
        />

        {/* Scene 4: Solution — pins map, "We built it" */}
        <TransitionSeries.Sequence durationInFrames={150 + T}>
          <SceneSolutionV2 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-bottom' })}
          timing={SNAP}
        />

        {/* Scene 5: Green Dots — pulsing dots + panel */}
        <TransitionSeries.Sequence durationInFrames={210 + T}>
          <SceneGreenDotsV2 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={flip({ direction: 'from-left' })}
          timing={SMOOTH}
        />

        {/* Scene 6: Community — connections map, word by word */}
        <TransitionSeries.Sequence durationInFrames={150 + T}>
          <SceneCommunityV2 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={SMOOTH}
        />

        {/* Scene 7: CTA — logo + URL + link in bio */}
        <TransitionSeries.Sequence durationInFrames={300}>
          <SceneCTAV2 />
        </TransitionSeries.Sequence>

      </TransitionSeries>

      <AudioBar />
    </AbsoluteFill>
  )
}
