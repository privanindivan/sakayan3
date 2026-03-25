import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { RED, WHITE } from '../lib/colors';
import { FONT } from '../lib/fonts';

export const Scene0Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 130, mass: 0.8 } });
  const logoOp = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });

  const wordY = interpolate(frame, [18, 42], [50, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const wordOp = interpolate(frame, [18, 42], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const mottoOp = interpolate(frame, [42, 68], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const mottoY = interpolate(frame, [42, 68], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: RED, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {/* S logomark */}
      <div style={{ transform: `scale(${logoScale})`, opacity: logoOp, marginBottom: 40 }}>
        <div style={{
          width: 160, height: 160, borderRadius: 40, background: 'rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '4px solid rgba(255,255,255,0.5)',
          boxShadow: '0 12px 60px rgba(0,0,0,0.25)',
        }}>
          <span style={{ fontSize: 108, fontWeight: 900, color: WHITE, fontFamily: FONT, lineHeight: 1 }}>S</span>
        </div>
      </div>

      {/* SAKAYAN */}
      <div style={{ transform: `translateY(${wordY}px)`, opacity: wordOp, textAlign: 'center' }}>
        <div style={{ fontSize: 94, fontWeight: 900, color: WHITE, letterSpacing: -3, fontFamily: FONT, lineHeight: 1 }}>
          SAKAYAN
        </div>
        <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.8)', fontFamily: FONT, fontWeight: 400, letterSpacing: 6, textTransform: 'uppercase', marginTop: 10 }}>
          Philippines Transport Map
        </div>
      </div>

      {/* Motto */}
      <div style={{ transform: `translateY(${mottoY}px)`, opacity: mottoOp, marginTop: 52, textAlign: 'center' }}>
        <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.95)', fontFamily: FONT, fontWeight: 700, lineHeight: 1.35, padding: '0 40px' }}>
          "Let's fix our transportation."
        </div>
      </div>
    </AbsoluteFill>
  );
};
