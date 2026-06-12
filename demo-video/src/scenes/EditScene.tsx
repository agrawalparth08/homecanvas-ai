import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, CARD, FONT } from '../theme';
import { Cursor } from '../components/Cursor';
import { WarnIcon } from '../components/Icons';

const SWATCHES = ['#b08968', '#8d99ae', '#d8c3a5', '#5e6472', '#9c6644'];
const PACKS = ['Indian Modern', 'Rajasthani Heritage', 'Fusion Japandi', 'Warm Minimal'];
const PACK_FLOORS = ['#b08968', '#9c4a3c', '#d8c3a5', '#cfc8bd'];

/** Room mock + control rail: materials → style packs → stairs → pillar dialog. */
export const EditScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const swatchClick = interpolate(frame, [62, 78], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const packIdx = Math.min(PACKS.length - 1, Math.max(0, Math.floor((frame - 105) / 28)));
  const packsActive = frame >= 105 && frame < 225;
  const stairTurn = interpolate(frame, [228, 268], [0, 90], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dialogIn = spring({ frame: frame - 302, fps, config: { damping: 15, stiffness: 130 } });
  const showDialog = frame >= 302 && frame < 372;
  const pillarGone = frame >= 372;

  const floorColor = frame < 78 ? '#8a7a68' : frame < 133 ? SWATCHES[0]! : PACK_FLOORS[packIdx]!;

  const cx = interpolate(frame, [20, 60, 110, 150, 230, 300, 330], [700, 1232, 1310, 1310, 1335, 1110, 1110], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cy = interpolate(frame, [20, 60, 110, 150, 230, 300, 330], [430, 330, 330, 470, 660, 625, 625], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const dialogClick = interpolate(frame, [344, 360], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const card: React.CSSProperties = { ...CARD, padding: '20px 24px' };
  const cardTitle: React.CSSProperties = { fontSize: 21, fontWeight: 600, color: C.inkDim, marginBottom: 14 };

  return (
    <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 40, padding: 80, fontFamily: FONT }}>
      {/* the room being edited */}
      <div style={{ ...card, width: 880, height: 660, position: 'relative', overflow: 'hidden' }}>
        <div style={{ ...cardTitle }}>LIVING — 21.4 m²</div>
        <div style={{ position: 'absolute', left: 40, top: 90, width: 790, height: 480, background: floorColor, borderRadius: 10 }} />
        <div style={{ position: 'absolute', left: 40, top: 64, width: 790, height: 30, background: '#ece7db', borderRadius: 6, border: `1px solid ${C.panelBorder}` }} />
        {/* sofa glyph — grounded contact shadow + cushions + a lit top bevel */}
        <div style={{ position: 'absolute', left: 150, top: 414, width: 250, height: 26, borderRadius: '50%', background: 'rgba(27,29,36,0.22)', filter: 'blur(10px)' }} />
        <div style={{ position: 'absolute', left: 130, top: 300, width: 270, height: 120, background: 'linear-gradient(180deg, #434b68 0%, #353b52 100%)', borderRadius: 18, boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.12)' }}>
          <div style={{ position: 'absolute', left: 12, top: -22, width: 246, height: 36, background: 'linear-gradient(180deg, #4d5778 0%, #404a66 100%)', borderRadius: 12, boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.12)' }} />
          {[0, 1].map((k) => (
            <div key={k} style={{ position: 'absolute', top: 16, left: 16 + k * 122, width: 110, height: 80, borderRadius: 12, background: '#3b4360', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -3px 8px rgba(0,0,0,0.18)' }} />
          ))}
        </div>
        {/* stair glyph */}
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
                top: i * 34,
                left: i * 3,
                width: 150 - i * 6,
                height: 30,
                background: 'linear-gradient(180deg, #cdb79a 0%, #b89a76 100%)',
                borderRadius: 4,
                boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.4), 0 3px 6px -2px rgba(27,29,36,0.3)',
              }}
            />
          ))}
        </div>
        {/* structural pillar */}
        {!pillarGone && (
          <svg style={{ position: 'absolute', left: 470, top: 440 }} width={64} height={64}>
            <rect x={4} y={4} width={56} height={56} fill="rgba(194,67,143,0.14)" stroke={C.magenta} strokeWidth={3} />
            <line x1={4} y1={4} x2={60} y2={60} stroke={C.magenta} strokeWidth={3} />
            <line x1={4} y1={60} x2={60} y2={4} stroke={C.magenta} strokeWidth={3} />
          </svg>
        )}
        {pillarGone && (
          <div style={{ position: 'absolute', left: 380, top: 452, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, background: '#ffffff', border: `1px solid ${C.panelBorder}`, boxShadow: '0 10px 26px -10px rgba(27,29,36,0.18)', color: C.ink, fontSize: 19, fontWeight: 600 }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            Pillar removed
            <span style={{ color: C.inkFaint, fontWeight: 500 }}>· ⌘Z to undo</span>
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
                  border: i === 0 && frame >= 70 ? `4px solid ${C.accent}` : `2px solid ${C.panelBorder}`,
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
                  padding: '10px 18px',
                  borderRadius: 10,
                  fontSize: 21,
                  fontWeight: 600,
                  background: packsActive && i === packIdx ? C.accent : C.panel,
                  color: packsActive && i === packIdx ? '#fff' : C.inkDim,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, color: C.ink, fontSize: 22 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 44px)', gap: 6 }}>
              <span />
              <DPad dir="up" />
              <span />
              <DPad dir="left" />
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 6, height: 6, borderRadius: 3, background: C.inkFaint }} /></span>
              <DPad dir="right" />
              <span />
              <DPad dir="down" />
              <span />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Rot active={frame >= 228 && frame <= 272} ccw>90°</Rot>
              <Rot active={false}>90°</Rot>
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
            background: 'rgba(27,29,36,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: Math.min(1, dialogIn * 1.2),
          }}
        >
          <div
            style={{
              width: 600,
              background: C.panel,
              border: `1px solid ${C.panelBorder}`,
              borderRadius: 14,
              padding: 32,
              transform: `scale(${0.94 + dialogIn * 0.06})`,
              boxShadow: '0 24px 60px -16px rgba(27,29,36,0.28)',
            }}
          >
            <div style={{ display: 'flex', gap: 18 }}>
              <div style={{ width: 52, height: 52, flexShrink: 0, borderRadius: '50%', background: 'rgba(194,69,63,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <WarnIcon size={30} color={C.rose} />
              </div>
              <div>
                <div style={{ fontSize: 25, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>Delete structural pillar?</div>
                <div style={{ fontSize: 19, color: C.inkDim, marginTop: 9, lineHeight: 1.5 }}>
                  This is marked as a load-bearing column. Removing a real pillar can make the building unstable.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 26 }}>
              <div style={{ padding: '11px 20px', borderRadius: 10, background: C.panel, border: `1px solid ${C.panelBorder}`, color: C.ink, fontSize: 19, fontWeight: 600 }}>
                Cancel
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '11px 20px',
                  borderRadius: 10,
                  background: C.rose,
                  color: '#ffffff',
                  fontSize: 19,
                  fontWeight: 700,
                  boxShadow: '0 8px 20px -6px rgba(194,69,63,0.5)',
                  transform: dialogClick > 0 && dialogClick < 1 ? 'scale(0.93)' : 'scale(1)',
                }}
              >
                <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" /></svg>
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

const CHEV: Record<string, string> = { up: 'm6 14 6-6 6 6', down: 'm6 10 6 6 6-6', left: 'm14 6-6 6 6 6', right: 'm10 6 6 6-6 6' };
const DPad: React.FC<{ dir: 'up' | 'down' | 'left' | 'right' }> = ({ dir }) => (
  <div style={{ width: 44, height: 44, borderRadius: 8, background: C.panel, border: `1px solid ${C.panelBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.inkDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={CHEV[dir]} /></svg>
  </div>
);

const Rot: React.FC<{ active: boolean; ccw?: boolean; children: React.ReactNode }> = ({ active, ccw, children }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '9px 14px',
      borderRadius: 8,
      background: active ? C.accent : C.panel,
      border: `1px solid ${active ? C.accent : C.panelBorder}`,
      color: active ? '#fff' : C.ink,
      fontSize: 18,
      fontWeight: 600,
    }}
  >
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={active ? '#fff' : C.inkDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {ccw ? <path d="M4 9a8 8 0 1 1-1 5M4 9V4M4 9h5" /> : <path d="M20 9a8 8 0 1 0 1 5M20 9V4M20 9h-5" />}
    </svg>
    {children}
  </div>
);
