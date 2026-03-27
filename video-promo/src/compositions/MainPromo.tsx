import React from 'react'
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { linearTiming, TransitionSeries } from '@remotion/transitions'
import { slide } from '@remotion/transitions/slide'
import { useAudioData, visualizeAudio } from '@remotion/media-utils'
import { SceneIntro } from '../scenes/SceneIntro'
import { SceneProblem } from '../scenes/SceneProblem'
import { SceneSolution } from '../scenes/SceneSolution'
import { SceneCommunity } from '../scenes/SceneCommunity'
import { SceneGreenDots } from '../scenes/SceneGreenDots'
import { SceneCTA } from '../scenes/SceneCTA'

const TRANSITION = 18

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
      <svg width={W} height={44} style={{ position: 'absolute', bottom: 0, left: 0, opacity: 0.5 }}>
        {bars.map((v, i) => {
          const h = Math.max(2, v * 40)
          return (
            <rect key={i} x={i * barW + 1} y={44 - h} width={Math.max(1, barW - 2)} height={h}
              fill="rgba(255,255,255,0.9)" rx={1} />
          )
        })}
      </svg>
    </AbsoluteFill>
  )
}

export default function MainPromo() {
  return (
    <AbsoluteFill style={{ background: '#0a0a0a' }}>
      <Audio src={staticFile('music.mp3')} volume={0.65} />

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={90 + TRANSITION}>
          <SceneIntro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-bottom' })}
          timing={linearTiming({ durationInFrames: TRANSITION })}
        />

        <TransitionSeries.Sequence durationInFrames={180 + TRANSITION}>
          <SceneProblem />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-bottom' })}
          timing={linearTiming({ durationInFrames: TRANSITION })}
        />

        <TransitionSeries.Sequence durationInFrames={180 + TRANSITION}>
          <SceneSolution />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-bottom' })}
          timing={linearTiming({ durationInFrames: TRANSITION })}
        />

        <TransitionSeries.Sequence durationInFrames={150 + TRANSITION}>
          <SceneCommunity />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-bottom' })}
          timing={linearTiming({ durationInFrames: TRANSITION })}
        />

        <TransitionSeries.Sequence durationInFrames={210 + TRANSITION}>
          <SceneGreenDots />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: 'from-bottom' })}
          timing={linearTiming({ durationInFrames: TRANSITION })}
        />

        <TransitionSeries.Sequence durationInFrames={240}>
          <SceneCTA />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <AudioBar />
    </AbsoluteFill>
  )
}
