import React from 'react';
import { Composition } from 'remotion';
import { MainPromo } from './compositions/MainPromo';

export const Root: React.FC = () => (
  <>
    <Composition
      id="MainPromo"
      component={MainPromo}
      durationInFrames={1080}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
