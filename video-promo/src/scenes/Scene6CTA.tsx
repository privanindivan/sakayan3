import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { RED, WHITE } from '../lib/colors';
import { FONT } from '../lib/fonts';

export const Scene6CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bgScale = interpolate(frame, [0, 150], [1.0, 1.1], { extrapolateRight: 'clamp' });

  const logoS = spring({ frame, fps, config: { damping: 14, stiffness: 150 } });
  const logoOp = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });

  const mottoOp = interpolate(frame, [18, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const mottoY = interpolate(frame, [18, 45], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const urlS = spring({ frame: frame - 50, fps, config: { damping: 12, stiffness: 170 } });
  const urlOp = interpolate(frame, [50, 75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const pulse = 1 + Math.sin((frame / 30) * Math.PI * 1.4) * 0.04;
  const btnOp = interpolate(frame, [75, 98], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const tagOp = interpolate(frame, [100, 122], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img
          src={staticFile('screenshots/map-wide.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${bgScale})`, filter: 'brightness(0.3) saturate(0.5)' }}
        />
      </AbsoluteFill>

      {/* Red gradient — bottom 60% */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.2) 35%, rgba(232,52,42,0.92) 65%, #E8342A 100%)' }} />

      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: '0 56px 100px' }}>

        {/* S logo */}
        <div style={{ transform: `scale(${logoS})`, opacity: logoOp, marginBottom: 28 }}>
          <div style={{ width: 110, height: 110, borderRadius: 26, background: 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
            <span style={{ fontSize: 76, fontWeight: 900, color: WHITE, fontFamily: FONT, lineHeight: 1 }}>S</span>
          </div>
        </div>

        {/* Motto */}
        <div style={{ transform: `translateY(${mottoY}px)`, opacity: mottoOp, textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 44, fontWeight: 900, color: WHITE, fontFamily: FONT, lineHeight: 1.2, letterSpacing: -1 }}>
            Let's fix our{'\n'}transportation.
          </div>
        </div>

        {/* SAKAYAN sub */}
        <div style={{ opacity: mottoOp, textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.82)', fontFamily: FONT, fontWeight: 400 }}>
            Together. One terminal at a time.
          </div>
        </div>

        {/* URL */}
        <div style={{ transform: `scale(${urlS})`, opacity: urlOp, background: 'rgba(0,0,0,0.3)', borderRadius: 50, padding: '12px 36px', border: '2px solid rgba(255,255,255,0.4)', marginBottom: 28 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: WHITE, fontFamily: FONT, letterSpacing: 0.5 }}>
            🌐 sakayan.netlify.app
          </span>
        </div>

        {/* CTA button */}
        <div style={{ transform: `scale(${pulse})`, opacity: btnOp, marginBottom: 28 }}>
          <div style={{ background: WHITE, borderRadius: 18, padding: '18px 60px', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: RED, fontFamily: FONT }}>
              Be a contributor →
            </span>
          </div>
        </div>

        {/* Filipino tag */}
        <div style={{ opacity: tagOp }}>
          <span style={{ fontSize: 22, color: 'rgba(255,255,255,0.75)', fontFamily: FONT, fontWeight: 400 }}>
            🇵🇭 Para sa mga Pilipino
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
