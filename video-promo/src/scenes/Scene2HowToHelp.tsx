import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { WHITE, RED } from '../lib/colors';
import { FONT } from '../lib/fonts';

export const Scene2HowToHelp: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mapY = interpolate(frame, [0, 25], [60, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const mapOp = interpolate(frame, [0, 22], [0, 1], { extrapolateRight: 'clamp' });

  const headS = spring({ frame: frame - 15, fps, config: { damping: 12, stiffness: 150 } });
  const headOp = interpolate(frame, [15, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const sub1Op = interpolate(frame, [45, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sub1Y = interpolate(frame, [45, 70], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const sub2Op = interpolate(frame, [75, 100], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sub2Y = interpolate(frame, [75, 100], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const pulseOp = interpolate(frame, [100, 130], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pulse = 1 + Math.sin((frame / 30) * Math.PI * 1.5) * 0.03;

  return (
    <AbsoluteFill style={{ background: '#0D0D0D' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: RED }} />

      {/* Map screenshot */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '48%', transform: `translateY(${mapY}px)`, opacity: mapOp, overflow: 'hidden' }}>
        <Img
          src={staticFile('screenshots/map-zoomed-pins.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
        />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, background: 'linear-gradient(transparent, #0D0D0D)' }} />
      </div>

      {/* Text content */}
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 52px 100px' }}>

        <div style={{ transform: `scale(${headS})`, opacity: headOp, marginBottom: 28 }}>
          <div style={{ fontSize: 50, fontWeight: 900, color: WHITE, fontFamily: FONT, lineHeight: 1.15 }}>
            We need your{' '}
            <span style={{ color: RED }}>help.</span>
          </div>
        </div>

        <div style={{ transform: `translateY(${sub1Y}px)`, opacity: sub1Op, marginBottom: 18 }}>
          <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.82)', fontFamily: FONT, fontWeight: 400, lineHeight: 1.5 }}>
            Sakayan only works if people like you add and verify the terminals in your area.
          </div>
        </div>

        <div style={{ transform: `translateY(${sub2Y}px)`, opacity: sub2Op, marginBottom: 44 }}>
          <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.82)', fontFamily: FONT, fontWeight: 400, lineHeight: 1.5 }}>
            No one knows your local routes better than you do.
          </div>
        </div>

        <div style={{ transform: `scale(${pulse})`, opacity: pulseOp, alignSelf: 'flex-start' }}>
          <div style={{ background: RED, borderRadius: 18, padding: '18px 44px', boxShadow: '0 6px 30px rgba(232,52,42,0.5)' }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: WHITE, fontFamily: FONT }}>Mag-contribute ka! 🇵🇭</span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
