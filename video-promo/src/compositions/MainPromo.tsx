import React from 'react';
import { AbsoluteFill, Audio, staticFile } from 'remotion';
import { TransitionSeries, springTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { Scene0Intro } from '../scenes/Scene0Intro';
import { Scene1Problem } from '../scenes/Scene1Problem';
import { Scene2HowToHelp } from '../scenes/Scene2HowToHelp';
import { Scene3WhatYouDo } from '../scenes/Scene3WhatYouDo';
import { Scene4StreetView } from '../scenes/Scene4StreetView';
import { Scene5Join } from '../scenes/Scene5Join';
import { Scene6CTA } from '../scenes/Scene6CTA';
import { BLACK } from '../lib/colors';

// Scene durations: 90+240+180+180+210+150+150 = 1200
// 6 transitions × 20 frames = 120 overlap
// Total: 1200 - 120 = 1080 frames @ 30fps = 36s
const TRANSITION = springTiming({ config: { damping: 200 }, durationInFrames: 20 });
const TRANS = slide({ direction: 'from-bottom' });

export const MainPromo: React.FC = () => (
  <AbsoluteFill style={{ background: BLACK }}>
    {/* Background music — place music.mp3 in public/ */}
    <Audio src={staticFile('music.mp3')} volume={0.7} />

    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={90}>
        <Scene0Intro />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={TRANS} timing={TRANSITION} />

      <TransitionSeries.Sequence durationInFrames={240}>
        <Scene1Problem />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={TRANS} timing={TRANSITION} />

      <TransitionSeries.Sequence durationInFrames={180}>
        <Scene2HowToHelp />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={TRANS} timing={TRANSITION} />

      <TransitionSeries.Sequence durationInFrames={180}>
        <Scene3WhatYouDo />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={TRANS} timing={TRANSITION} />

      <TransitionSeries.Sequence durationInFrames={210}>
        <Scene4StreetView />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={TRANS} timing={TRANSITION} />

      <TransitionSeries.Sequence durationInFrames={150}>
        <Scene5Join />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition presentation={TRANS} timing={TRANSITION} />

      <TransitionSeries.Sequence durationInFrames={150}>
        <Scene6CTA />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
