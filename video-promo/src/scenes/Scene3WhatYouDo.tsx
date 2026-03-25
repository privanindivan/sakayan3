import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { RED, WHITE } from '../lib/colors';
import { FONT } from '../lib/fonts';

const Action: React.FC<{ emoji: string; title: string; desc: string; delay: number; frame: number; fps: number }> = ({ emoji, title, desc, delay, frame, fps }) => {
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 170 } });
  const op = interpolate(frame - delay, [0, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ transform: `translateY(${interpolate(s, [0, 1], [28, 0])}px) scale(${s})`, opacity: op, display: 'flex', alignItems: 'center', gap: 20, background: 'rgba(255,255,255,0.07)', borderRadius: 20, padding: '22px 28px', marginBottom: 18, border: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ fontSize: 44, flexShrink: 0 }}>{emoji}</div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: WHITE, fontFamily: FONT, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.7)', fontFamily: FONT, fontWeight: 400, lineHeight: 1.4 }}>{desc}</div>
      </div>
    </div>
  );
};

export const Scene3WhatYouDo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleS = spring({ frame, fps, config: { damping: 13, stiffness: 130 } });
  const titleOp = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });

  const modalOp = interpolate(frame, [12, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const modalY = interpolate(frame, [12, 35], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#111' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: RED }} />

      {/* Top: modal screenshot */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '36%', transform: `translateY(${modalY}px)`, opacity: modalOp, overflow: 'hidden' }}>
        <Img
          src={staticFile('screenshots/modal-info.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
        />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, background: 'linear-gradient(transparent, #111)' }} />
      </div>

      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 48px 60px' }}>
        <div style={{ transform: `scale(${titleS})`, opacity: titleOp, marginBottom: 28 }}>
          <div style={{ fontSize: 42, fontWeight: 900, color: WHITE, fontFamily: FONT, lineHeight: 1.15 }}>
            What you can do:
          </div>
        </div>

        <Action emoji="📍" title="Add terminals"      desc="Pin a jeep or bus stop near you"             delay={18}  frame={frame} fps={fps} />
        <Action emoji="✅" title="Verify accuracy"    desc="Vote on terminals others have added"          delay={40}  frame={frame} fps={fps} />
        <Action emoji="💬" title="Leave comments"     desc="Share info, corrections, fare updates"        delay={62}  frame={frame} fps={fps} />
        <Action emoji="📷" title="Upload street view" desc="Take a photo of the terminal entrance"        delay={84}  frame={frame} fps={fps} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
