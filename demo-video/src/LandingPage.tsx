import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT } from './theme';
import { DollHouse3D } from './components/DollHouse3D';
import {
  ArrowRightIcon,
  BuildingsIcon,
  CameraIcon,
  CheckIcon,
  CompassIcon,
  CursorIcon,
  HouseIcon,
  LockIcon,
  PaletteIcon,
  SliderIcon,
  SofaIcon,
  SparkleIcon,
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
const sub: React.CSSProperties = { fontSize: 19, lineHeight: 1.6, color: C.inkDim };

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
    <div
      style={{
        flex: 1,
        height: 60,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        background: C.panel,
        border: `1px solid ${C.panelBorder}`,
        borderRadius: 14,
        color: C.inkFaint,
        fontSize: 18,
      }}
    >
      you@email.com
    </div>
    <div
      style={{
        height: 60,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 28px',
        background: C.accent,
        color: '#fff',
        fontSize: 18,
        fontWeight: 600,
        borderRadius: 14,
        boxShadow: '0 14px 30px -10px rgba(75,70,229,0.55)',
        whiteSpace: 'nowrap',
      }}
    >
      Get early access <ArrowRightIcon size={20} color="#fff" />
    </div>
  </div>
);

const FEATURES = [
  { Icon: PaletteIcon, t: '12 style packs', d: 'From Indian Modern to Rajasthani Heritage and Fusion Japandi. Swap a whole room in a click.' },
  { Icon: SparkleIcon, t: 'Ask in plain language', d: '"Add a sofa to the lounge." Preview every change, approve what you love. Works offline.' },
  { Icon: SofaIcon, t: 'Furniture that fits', d: 'Real CC0 models placed with collision and clearance checks, never overlapping.' },
  { Icon: SliderIcon, t: 'Before & after', d: 'Drag a slider to compare your edits with the original, side by side.' },
  { Icon: CameraIcon, t: 'Photo Mode', d: 'A GPU path tracer refines any view into a near-photoreal still you can save.' },
  { Icon: LockIcon, t: '100% local', d: 'No accounts, no uploads, no paid APIs. Your plan never leaves your computer.' },
];

const STEPS = [
  { n: '01', Icon: CursorIcon, t: 'Trace your plan', d: 'Upload a PDF or photo, set the scale, and snap walls, rooms, doors and windows.' },
  { n: '02', Icon: HouseIcon, t: 'Explore in 3D', d: 'Orbit, walk through in first person, or take a guided tour, room by room.' },
  { n: '03', Icon: PaletteIcon, t: 'Redesign', d: 'Materials, style packs, furniture, stairs. Make every room feel like yours.' },
  { n: '04', Icon: CameraIcon, t: 'Render it', d: 'Switch to Photo Mode for a photoreal still, then save and share.' },
];

const AUDIENCE = [
  { Icon: HouseIcon, t: 'Homeowners & buyers', d: 'See your space before you commit to it.' },
  { Icon: CompassIcon, t: 'Architects', d: 'Present ideas clients can actually feel.' },
  { Icon: SofaIcon, t: 'Interior designers', d: 'Iterate styles and variants in minutes.' },
  { Icon: BuildingsIcon, t: 'Developers', d: 'Let buyers walk a home before it exists.' },
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
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 48, padding: '40px 48px 64px' }}>
          <div style={{ position: 'absolute', width: 620, height: 620, left: -120, top: -120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(75,70,229,0.10) 0%, transparent 64%)' }} />
          <div style={{ position: 'absolute', width: 520, height: 520, right: 80, bottom: -160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,178,118,0.13) 0%, transparent 66%)' }} />
          <div style={{ width: 600, position: 'relative' }}>
            <div style={{ ...eyebrow, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: C.accentSoft, borderRadius: 999 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: C.accent }} /> Local-first · early access
            </div>
            <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: C.ink, marginTop: 22 }}>
              Walk through your home <span style={{ color: C.accent }}>before</span> you build it.
            </div>
            <div style={{ ...sub, fontSize: 21, marginTop: 22, maxWidth: 560 }}>
              HomeCanvas turns a 2D floor plan into an interactive, photoreal 3D home you can redesign — materials, furniture, Indian-context styles, and a path-traced Photo Mode. It all runs on your machine.
            </div>
            <div style={{ marginTop: 34 }}>
              <EmailForm />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 15, color: C.inkFaint }}>
              <CheckIcon size={17} color={C.green} /> No account, no uploads — your plan stays on your computer.
            </div>
          </div>

          {/* hero visual: framed live 3D home */}
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
          </div>
        </div>

        {/* HOW IT WORKS */}
        <div style={{ padding: '56px 48px', background: C.bgWash, borderTop: `1px solid ${C.panelBorder}`, borderBottom: `1px solid ${C.panelBorder}` }}>
          <div style={eyebrow}>How it works</div>
          <div style={{ ...sectionTitle, marginTop: 10 }}>From a flat PDF to a home you can walk through.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginTop: 38 }}>
            {STEPS.map((s) => (
              <div key={s.n} style={{ ...card, padding: '26px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ width: 52, height: 52, borderRadius: 14, background: C.accentSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <s.Icon size={30} color={C.accent} />
                  </span>
                  <span style={{ fontSize: 30, fontWeight: 800, color: C.panelBorder }}>{s.n}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.ink, marginTop: 18 }}>{s.t}</div>
                <div style={{ fontSize: 16, lineHeight: 1.5, color: C.inkDim, marginTop: 8 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FEATURES */}
        <div style={{ padding: '64px 48px' }}>
          <div style={eyebrow}>Everything in one canvas</div>
          <div style={{ ...sectionTitle, marginTop: 10 }}>Design your whole home, locally.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 38 }}>
            {FEATURES.map((f) => (
              <div key={f.t} style={{ ...card, padding: '28px 26px' }}>
                <span style={{ width: 56, height: 56, borderRadius: 15, background: C.accentSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <f.Icon size={32} color={C.accent} />
                </span>
                <div style={{ fontSize: 23, fontWeight: 700, color: C.ink, marginTop: 20 }}>{f.t}</div>
                <div style={{ fontSize: 16.5, lineHeight: 1.55, color: C.inkDim, marginTop: 9 }}>{f.d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AUDIENCE */}
        <div style={{ padding: '56px 48px', background: C.bgWash, borderTop: `1px solid ${C.panelBorder}`, borderBottom: `1px solid ${C.panelBorder}` }}>
          <div style={{ ...sectionTitle, textAlign: 'center' }}>
            Built for everyone who <span style={{ color: C.accent }}>shapes homes</span>.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginTop: 38 }}>
            {AUDIENCE.map((a) => (
              <div key={a.t} style={{ ...card, padding: '28px 24px', textAlign: 'center' }}>
                <span style={{ width: 64, height: 64, borderRadius: 16, background: C.accentSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                  <a.Icon size={36} color={C.accent} />
                </span>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.ink, marginTop: 18 }}>{a.t}</div>
                <div style={{ fontSize: 15.5, lineHeight: 1.5, color: C.inkDim, marginTop: 7 }}>{a.d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FINAL CTA */}
        <div style={{ padding: '72px 48px' }}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, background: C.ink, padding: '64px 64px' }}>
            <div style={{ position: 'absolute', width: 560, height: 560, right: -120, top: -200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(75,70,229,0.5) 0%, transparent 62%)' }} />
            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: 46, fontWeight: 800, color: '#fff', letterSpacing: -1, maxWidth: 760 }}>
                See your home in 3D. Get early access.
              </div>
              <div style={{ fontSize: 19, color: 'rgba(255,255,255,0.7)', marginTop: 16, maxWidth: 640 }}>
                Be among the first to turn your floor plan into a home you can walk through. We'll email you the moment it's ready.
              </div>
              <div style={{ marginTop: 34 }}>
                <EmailForm wide />
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 48px 48px' }}>
          <Logo size={18} />
          <div style={{ fontSize: 15, color: C.inkFaint }}>tryhomecanvas.com · made locally</div>
          <div style={{ fontSize: 13, color: C.inkFaint, maxWidth: 360, textAlign: 'right' }}>
            Visualizations are for design exploration, not construction drawings.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
