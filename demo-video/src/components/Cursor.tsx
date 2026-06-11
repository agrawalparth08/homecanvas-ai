import React from 'react';
import { C } from '../theme';

/**
 * A small cursor dot with a click ripple. Position/click are driven by the
 * parent (already interpolated) so this stays a dumb visual.
 */
export const Cursor: React.FC<{ x: number; y: number; clickProgress?: number }> = ({ x, y, clickProgress = 0 }) => {
  return (
    <div style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none' }}>
      {clickProgress > 0 && clickProgress < 1 && (
        <div
          style={{
            position: 'absolute',
            left: -22 * clickProgress,
            top: -22 * clickProgress,
            width: 44 * clickProgress,
            height: 44 * clickProgress,
            borderRadius: '50%',
            border: `3px solid ${C.accent}`,
            opacity: 1 - clickProgress,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          left: -9,
          top: -9,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: C.ink,
          border: '3px solid #ffffff',
          boxShadow: '0 2px 10px rgba(27,29,36,0.35)',
        }}
      />
    </div>
  );
};
