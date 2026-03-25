import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { WHITE, RED } from '../lib/colors';
import { FONT } from '../lib/fonts';

export const Scene5Join: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleS = spring({ frame, fps, config: { damping: 13, stiffness: 140 } });
  const titleOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  const authY = interpolate(frame, [18, 50], [80, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const authOp = interpolate(frame, [18, 48], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const quoteOp = interpolate(frame, [65, 95], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const quoteY = interpolate(frame, [65, 95], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const stepOp = interpolate(frame, [95, 120], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#0A0A0A' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: RED }} />

      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 52px 60px' }}>

        {/* Title */}
        <div style={{ transform: `scale(${titleS})`, opacity: titleOp, textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 52, fontWeight: 900, color: WHITE, fontFamily: FONT, lineHeight: 1.15 }}>
            Sumali na sa{'\n'}
            <span style={{ color: RED }}>Sakayan</span>
          </div>
        </div>

        {/* Auth modal screenshot */}
        <div style={{ transform: `translateY(${authY}px)`, opacity: authOp, width: '100%', borderRadius: 24, overflow: 'hidden', boxShadow: '0 12px 60px rgba(0,0,0,0.6)', marginBottom: 36 }}>
          <Img
            src={staticFile('screenshots/auth-modal.png')}
            style={{ width: '100%', height: 360, objectFit: 'cover', objectPosition: 'center top' }}
          />
        </div>

        {/* Quote */}
        <div style={{ transform: `translateY(${quoteY}px)`, opacity: quoteOp, textAlign: 'center', marginBottom: 32, padding: '0 12px' }}>
          <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.85)', fontFamily: FONT, fontWeight: 400, lineHeight: 1.55, fontStyle: 'italic' }}>
            "Every terminal you add helps a commuter find their way home."
          </div>
        </div>

        {/* Quick steps */}
        <div style={{ opacity: stepOp, display: 'flex', flexDirection: 'row', gap: 16, width: '100%' }}>
          {[['1.', 'Register'], ['2.', 'Find a terminal'], ['3.', 'Add it']].map(([num, label]) => (
            <div key={num} style={{ flex: 1, background: 'rgba(232,52,42,0.15)', borderRadius: 16, padding: '16px 10px', textAlign: 'center', border: '1px solid rgba(232,52,42,0.4)' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: RED, fontFamily: FONT }}>{num}</div>
              <div style={{ fontSize: 20, color: WHITE, fontFamily: FONT, fontWeight: 700, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
