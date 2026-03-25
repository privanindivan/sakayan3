import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { WHITE, RED } from '../lib/colors';
import { FONT } from '../lib/fonts';

export const Scene1Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const zoom = interpolate(frame, [0, 240], [1.0, 1.18], { extrapolateRight: 'clamp' });

  const line1S = spring({ frame, fps, config: { damping: 14, stiffness: 140 } });
  const line1Op = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });

  const line2Y = interpolate(frame, [22, 50], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const line2Op = interpolate(frame, [22, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const line3Y = interpolate(frame, [50, 80], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const line3Op = interpolate(frame, [50, 80], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const answerOp = interpolate(frame, [120, 160], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const answerS = spring({ frame: frame - 120, fps, config: { damping: 10, stiffness: 180 } });

  return (
    <AbsoluteFill>
      {/* Map background */}
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img
          src={staticFile('screenshots/map-wide.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', transform: `scale(${zoom})`, filter: 'brightness(0.35) saturate(0.5)' }}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 52px' }}>

        {/* Problem statement */}
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ transform: `scale(${line1S})`, opacity: line1Op, fontSize: 44, fontWeight: 900, color: WHITE, fontFamily: FONT, lineHeight: 1.2, marginBottom: 24 }}>
            Millions of Filipinos ride jeepneys and buses every day...
          </div>

          <div style={{ transform: `translateY(${line2Y}px)`, opacity: line2Op, fontSize: 36, color: 'rgba(255,255,255,0.85)', fontFamily: FONT, fontWeight: 400, lineHeight: 1.4, marginBottom: 20 }}>
            ...with no unified map of terminals, routes, or stops.
          </div>

          <div style={{ transform: `translateY(${line3Y}px)`, opacity: line3Op, fontSize: 32, color: 'rgba(255,255,255,0.7)', fontFamily: FONT, fontWeight: 400, lineHeight: 1.4 }}>
            No official database. No app. Nothing.
          </div>
        </div>

        {/* Answer */}
        <div style={{ transform: `scale(${answerS})`, opacity: answerOp, textAlign: 'center', background: RED, borderRadius: 28, padding: '28px 44px', boxShadow: '0 8px 50px rgba(232,52,42,0.5)' }}>
          <div style={{ fontSize: 38, fontWeight: 900, color: WHITE, fontFamily: FONT, lineHeight: 1.2 }}>
            Sakayan is changing that.
          </div>
          <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.85)', fontFamily: FONT, fontWeight: 400, marginTop: 10 }}>
            Built by the community, for Filipinos.
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
