import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT } from './theme';
import { DollHouse3D } from './components/DollHouse3D';
import { PLAN_H, PLAN_W, WALLS } from './plan';
import {
  ArrowRightIcon,
  BuildingsIcon,
  CameraIcon,
  CheckIcon,
  CloudOffIcon,
  CompassIcon,
  CursorIcon,
  HouseIcon,
  LaptopHomeIcon,
  PaletteIcon,
  SofaIcon,
} from './components/Icons';

const W = 1280;

const card: React.CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.panelBorder}`,
  borderRadius: 16,
  boxShadow: '0 16px 40px -18px rgba(27,29,36,0.14)',
};
const eyebrow: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  color: C.accent,
};
const sectionTitle: React.CSSProperties = { fontSize: 40, fontWeight: 700, color: C.ink, letterSpacing: -0.8 };

const Logo: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: size, fontWeight: 700, color: C.ink, letterSpacing: -0.4 }}>
    <span style={{ width: size * 1.5, height: size * 1.5, borderRadius: size * 0.42, background: C.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <HouseIcon size={size} color="#fff" />
    </span>
    HomeCanvas <span style={{ color: C.accent }}>AI</span>
  </span>
);

const EmailForm: React.FC<{ wide?: boolean }> = ({ wide }) => (
  <div style={{ display: 'flex', gap: 12, width: wide ? 560 : 520 }}>
    <div style={{ flex: 1, height: 60, display: 'flex', alignItems: 'center', padding: '0 20px', background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 14, color: C.inkFaint, fontSize: 18 }}>
      you@email.com
    </div>
    <div style={{ height: 60, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '0 28px', background: C.accent, color: '#fff', fontSize: 18, fontWeight: 600, borderRadius: 14, boxShadow: '0 14px 30px -10px rgba(75,70,229,0.55)', whiteSpace: 'nowrap' }}>
      Get early access <ArrowRightIcon size={20} color="#fff" />
    </div>
  </div>
);

/** Faint plan line-work used as a section background motif. */
const PlanLines: React.FC<{ opacity?: number; stroke?: string }> = ({ opacity = 0.05, stroke = C.accent }) => (
  <svg
    viewBox={`0 0 ${PLAN_W} ${PLAN_H}`}
    style={{ position: 'absolute', right: -60, top: -40, width: 560, opacity }}
  >
    {WALLS.map((w, i) => (
      <line key={i} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={stroke} strokeWidth={8} strokeLinecap="round" />
    ))}
  </svg>
);

/** Floating interface chip (style-pack pill / HUD) used around the hero frame. */
const FloatChip: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div
    style={{
      position: 'absolute',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px',
      background: C.panel,
      border: `1px solid ${C.panelBorder}`,
      borderRadius: 12,
      boxShadow: '0 18px 40px -14px rgba(27,29,36,0.25)',
      fontSize: 15,
      fontWeight: 600,
      color: C.ink,
      ...style,
    }}
  >
    {children}
  </div>
);

const SWATCHES = ['#b08968', '#8d99ae', '#d8c3a5', '#5e6472', '#9c6644'];

/* ---------- mini interface mocks for the feature grid ---------- */

const MockFrame: React.FC<{ children: React.ReactNode; pad?: number }> = ({ children, pad = 0 }) => (
  <div style={{ position: 'relative', height: 132, borderRadius: 12, background: '#f6f7fa', border: `1px solid ${C.panelBorder}`, overflow: 'hidden', padding: pad }}>
    {children}
  </div>
);

const MockStyles: React.FC = () => (
  <MockFrame>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {SWATCHES.map((s, i) => (
          <span key={s} style={{ width: 38, height: 38, borderRadius: 9, background: s, border: i === 0 ? `3px solid ${C.accent}` : `1px solid ${C.panelBorder}` }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        {['Indian Modern', 'Japandi', 'Heritage'].map((p, i) => (
          <span key={p} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: i === 0 ? C.accent : C.panel, color: i === 0 ? '#fff' : C.inkDim, border: `1px solid ${i === 0 ? C.accent : C.panelBorder}` }}>
            {p}
          </span>
        ))}
      </div>
    </div>
  </MockFrame>
);

const MockChat: React.FC = () => (
  <MockFrame pad={14}>
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <span style={{ padding: '8px 14px', borderRadius: '12px 12px 3px 12px', background: C.accent, color: '#fff', fontSize: 13.5, fontWeight: 500 }}>
        Add a sofa to the lounge
      </span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
      <span style={{ padding: '7px 14px', borderRadius: 8, background: C.accent, color: '#fff', fontSize: 12.5, fontWeight: 600 }}>Apply</span>
      <span style={{ padding: '7px 14px', borderRadius: 8, background: C.panel, border: `1px solid ${C.panelBorder}`, color: C.inkDim, fontSize: 12.5, fontWeight: 600 }}>Preview</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.green, fontWeight: 600 }}>
        <CheckIcon size={14} color={C.green} /> fits
      </span>
    </div>
  </MockFrame>
);

const MockFurniture: React.FC = () => (
  <MockFrame>
    <svg viewBox="0 0 300 132" style={{ width: '100%', height: '100%' }}>
      <rect x={40} y={14} width={220} height={104} fill="#efe3d2" stroke="#d8cdbb" rx={6} />
      <rect x={70} y={44} width={84} height={44} rx={8} fill="#39405a" />
      <rect x={76} y={36} width={72} height={12} rx={6} fill="#46506e" />
      <circle cx={112} cy={66} r={52} fill="none" stroke={C.green} strokeWidth={2} strokeDasharray="5 5" opacity={0.7} />
      <rect x={196} y={36} width={40} height={60} rx={6} fill="#7d6754" />
      <circle cx={230} cy={104} r={11} fill={C.green} />
      <path d="m225 104 3.5 3.5 7-7.5" stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </MockFrame>
);

const MockSlider: React.FC = () => (
  <MockFrame>
    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      <div style={{ flex: 1, background: '#cdb79a' }} />
      <div style={{ flex: 1, background: '#8a7a68' }} />
    </div>
    <span style={{ position: 'absolute', left: 14, top: 12, padding: '4px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.9)', fontSize: 11.5, fontWeight: 700, color: C.inkDim, letterSpacing: 0.6 }}>BEFORE</span>
    <span style={{ position: 'absolute', right: 14, top: 12, padding: '4px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.9)', fontSize: 11.5, fontWeight: 700, color: C.accent, letterSpacing: 0.6 }}>AFTER</span>
    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 3, background: '#fff', transform: 'translateX(-1.5px)' }} />
    <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 34, height: 34, borderRadius: 18, background: '#fff', boxShadow: '0 6px 16px rgba(27,29,36,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      <svg width={16} height={12} viewBox="0 0 16 12" fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="m5 2-4 4 4 4M11 2l4 4-4 4" /></svg>
    </div>
  </MockFrame>
);

const MockPhoto: React.FC = () => (
  <MockFrame>
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #e8d9bf 0%, #cdb088 55%, #b3936f 100%)' }} />
    {[0, 1, 2, 3, 4].map((i) => (
      <div key={i} style={{ position: 'absolute', left: `${(i * 37) % 80}%`, top: `${(i * 53) % 70}%`, width: '20%', height: '30%', background: 'rgba(238,240,244,0.55)', backdropFilter: 'blur(3px)' }} />
    ))}
    <span style={{ position: 'absolute', left: 12, bottom: 12, padding: '5px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: 600, color: C.ink }}>
      Photoreal · 312/400 samples…
    </span>
  </MockFrame>
);

const MockLocal: React.FC = () => (
  <MockFrame>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26, height: '100%' }}>
      <LaptopHomeIcon size={64} color={C.ink} accent={C.accent} />
      <CloudOffIcon size={46} color={C.inkFaint} slash={C.rose} />
    </div>
  </MockFrame>
);

/* ---------- data ---------- */

const FEATURES: { Mock: React.FC; t: string; d: string }[] = [
  { Mock: MockStyles, t: '12 style packs', d: 'Indian Modern to Fusion Japandi, one click.' },
  { Mock: MockChat, t: 'Ask in plain language', d: 'Preview every change. Works offline.' },
  { Mock: MockFurniture, t: 'Furniture that fits', d: 'Collision-checked, never overlapping.' },
  { Mock: MockSlider, t: 'Before & after', d: 'Drag to compare with the original.' },
  { Mock: MockPhoto, t: 'Photo Mode', d: 'Path-traced, near-photoreal stills.' },
  { Mock: MockLocal, t: '100% local', d: 'No accounts. No uploads. No paid APIs.' },
];

const STEPS = [
  { Icon: CursorIcon, t: 'Trace your plan' },
  { Icon: HouseIcon, t: 'Explore in 3D' },
  { Icon: PaletteIcon, t: 'Redesign it' },
  { Icon: CameraIcon, t: 'Render it' },
];

const AUDIENCE = [
  { Icon: HouseIcon, t: 'Homeowners & buyers' },
  { Icon: CompassIcon, t: 'Architects' },
  { Icon: SofaIcon, t: 'Interior designers' },
  { Icon: BuildingsIcon, t: 'Developers' },
];

export const LandingPage: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT }}>
      <div style={{ width: W, margin: '0 auto' }}>
        {/* NAV */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '28px 48px' }}>
          <Logo />
          <div style={{ display: 'flex', alignItems: 'center', gap: 34, fontSize: 16, fontWeight: 500, color: C.inkDim }}>
            <span>How it works</span>
            <span>Features</span>
            <span>Who it's for</span>
            <span style={{ padding: '11px 22px', borderRadius: 12, background: C.accent, color: '#fff', fontWeight: 600 }}>
              Get early access
            </span>
          </div>
        </div>

        {/* HERO */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 48, padding: '40px 48px 84px' }}>
          <div style={{ position: 'absolute', width: 620, height: 620, left: -120, top: -120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(75,70,229,0.10) 0%, transparent 64%)' }} />
          <div style={{ position: 'absolute', width: 520, height: 520, right: 80, bottom: -160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,178,118,0.13) 0%, transparent 66%)' }} />
          <div style={{ width: 560, position: 'relative' }}>
            <div style={{ ...eyebrow, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: C.accentSoft, borderRadius: 999 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: C.accent }} /> Local-first · early access
            </div>
            <div style={{ fontSize: 70, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: C.ink, marginTop: 22 }}>
              See your home <span style={{ color: C.accent }}>before</span> it's built.
            </div>
            <div style={{ fontSize: 21, lineHeight: 1.6, color: C.inkDim, marginTop: 22, maxWidth: 540 }}>
              Turn a 2D floor plan into an interactive, photoreal 3D home you can redesign — on your machine.
            </div>
            <div style={{ marginTop: 34 }}>
              <EmailForm />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 15, color: C.inkFaint }}>
              <CheckIcon size={17} color={C.green} /> No account, no uploads — your plan stays on your computer.
            </div>
          </div>

          {/* hero visual: framed live 3D home with floating interface chips */}
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ ...card, overflow: 'hidden', borderRadius: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${C.panelBorder}`, background: '#fafbfc' }}>
                {['#e2655b', '#e8b24a', '#54b06a'].map((c) => (
                  <span key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c }} />
                ))}
                <span style={{ marginLeft: 12, fontSize: 13, color: C.inkFaint }}>tryhomecanvas.com — My Home</span>
              </div>
              <div style={{ position: 'relative', height: 412, background: 'linear-gradient(180deg, #f3f4f8 0%, #e9ebf1 100%)' }}>
                <DollHouse3D azimuth={-26} tilt={56} zoom={1.0} quality="clean" />
              </div>
            </div>
            {/* floating UI chips from the app */}
            <FloatChip style={{ top: 70, left: -34, transform: 'rotate(-3deg)' }}>
              <span style={{ display: 'flex', gap: 5 }}>
                {SWATCHES.slice(0, 4).map((s) => (
                  <span key={s} style={{ width: 18, height: 18, borderRadius: 5, background: s }} />
                ))}
              </span>
              Floor material
            </FloatChip>
            <FloatChip style={{ bottom: 46, right: -26, transform: 'rotate(2.5deg)' }}>
              <CheckIcon size={17} color={C.green} /> Photoreal · 400/400 converged
            </FloatChip>
            <FloatChip style={{ bottom: -22, left: 56, transform: 'rotate(-1.5deg)' }}>
              <span style={{ padding: '3px 10px', borderRadius: 7, background: C.accent, color: '#fff', fontSize: 13 }}>Indian Modern</span>
              <span style={{ color: C.inkDim, fontSize: 13.5 }}>applied to Living</span>
            </FloatChip>
          </div>
        </div>

        {/* HOW IT WORKS — steps strip + the demo video */}
        <div style={{ position: 'relative', padding: '56px 48px 64px', background: C.bgWash, borderTop: `1px solid ${C.panelBorder}`, borderBottom: `1px solid ${C.panelBorder}`, overflow: 'hidden' }}>
          <PlanLines />
          <div style={eyebrow}>How it works</div>
          <div style={{ ...sectionTitle, marginTop: 10 }}>From a flat PDF to a home you can walk through.</div>

          {/* compact step strip */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 36 }}>
            {STEPS.map((s, i) => (
              <React.Fragment key={s.t}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                  <span style={{ width: 52, height: 52, borderRadius: 14, background: C.panel, border: `1px solid ${C.panelBorder}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px -10px rgba(27,29,36,0.15)' }}>
                    <s.Icon size={28} color={C.accent} />
                  </span>
                  <span style={{ fontSize: 19, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap' }}>{s.t}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 18px' }}>
                    <div style={{ flex: 1, height: 2, background: C.panelBorder }} />
                    <ArrowRightIcon size={18} color={C.inkFaint} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* the demo video, embedded */}
          <div style={{ position: 'relative', marginTop: 40, borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 90px -30px rgba(27,29,36,0.35)', border: `1px solid ${C.panelBorder}` }}>
            <div style={{ position: 'relative', height: 560, background: C.bg }}>
              <DollHouse3D azimuth={18} tilt={60} zoom={1.18} quality="clean" />
              {/* video chrome */}
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 55%, rgba(238,240,244,0.6) 100%)' }} />
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 96, height: 96, borderRadius: 48, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 24px 60px -12px rgba(75,70,229,0.6)' }}>
                <svg width={36} height={36} viewBox="0 0 24 24" fill="#fff"><path d="M8.5 5.5v13l10.5-6.5z" /></svg>
              </div>
              <span style={{ position: 'absolute', left: 22, bottom: 56, padding: '8px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: 600, color: C.ink, border: `1px solid ${C.panelBorder}` }}>
                Watch the 60-second demo
              </span>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, background: 'rgba(27,29,36,0.12)' }}>
                <div style={{ width: '34%', height: '100%', background: C.accent }} />
              </div>
              <span style={{ position: 'absolute', right: 20, bottom: 14, fontSize: 14, fontWeight: 600, color: C.inkDim }}>0:53</span>
            </div>
          </div>
        </div>

        {/* FEATURES — visual mini-mocks, one line each */}
        <div style={{ padding: '64px 48px' }}>
          <div style={eyebrow}>Everything in one canvas</div>
          <div style={{ ...sectionTitle, marginTop: 10 }}>Design your whole home, locally.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 38 }}>
            {FEATURES.map((f) => (
              <div key={f.t} style={{ ...card, padding: 16 }}>
                <f.Mock />
                <div style={{ fontSize: 21, fontWeight: 700, color: C.ink, marginTop: 16, padding: '0 6px' }}>{f.t}</div>
                <div style={{ fontSize: 15.5, lineHeight: 1.5, color: C.inkDim, marginTop: 5, padding: '0 6px 6px' }}>{f.d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AUDIENCE — compact icon row */}
        <div style={{ padding: '52px 48px', background: C.bgWash, borderTop: `1px solid ${C.panelBorder}`, borderBottom: `1px solid ${C.panelBorder}` }}>
          <div style={{ ...sectionTitle, textAlign: 'center', fontSize: 36 }}>
            Built for everyone who <span style={{ color: C.accent }}>shapes homes</span>.
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 34 }}>
            {AUDIENCE.map((a) => (
              <div key={a.t} style={{ ...card, display: 'inline-flex', alignItems: 'center', gap: 14, padding: '18px 26px', borderRadius: 14 }}>
                <span style={{ width: 46, height: 46, borderRadius: 12, background: C.accentSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <a.Icon size={26} color={C.accent} />
                </span>
                <span style={{ fontSize: 19, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap' }}>{a.t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* FINAL CTA */}
        <div style={{ padding: '72px 48px 56px' }}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, background: C.ink, padding: '60px 64px' }}>
            <div style={{ position: 'absolute', width: 560, height: 560, right: -120, top: -200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(75,70,229,0.5) 0%, transparent 62%)' }} />
            <svg viewBox={`0 0 ${PLAN_W} ${PLAN_H}`} style={{ position: 'absolute', right: 30, bottom: -60, width: 460, opacity: 0.14 }}>
              {WALLS.map((w, i) => (
                <line key={i} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#9aa0ff" strokeWidth={8} strokeLinecap="round" />
              ))}
            </svg>
            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: 46, fontWeight: 800, color: '#fff', letterSpacing: -1, maxWidth: 720 }}>
                See your home in 3D. Get early access.
              </div>
              <div style={{ fontSize: 19, color: 'rgba(255,255,255,0.7)', marginTop: 14, maxWidth: 600 }}>
                We'll email you the moment it's ready.
              </div>
              <div style={{ marginTop: 30 }}>
                <EmailForm wide />
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER — minimal */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 48px 44px' }}>
          <Logo size={17} />
          <div style={{ fontSize: 13, color: C.inkFaint }}>© 2026 HomeCanvas AI</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
