import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, CARD, FONT } from '../theme';
import { BuildingsIcon, CompassIcon, HouseIcon, SofaIcon } from '../components/Icons';

const PERSONAS = [
  { Icon: HouseIcon, title: 'Homeowners & buyers', sub: 'See your space before you commit to it' },
  { Icon: CompassIcon, title: 'Architects', sub: 'Present ideas clients can actually feel' },
  { Icon: SofaIcon, title: 'Interior designers', sub: 'Iterate styles and variants in minutes' },
  { Icon: BuildingsIcon, title: 'Developers', sub: 'Let buyers walk through, before it exists' },
];

/** Who it's for: four persona cards with a cycling highlight. */
export const AudienceScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleIn = spring({ frame: frame - 4, fps, config: { damping: 15 } });
  const active = Math.min(
    PERSONAS.length - 1,
    Math.max(0, Math.floor(((frame - 80) / (durationInFrames - 110)) * PERSONAS.length)),
  );

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 58, fontWeight: 800, color: C.ink, opacity: titleIn, transform: `translateY(${(1 - titleIn) * 30}px)`, marginBottom: 54 }}>
          Built for <span style={{ color: C.accent }}>everyone</span> who shapes homes
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 580px)', gap: 26 }}>
          {PERSONAS.map((p, i) => {
            const t = spring({ frame: frame - 18 - i * 14, fps, config: { damping: 14, stiffness: 120 } });
            const hot = frame > 80 && i === active;
            return (
              <div
                key={p.title}
                style={{
                  ...CARD,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 24,
                  textAlign: 'left',
                  padding: '26px 30px',
                  background: hot ? '#f4f4fe' : C.panel,
                  border: `2px solid ${hot ? C.accent : C.panelBorder}`,
                  transform: `translateY(${(1 - t) * 60}px) scale(${hot ? 1.03 : 1})`,
                  opacity: t,
                  boxShadow: hot ? '0 24px 60px rgba(75,70,229,0.22)' : (CARD.boxShadow as string),
                }}
              >
                <div
                  style={{
                    width: 86,
                    height: 86,
                    borderRadius: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: hot ? C.accent : C.accentSoft,
                    flexShrink: 0,
                  }}
                >
                  <p.Icon size={52} color={hot ? '#ffffff' : C.accent} />
                </div>
                <div>
                  <div style={{ fontSize: 31, fontWeight: 700, color: C.ink }}>{p.title}</div>
                  <div style={{ fontSize: 22, color: C.inkDim, marginTop: 6 }}>{p.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
