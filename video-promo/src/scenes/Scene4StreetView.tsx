import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { WHITE, RED } from '../lib/colors';
import { FONT } from '../lib/fonts';

// A single grey dot that fades in with a pop, then pulses slowly
const GreyDot: React.FC<{ x: number; y: number; delay: number; frame: number; size?: number }> = ({ x, y, delay, frame, size = 14 }) => {
  const appear = spring({ frame: frame - delay, fps: 30, config: { damping: 8, stiffness: 300 } });
  const op = interpolate(frame - delay, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Subtle breathe pulse after appearing
  const breathe = interpolate(frame - delay, [0, 60], [1, 1], { extrapolateRight: 'clamp' });
  const slowPulse = op > 0.5 ? 1 + Math.sin((frame - delay) * 0.08) * 0.1 : 1;
  return (
    <div style={{
      position: 'absolute', left: x - size / 2, top: y - size / 2,
      width: size, height: size, borderRadius: '50%',
      background: '#AAAAAA',
      opacity: op * 0.9,
      transform: `scale(${appear * slowPulse})`,
      border: '2px solid rgba(255,255,255,0.7)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    }} />
  );
};

// Dots scattered across the map area, staggered appearance mimicking Mapillary loading
const DOTS = [
  // First wave (earliest)
  { x: 160, y: 340, d: 20 }, { x: 290, y: 310, d: 22 }, { x: 410, y: 355, d: 25 },
  { x: 540, y: 325, d: 24 }, { x: 660, y: 345, d: 27 }, { x: 780, y: 310, d: 26 },
  // Second wave
  { x: 200, y: 430, d: 35 }, { x: 330, y: 410, d: 38 }, { x: 460, y: 445, d: 33 },
  { x: 590, y: 415, d: 36 }, { x: 710, y: 440, d: 40 }, { x: 840, y: 420, d: 37 },
  // Third wave
  { x: 130, y: 510, d: 48 }, { x: 255, y: 490, d: 52 }, { x: 380, y: 525, d: 50 },
  { x: 505, y: 505, d: 55 }, { x: 625, y: 530, d: 53 }, { x: 745, y: 500, d: 58 },
  { x: 875, y: 515, d: 56 },
  // Fourth wave — fills in gaps
  { x: 220, y: 375, d: 65 }, { x: 350, y: 480, d: 68 }, { x: 470, y: 390, d: 62 },
  { x: 600, y: 475, d: 70 }, { x: 730, y: 385, d: 66 }, { x: 860, y: 460, d: 72 },
  // Late stragglers
  { x: 175, y: 560, d: 80 }, { x: 310, y: 545, d: 84 }, { x: 440, y: 575, d: 82 },
  { x: 565, y: 555, d: 88 }, { x: 690, y: 570, d: 86 }, { x: 815, y: 548, d: 90 },
];

export const Scene4StreetView: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mapZoom = interpolate(frame, [0, 80], [1.08, 1.5], { extrapolateRight: 'clamp' });

  const labelS = spring({ frame, fps, config: { damping: 12, stiffness: 140 } });
  const labelOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  const tipOp = interpolate(frame, [30, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tipY = interpolate(frame, [30, 55], [25, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Panel slides up from bottom after enough dots have appeared
  const panelY = interpolate(frame, [110, 150], [900, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const panelOp = interpolate(frame, [110, 148], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      {/* Map background, slowly zooming in */}
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img
          src={staticFile('screenshots/map-streetview.png')}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', transform: `scale(${mapZoom})`, transformOrigin: 'center 40%' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, transparent 30%, transparent 55%, rgba(0,0,0,0.8) 100%)' }} />
      </AbsoluteFill>

      {/* Grey dots loading in one by one */}
      <AbsoluteFill>
        {DOTS.map((dot, i) => (
          <GreyDot key={i} x={dot.x} y={dot.y} delay={dot.d} frame={frame} size={i % 4 === 0 ? 16 : 12} />
        ))}
      </AbsoluteFill>

      {/* Top label */}
      <AbsoluteFill style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 72 }}>
        <div style={{ transform: `scale(${labelS})`, opacity: labelOp, background: 'rgba(0,0,0,0.65)', borderRadius: 20, padding: '12px 32px', border: '1.5px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: WHITE, fontFamily: FONT }}>
            🔵 Grey dots = Mapillary photos
          </span>
        </div>
      </AbsoluteFill>

      {/* Tip below label */}
      <AbsoluteFill style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 146 }}>
        <div style={{ transform: `translateY(${tipY}px)`, opacity: tipOp, textAlign: 'center', padding: '0 52px' }}>
          <span style={{ fontSize: 24, color: 'rgba(255,255,255,0.8)', fontFamily: FONT, fontWeight: 400 }}>
            Tap any dot to see what the terminal actually looks like from the street
          </span>
        </div>
      </AbsoluteFill>

      {/* Street view panel slides up */}
      <AbsoluteFill style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ transform: `translateY(${panelY}px)`, opacity: panelOp, width: '100%' }}>
          <Img
            src={staticFile('screenshots/streetview-panel.png')}
            style={{ width: '100%', height: 680, objectFit: 'cover', objectPosition: 'center', borderRadius: '32px 32px 0 0', boxShadow: '0 -16px 80px rgba(0,0,0,0.6)' }}
          />
          <div style={{ position: 'absolute', top: 20, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <div style={{ background: RED, borderRadius: 12, padding: '8px 24px' }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: WHITE, fontFamily: FONT }}>📷 Street-level view</span>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
