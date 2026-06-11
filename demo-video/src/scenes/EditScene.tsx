import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';
import { Cursor } from '../components/Cursor';

const SWATCHES = ['#b08968', '#8d99ae', '#d8c3a5', '#5e6472', '#9c6644'];
const PACKS = ['Indian Modern', 'Rajasthani Heritage', 'Fusion Japandi', 'Warm Minimal'];
const PACK_FLOORS = ['#b08968', '#9c4a3c', '#d8c3a5', '#cfc8bd'];

/** Room mock + control rail: materials → style packs → stairs → pillar dialog. */
export const EditScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // phase 1 (0–110): cursor picks a floor swatch
  const swatchClick = interpolate(frame, [62, 78], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // phase 2 (105–215): style packs cycle
  const packIdx = Math.min(PACKS.length - 1, Math.max(0, Math.floor((frame - 105) / 28)));
  const packsActive = frame >= 105 && frame < 225;
  // phase 3 (215–300): stair rotates 90°
  const stairTurn = interpolate(frame, [228, 268], [0, 90], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // phase 4 (300+): pillar confirm dialog
  const dialogIn = spring({ frame: frame - 302, fps, config: { damping: 15, stiffness: 130 } });
  const showDialog = frame >= 302 && frame < 372;
  const pillarGone = frame >= 372;

  const floorColor = frame < 78 ? '#7a6a58' : frame < 133 ? SWATCHES[0]! : PACK_FLOORS[packIdx]!;

  // cursor path: swatch row → pack chips → stair card → dialog confirm
  const cx = interpolate(frame, [20, 60, 110, 150, 230, 300, 330], [700, 1232, 1310, 1310, 1335, 1110, 1110], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cy = interpolate(frame, [20, 60, 110, 150, 230, 300, 330], [430, 330, 330, 470, 660, 625, 625], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const dialogClick = interpolate(frame, [344, 360], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const card: React.CSSProperties = {
    background: C.bgPanel,
    border: `1px solid ${C.panelBorder}`,
    borderRadius: 16,
    padding: '20px 24px',
  };
  const cardTitle: React.CSSProperties = { fontSize: 21, fontWeight: 600, color: C.textDim, marginBottom: 14 };

  return (
    <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 40, padding: 80, fontFamily: FONT }}>
      {/* the room being edited */}
      <div style={{ ...card, width: 880, height: 660, position: 'relative', overflow: 'hidden' }}>
        <div style={{ ...cardTitle }}>LIVING — 21.4 m²</div>
        {/* floor */}
        <div style={{ position: 'absolute', left: 40, top: 90, width: 790, height: 480, background: floorColor, borderRadius: 10, opacity: 0.92 }} />
        {/* back wall strip */}
        <div style={{ position: 'absolute', left: 40, top: 64, width: 790, height: 30, background: '#e8e3d9', borderRadius: 6 }} />
        {/* sofa glyph */}
        <div style={{ position: 'absolute', left: 130, top: 300, width: 270, height: 120, background: '#34384a', borderRadius: 18, border: '3px solid #555c75' }}>
          <div style={{ position: 'absolute', left: 12, top: -22, width: 240, height: 34, background: '#3e4358', borderRadius: 12 }} />
        </div>
        {/* stair glyph (rotates in phase 3) */}
        <div
          style={{
            position: 'absolute',
            right: 130,
            top: 170,
            width: 150,
            height: 220,
            transform: `rotate(${stairTurn}deg)`,
            transformOrigin: '50% 50%',
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: i * 36,
                left: 0,
                width: 150,
                height: 30,
                background: `rgba(91,214,160,${0.25 + i * 0.1})`,
                border: `2px solid ${C.green}`,
                borderRadius: 4,
              }}
            />
          ))}
        </div>
        {/* structural pillar (deleted in phase 4) */}
        {!pillarGone && (
          <svg style={{ position: 'absolute', left: 470, top: 440 }} width={64} height={64}>
            <rect x={4} y={4} width={56} height={56} fill="rgba(214,71,158,0.2)" stroke={C.magenta} strokeWidth={3} />
            <line x1={4} y1={4} x2={60} y2={60} stroke={C.magenta} strokeWidth={3} />
            <line x1={4} y1={60} x2={60} y2={4} stroke={C.magenta} strokeWidth={3} />
          </svg>
        )}
        {pillarGone && (
          <div style={{ position: 'absolute', left: 410, top: 455, padding: '8px 16px', borderRadius: 10, background: 'rgba(19,20,27,0.85)', color: C.green, fontSize: 20, fontWeight: 600 }}>
            ✓ Pillar removed — ⌘Z to undo
          </div>
        )}
      </div>

      {/* control rail */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: 560 }}>
        <div style={card}>
          <div style={cardTitle}>Floor material</div>
          <div style={{ display: 'flex', gap: 16 }}>
            {SWATCHES.map((s, i) => (
              <div
                key={s}
                style={{
                  width: 74,
                  height: 74,
                  borderRadius: 12,
                  background: s,
                  border: i === 0 && frame >= 70 ? `4px solid ${C.gold}` : `2px solid ${C.panelBorder}`,
                  transform: i === 0 && swatchClick > 0 && swatchClick < 1 ? 'scale(0.9)' : 'scale(1)',
                }}
              />
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={cardTitle}>Style packs (12)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {PACKS.map((p, i) => (
              <div
                key={p}
                style={{
                  padding: '12px 20px',
                  borderRadius: 999,
                  fontSize: 22,
                  fontWeight: 600,
                  background: packsActive && i === packIdx ? C.accent : 'rgba(255,255,255,0.05)',
                  color: packsActive && i === packIdx ? '#fff' : C.textDim,
                  border: `1px solid ${packsActive && i === packIdx ? C.accent : C.panelBorder}`,
                }}
              >
                {p}
              </div>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={cardTitle}>Staircase</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, color: C.text, fontSize: 22 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 44px)', gap: 6 }}>
              <span />
              <DPad>▲</DPad>
              <span />
              <DPad>◄</DPad>
              <span style={{ textAlign: 'center', color: C.textFaint, lineHeight: '44px' }}>·</span>
              <DPad>►</DPad>
              <span />
              <DPad>▼</DPad>
              <span />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Rot active={frame >= 228 && frame <= 272}>⟲ 90°</Rot>
              <Rot active={false}>90° ⟳</Rot>
            </div>
          </div>
        </div>
      </div>

      {/* pillar confirm dialog */}
      {showDialog && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: Math.min(1, dialogIn * 1.2),
          }}
        >
          <div
            style={{
              width: 620,
              background: C.bgPanel,
              border: `1px solid ${C.panelBorder}`,
              borderRadius: 18,
              padding: 34,
              transform: `scale(${0.9 + dialogIn * 0.1})`,
              boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{ fontSize: 34, color: '#f2b84b' }}>⚠</span>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: C.text }}>Delete structural pillar?</div>
                <div style={{ fontSize: 21, color: C.textDim, marginTop: 10, lineHeight: 1.45 }}>
                  This is marked as a load-bearing column. Removing a real pillar can make the building unstable.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 26 }}>
              <div style={{ padding: '12px 22px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', color: C.text, fontSize: 21, fontWeight: 600 }}>
                Cancel
              </div>
              <div
                style={{
                  padding: '12px 22px',
                  borderRadius: 10,
                  background: '#8c2f39',
                  color: '#ffd9dd',
                  fontSize: 21,
                  fontWeight: 700,
                  transform: dialogClick > 0 && dialogClick < 1 ? 'scale(0.93)' : 'scale(1)',
                }}
              >
                Delete pillar
              </div>
            </div>
          </div>
        </div>
      )}

      <Cursor x={cx} y={cy} clickProgress={Math.max(swatchClick > 0 && swatchClick < 1 ? swatchClick : 0, dialogClick > 0 && dialogClick < 1 ? dialogClick : 0)} />
    </AbsoluteFill>
  );
};

const DPad: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      width: 44,
      height: 44,
      borderRadius: 8,
      background: 'rgba(255,255,255,0.07)',
      color: C.text,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 18,
    }}
  >
    {children}
  </div>
);

const Rot: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => (
  <div
    style={{
      padding: '10px 16px',
      borderRadius: 8,
      background: active ? C.accent : 'rgba(255,255,255,0.07)',
      color: active ? '#fff' : C.text,
      fontSize: 19,
      fontWeight: 600,
    }}
  >
    {children}
  </div>
);
