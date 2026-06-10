import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { TourStop } from '@lib/tour';
import { useEditor } from '../../store/editor-store';

/**
 * Drives the camera through the guided POV tour. When playing, it dwells in
 * each room then advances to the next; manual Prev/Next pause autoplay.
 * No OrbitControls are mounted in tour mode — this owns the camera.
 */
const DWELL_S = 3.2;
const ARRIVE_DIST = 0.4;

export function TourController({ stops }: { stops: TourStop[] }) {
  const tourIndex = useEditor((s) => s.tourIndex);
  const tourPlaying = useEditor((s) => s.tourPlaying);
  const tourAdvance = useEditor((s) => s.tourAdvance);
  const stopPlaying = useEditor((s) => s.tourStopPlaying);

  const lookTarget = useRef(new THREE.Vector3());
  const dwell = useRef(0);
  const initialized = useRef(false);

  useFrame((state, dt) => {
    const stop = stops[Math.min(tourIndex, stops.length - 1)];
    if (!stop) return;
    const cam = state.camera;
    const targetEye = new THREE.Vector3(...stop.eye);
    const targetLook = new THREE.Vector3(...stop.look);

    if (!initialized.current) {
      cam.position.copy(targetEye);
      lookTarget.current.copy(targetLook);
      initialized.current = true;
    }

    const k = 1 - Math.exp(-3.2 * Math.min(dt, 0.05));
    cam.position.lerp(targetEye, k);
    lookTarget.current.lerp(targetLook, k);
    cam.lookAt(lookTarget.current);

    if (tourPlaying) {
      const arrived = cam.position.distanceTo(targetEye) < ARRIVE_DIST;
      if (arrived) {
        dwell.current += dt;
        if (dwell.current > DWELL_S) {
          dwell.current = 0;
          if (tourIndex < stops.length - 1) tourAdvance(tourIndex + 1);
          else stopPlaying(); // reached the end -> stop
        }
      } else {
        dwell.current = 0;
      }
    } else {
      dwell.current = 0;
    }
  });

  return null;
}
