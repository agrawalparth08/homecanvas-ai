import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';

const USER_MSG = 'Add a sofa to the lounge';

/** Assistant chat mock: type → proposal card → Apply → applied. */
export const AIScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const typed = USER_MSG.slice(0, Math.floor(interpolate(frame, [16, 88], [0, USER_MSG.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })));
  const cardIn = spring({ frame: frame - 108, fps, config: { damping: 16, stiffness: 110 } });
  const applyClick = interpolate(frame, [196, 212], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const applied = frame >= 218;
  const appliedIn = spring({ frame: frame - 218, fps, config: { damping: 14, stiffness: 130 } });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ width: 920, background: C.bgPanel, border: `1px solid ${C.panelBorder}`, borderRadius: 20, padding: 36, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: C.textDim, marginBottom: 26, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: C.green, display: 'inline-block' }} />
          Assistant · works offline
        </div>

        {/* user bubble (typing) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <div style={{ maxWidth: 560, background: C.accent, color: '#fff', fontSize: 26, fontWeight: 500, padding: '16px 24px', borderRadius: '18px 18px 4px 18px' }}>
            {typed}
            {typed.length < USER_MSG.length && <span style={{ opacity: frame % 16 < 8 ? 1 : 0 }}>|</span>}
          </div>
        </div>

        {/* proposal card */}
        {frame >= 108 && !applied && (
          <div
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${C.panelBorder}`,
              borderRadius: 16,
              padding: 26,
              transform: `translateY(${(1 - cardIn) * 36}px)`,
              opacity: cardIn,
            }}
          >
            <div style={{ fontSize: 25, fontWeight: 700, color: C.text }}>Proposal — place sofa in Lounge</div>
            <div style={{ fontSize: 21, color: C.textDim, marginTop: 8 }}>
              3-seat fabric sofa · faces the TV wall · clearance checked, no collisions
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 22 }}>
              <Btn>Preview</Btn>
              <Btn primary pressed={applyClick > 0 && applyClick < 1}>
                Apply
              </Btn>
              <Btn>Reject</Btn>
            </div>
          </div>
        )}

        {/* applied state */}
        {applied && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: 'rgba(91,214,160,0.1)',
              border: `1px solid rgba(91,214,160,0.45)`,
              borderRadius: 16,
              padding: '22px 26px',
              transform: `scale(${0.94 + appliedIn * 0.06})`,
              opacity: appliedIn,
            }}
          >
            <span style={{ fontSize: 30, color: C.green }}>✓</span>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>Applied — sofa placed in Lounge</div>
              <div style={{ fontSize: 20, color: C.textDim, marginTop: 4 }}>Validated edit · undo anytime with ⌘Z</div>
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

const Btn: React.FC<{ primary?: boolean; pressed?: boolean; children: React.ReactNode }> = ({ primary, pressed, children }) => (
  <div
    style={{
      padding: '12px 26px',
      borderRadius: 10,
      fontSize: 21,
      fontWeight: 600,
      background: primary ? C.accent : 'rgba(255,255,255,0.07)',
      color: primary ? '#fff' : C.text,
      transform: pressed ? 'scale(0.92)' : 'scale(1)',
    }}
  >
    {children}
  </div>
);
