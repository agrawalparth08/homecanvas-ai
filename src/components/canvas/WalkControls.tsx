import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  easeTour,
  stepWalk,
  wrapAngle,
  type CamState,
  type WalkInput,
} from '@lib/interaction/walk-camera';
import { useEditor } from '../../store/editor-store';

const MM = 0.001;
/** Eye height in metres (≈ standing). */
const EYE_H = 1.6;
/** Walk speed, mm/s. */
const SPEED = 2600;
/** Turn rate for arrow-key yaw, rad/s. */
const KEY_TURN = 2.2;
/** Mouse-look sensitivity, rad per pixel of drag. */
const LOOK_SENS = 0.0025;
/** Clamp pitch just shy of straight up/down. */
const MAX_PITCH = Math.PI / 2 - 0.05;
/** Seconds to glide between tour stops. */
const TOUR_GLIDE_S = 2.4;

/**
 * Plan-mm (x, y) -> three.js world (metres). The scene places objects at
 * [x*MM, elev*MM, -y*MM] (see FloorContent), so world.z = -plan.y.
 */
const planToWorldXZ = (x: number, y: number): [number, number] => [x * MM, -y * MM];

/**
 * Map walk-camera yaw (0 faces +plan.y, increasing toward +plan.x) to a three.js
 * Y-rotation. three's default forward is -Z; a +Y rotation by θ takes (0,0,-1) to
 * (-sinθ, 0, -cosθ). The walk heading in world is (sin yaw, 0, -cos yaw) (because
 * world.z = -plan.y), so we need -sinθ = sin yaw → θ = -yaw. Without the negation
 * the camera looks mirrored across X and W walks opposite to the view.
 */
const yawToThree = (yaw: number): number => -yaw;

interface TourPose {
  /** Plan position (mm) + heading (rad), in walk-camera convention. */
  cam: CamState;
}

interface WalkControlsProps {
  /**
   * Ordered tour poses (one per stop) in plan/walk-camera convention. When in
   * 'tour' mode the camera eases between these driven by the store's tourIndex.
   * Omit/empty to disable tour gliding (walk mode still works).
   */
  tourPoses?: TourPose[];
  /** Starting pose for walk mode (plan mm + yaw). Defaults to origin facing +y. */
  start?: CamState;
}

/**
 * First-person controller for 'walk' and 'tour' view modes.
 *
 * walk: WASD / arrow keys drive forward-back + strafe (stepWalk), drag-to-look
 * sets yaw + pitch. tour: eases between `tourPoses[tourIndex]` with easeTour and
 * smoothstep, mirroring TourController's dwell-free glide. Renders nothing and
 * only acts while the view mode matches — mount it unconditionally; it self-gates.
 *
 * No store writes: this drives the three camera imperatively each frame, leaving
 * the scene graph untouched (transform edits come from DraggableFurniture).
 */
export function WalkControls({ tourPoses = [], start }: WalkControlsProps) {
  const viewMode = useEditor((s) => s.viewMode);
  const tourIndex = useEditor((s) => s.tourIndex);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const active = viewMode === 'walk' || viewMode === 'tour';

  // Mutable walk pose (plan mm + yaw) + pitch, kept across frames.
  const pose = useRef<CamState>(start ?? { x: 0, y: 0, yaw: 0 });
  const pitch = useRef(0);
  const keys = useRef<Record<string, boolean>>({});
  const looking = useRef(false);

  // Tour glide bookkeeping: remember where we started gliding from + elapsed t.
  const tourFrom = useRef<CamState | null>(null);
  const tourT = useRef(1);
  const prevIndex = useRef(tourIndex);

  // Re-seed the walk pose whenever we (re)enter walk mode, so it picks up the
  // caller's start without snapping mid-session.
  useEffect(() => {
    if (viewMode === 'walk' && start) {
      pose.current = { ...start };
      pitch.current = 0;
    }
  }, [viewMode, start]);

  // Keyboard: track held movement keys (only meaningful in walk mode).
  useEffect(() => {
    if (viewMode !== 'walk') return;
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      keys.current = {};
    };
  }, [viewMode]);

  // Pointer drag for mouse-look (walk mode). Uses the canvas element directly so
  // it composes with whatever else is mounted; PointerLock is not required.
  useEffect(() => {
    if (viewMode !== 'walk') return;
    const el = gl.domElement;
    const onDown = () => {
      looking.current = true;
    };
    const onUp = () => {
      looking.current = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!looking.current) return;
      pose.current.yaw = wrapAngle(pose.current.yaw + e.movementX * LOOK_SENS);
      pitch.current = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch.current - e.movementY * LOOK_SENS));
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
      looking.current = false;
    };
  }, [viewMode, gl]);

  // When the tour index changes, snapshot the current pose as the glide origin
  // and restart the eased interpolation.
  useEffect(() => {
    if (viewMode !== 'tour') return;
    if (prevIndex.current !== tourIndex) {
      tourFrom.current = { ...pose.current };
      tourT.current = 0;
      prevIndex.current = tourIndex;
    }
  }, [viewMode, tourIndex]);

  // Reusable Euler to avoid per-frame allocation.
  const euler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), []);

  useFrame((_, dt) => {
    if (!active) return;
    const clampedDt = Math.min(dt, 0.05); // guard against tab-switch spikes

    if (viewMode === 'walk') {
      const k = keys.current;
      const input: WalkInput = {
        forward: (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0),
        strafe: (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0),
        turn: (k['ArrowRight'] ? KEY_TURN : 0) - (k['ArrowLeft'] ? KEY_TURN : 0),
      };
      pose.current = stepWalk(pose.current, input, clampedDt, SPEED);
    } else {
      // tour: ease from the snapshot toward the active pose.
      const target = tourPoses[Math.min(tourIndex, tourPoses.length - 1)]?.cam;
      if (target) {
        const from = tourFrom.current ?? pose.current;
        tourT.current = Math.min(1, tourT.current + clampedDt / TOUR_GLIDE_S);
        pose.current = easeTour(from, target, tourT.current);
        pitch.current = 0;
      }
    }

    const [wx, wz] = planToWorldXZ(pose.current.x, pose.current.y);
    camera.position.set(wx, EYE_H, wz);
    euler.set(pitch.current, yawToThree(pose.current.yaw), 0);
    camera.quaternion.setFromEuler(euler);
  });

  return null;
}
