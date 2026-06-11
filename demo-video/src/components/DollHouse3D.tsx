import React from 'react';
import { AbsoluteFill } from 'remotion';
import { PLAN_H, PLAN_W, ROOMS, WALLS } from '../plan';

const WALL_H = 84;

/** Warm per-room floor palettes. */
const FLOOR_CLEAN: Record<string, string> = {
  BEDROOM: 'radial-gradient(circle at 45% 40%, #c9a47e 0%, #a87f5c 70%)',
  LIVING: 'radial-gradient(circle at 55% 45%, #d9c3a2 0%, #b3936f 72%)',
  KITCHEN: 'radial-gradient(circle at 50% 50%, #cdb9a4 0%, #a18a72 75%)',
  DINING: 'radial-gradient(circle at 50% 40%, #d3b88e 0%, #ab8a64 75%)',
  BATH: 'radial-gradient(circle at 50% 50%, #b9c2c9 0%, #8d979f 75%)',
};
const FLOOR_RASTER: Record<string, string> = {
  BEDROOM: '#9b7c5f',
  LIVING: '#ad9170',
  KITCHEN: '#9e8a72',
  DINING: '#a68a66',
  BATH: '#8e979e',
};

interface Props {
  /** Camera yaw in degrees (rotateZ of the stage). */
  azimuth: number;
  /** Camera tilt in degrees: ~15 = near top-down, ~75 = near eye-level. */
  tilt: number;
  zoom: number;
  /** 'clean' = warm light pools + soft shadows (photo mode); 'raster' = flat. */
  quality?: 'clean' | 'raster';
}

/**
 * A real 3D dollhouse of the demo plan built from CSS 3D transforms (no WebGL,
 * renders in headless Chrome). Walls stand up from the floor plane; the camera
 * orbits by animating azimuth/tilt/zoom from the parent.
 */
export const DollHouse3D: React.FC<Props> = ({ azimuth, tilt, zoom, quality = 'clean' }) => {
  const clean = quality === 'clean';
  return (
    <AbsoluteFill style={{ perspective: 1600, perspectiveOrigin: '50% 42%', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 0,
          height: 0,
          transformStyle: 'preserve-3d',
          transform: `scale(${zoom}) rotateX(${tilt}deg) rotateZ(${azimuth}deg)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: -PLAN_W / 2,
            top: -PLAN_H / 2,
            width: PLAN_W,
            height: PLAN_H,
            transformStyle: 'preserve-3d',
          }}
        >
          {/* ground slab — a soft platform that reads on the light chrome */}
          <div
            style={{
              position: 'absolute',
              left: -70,
              top: -70,
              width: PLAN_W + 140,
              height: PLAN_H + 140,
              borderRadius: 26,
              background: clean
                ? 'linear-gradient(135deg, #dfe2ea 0%, #cfd3de 100%)'
                : '#dde0e8',
              transform: 'translateZ(-3px)',
              boxShadow: clean ? '0 60px 140px rgba(27,29,36,0.30)' : '0 40px 100px rgba(27,29,36,0.20)',
            }}
          />
          {/* room floors */}
          {ROOMS.map((r) => (
            <div
              key={r.label}
              style={{
                position: 'absolute',
                left: r.x0,
                top: r.y0,
                width: r.x1 - r.x0,
                height: r.y1 - r.y0,
                background: clean ? FLOOR_CLEAN[r.label] : FLOOR_RASTER[r.label],
                transform: 'translateZ(0.5px)',
              }}
            />
          ))}

          {/* furniture glyphs on the floor */}
          <div style={{ position: 'absolute', left: 380, top: 130, width: 170, height: 64, borderRadius: 12, background: '#3c4154', transform: 'translateZ(1px)', boxShadow: clean ? '6px 8px 18px rgba(0,0,0,0.35)' : 'none' }} />
          <div style={{ position: 'absolute', left: 100, top: 90, width: 130, height: 180, borderRadius: 10, background: '#7d6754', transform: 'translateZ(1px)', boxShadow: clean ? '6px 8px 18px rgba(0,0,0,0.3)' : 'none' }} />
          <div style={{ position: 'absolute', left: 380, top: 396, width: 88, height: 88, borderRadius: '50%', background: '#6b563f', transform: 'translateZ(1px)', boxShadow: clean ? '5px 7px 16px rgba(0,0,0,0.3)' : 'none' }} />
          <div style={{ position: 'absolute', left: 712, top: 70, width: 26, height: 26, borderRadius: '50%', background: '#4d7a4f', transform: 'translateZ(1px)' }} />

          {/* staircase: stacked slabs rising along the living room's east wall */}
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 686,
                top: 132 + i * 27,
                width: 62,
                height: 24,
                background: `hsl(35, 38%, ${58 - i * 3}%)`,
                transform: `translateZ(${4 + i * 10}px)`,
                borderRadius: 3,
              }}
            />
          ))}

          {/* walls standing up from the floor plane */}
          {WALLS.map((w, i) => {
            const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
            const ang = (Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180) / Math.PI;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: w.x1,
                  top: w.y1,
                  width: len,
                  height: WALL_H,
                  transformOrigin: '0 0',
                  // rotateX(90°) sends the div's +y into +z: the wall stands up.
                  transform: `rotateZ(${ang}deg) rotateX(90deg)`,
                  background: clean
                    ? 'linear-gradient(0deg, #d8d2c4 0%, #f7f3ea 78%, #fffdf6 100%)'
                    : 'linear-gradient(0deg, #cfcabe 0%, #ece8dd 100%)',
                  borderTop: '2px solid #b9b2a3',
                }}
              />
            );
          })}

          {/* warm light pools (photo mode look) */}
          {clean && (
            <>
              <div style={{ position: 'absolute', left: 330, top: 80, width: 380, height: 230, background: 'radial-gradient(circle, rgba(255,214,150,0.5) 0%, transparent 65%)', transform: 'translateZ(1.5px)' }} />
              <div style={{ position: 'absolute', left: 80, top: 350, width: 300, height: 160, background: 'radial-gradient(circle, rgba(255,206,140,0.4) 0%, transparent 65%)', transform: 'translateZ(1.5px)' }} />
              <div style={{ position: 'absolute', left: 540, top: 360, width: 200, height: 140, background: 'radial-gradient(circle, rgba(190,220,255,0.3) 0%, transparent 65%)', transform: 'translateZ(1.5px)' }} />
            </>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
