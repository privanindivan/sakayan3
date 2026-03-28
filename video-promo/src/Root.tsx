import React from 'react';
import { Composition } from 'remotion';
import MainPromo from './compositions/MainPromo';
import TikTokPromo from './compositions/TikTokPromo';

export const Root: React.FC = () => (
  <>
    <Composition
      id="MainPromo"
      component={MainPromo}
      durationInFrames={1050}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="TikTokPromo"
      component={TikTokPromo}
      durationInFrames={1008}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
