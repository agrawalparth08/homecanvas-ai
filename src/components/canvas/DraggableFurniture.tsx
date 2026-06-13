import { useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { collidesWithAny, rectFootprint, worldFootprint } from '@lib/geometry/collision';
import {
  dragSnap,
  screenToFloor,
  type PlacedRect,
  type RoomBounds,
  type Size2,
} from '@lib/interaction/furniture-drag';
import type { Vec2 } from '@lib/geometry/vec';
import { makePatch } from '@lib/scene/patching';
import type { Floor, FurnitureObject } from '@lib/scene/schemas';
import { useEditor } from '../../store/editor-store';

const MM = 0.001;
const DRAG_COLOR = '#d8a25a';

/**
 * Coordinate bridge. The scene graph is plan-space mm with world placement
 * [x*MM, elev*MM, -y*MM] (see FloorContent), so world.z = -plan.y. screenToFloor
 * works in three.js world units and reports {x: world.x, y: world.z}; these
 * helpers move between that world frame (metres) and the scene's plan frame (mm).
 */
const worldToPlan = (w: Vec2): Vec2 => ({ x: w.x / MM, y: -w.y / MM });
const planToWorld = (p: Vec2): Vec2 => ({ x: p.x * MM, y: -p.y * MM });

/** Axis-aligned plan-mm bounds of a room boundary's outer ring. */
function roomBounds(outer: Vec2[]): RoomBounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of outer) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

/** Sibling furniture in the same room as `obj`, as plan-mm obstacle rects. */
function siblingRects(floor: Floor, obj: FurnitureObject): PlacedRect[] {
  return floor.objects
    .filter((o) => o.id !== obj.id && o.roomId === obj.roomId)
    .map((o) => ({
      x: o.transform.x,
      y: o.transform.y,
      w: o.dimensions.w,
      d: o.dimensions.d,
      rot: o.transform.rotationY,
    }));
}

interface DraggableFurnitureProps {
  /** The currently selected furniture piece (the only draggable one). */
  object: FurnitureObject;
  /** Floor the piece lives on — supplies room bounds + sibling obstacles. */
  floor: Floor;
  /** World-space elevation of the floor group (mm), matching FloorContent. */
  floorElevation: number;
  /** Children = the actual rendered piece (procedural / glTF), shown while idle. */
  children: ReactNode;
}

/**
 * Makes the SELECTED furniture piece draggable across the floor plane.
 *
 * Pointer-down on the piece captures the pointer and starts a drag; each move
 * ray-casts to the floor plane (screenToFloor), snaps collision-aware against
 * the room bounds + siblings (dragSnap), and previews a ghost at the snapped
 * spot. Pointer-up commits ONE `transform_object` patch via the store; cancel
 * (pointer leaves / Escape-less release outside) just drops the ephemeral state.
 *
 * Drag state is entirely local — the store is touched once, on release — so we
 * never thrash the scene graph or the undo stack mid-drag.
 */
export function DraggableFurniture({ object, floor, floorElevation, children }: DraggableFurnitureProps) {
  const applyPatch = useEditor((s) => s.applyPatch);

  // Ephemeral, render-driving drag target in plan mm (null => not dragging).
  const [dragPlan, setDragPlan] = useState<Vec2 | null>(null);
  const draggingRef = useRef(false);
  // Plan-mm offset from the grabbed point to the piece centre, so the drag tracks
  // the grab point rather than teleporting the centre under the cursor.
  const grabOffsetRef = useRef<Vec2>({ x: 0, y: 0 });

  const size: Size2 = { w: object.dimensions.w, d: object.dimensions.d };
  const bounds = useMemo(() => {
    const room = floor.rooms.find((r) => r.id === object.roomId);
    return room ? roomBounds(room.boundary.outer) : null;
  }, [floor.rooms, object.roomId]);
  const others = useMemo(() => siblingRects(floor, object), [floor, object]);

  // Floor-plane Y in world metres: the per-floor group elevation + the piece's
  // own resting elevation, both mm -> m. The ray is intersected against this.
  const floorY = (floorElevation + object.transform.elevation) * MM;

  /** Raw pointer→plan hit (no offset, no snap), or null off the floor plane. */
  const rawPlanFromEvent = (e: ThreeEvent<PointerEvent>): Vec2 | null => {
    // fiber recomputes this ray from the event's pointer + active camera each
    // move (including while the pointer is captured off the mesh), so we read it
    // directly instead of mutating the shared raycaster.
    const { origin: o, direction: d } = e.ray;
    const hit = screenToFloor({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z }, floorY);
    return hit ? worldToPlan(hit) : null;
  };

  /** Snapped target centre for the drag, preserving the grab offset. */
  const planFromEvent = (e: ThreeEvent<PointerEvent>): Vec2 | null => {
    const raw = rawPlanFromEvent(e);
    if (!raw) return null;
    const centre = { x: raw.x + grabOffsetRef.current.x, y: raw.y + grabOffsetRef.current.y };
    if (!bounds) return centre; // no room bounds known: free-drag, no snap
    return dragSnap(centre, size, others, bounds, { gap: 0 });
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    draggingRef.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    // Anchor the drag at the grabbed point so the centre tracks the cursor by a
    // fixed offset (no teleport). We deliberately do NOT setDragPlan here: a press
    // with no motion leaves dragPlan null, so a plain click stays a no-op — no
    // ghost, no transform_object commit. The first move starts the live preview.
    const raw = rawPlanFromEvent(e);
    grabOffsetRef.current = raw
      ? { x: object.transform.x - raw.x, y: object.transform.y - raw.y }
      : { x: 0, y: 0 };
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    const next = planFromEvent(e);
    if (next) setDragPlan(next);
  };

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    draggingRef.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    const target = dragPlan;
    setDragPlan(null);
    if (!target) return;
    // No-op guard: skip the commit (and a redundant undo entry) if unmoved.
    if (target.x === object.transform.x && target.y === object.transform.y) return;
    applyPatch(
      makePatch(`Move ${object.name}`, [
        {
          type: 'transform_object',
          objectId: object.id,
          transform: { x: target.x, y: target.y },
        },
      ]),
    );
  };

  // While dragging, preview the piece at the snapped spot; otherwise it sits at
  // its committed transform (FloorContent already renders it there too, so the
  // ghost rides on top until release commits the new position).
  const previewWorld = dragPlan ? planToWorld(dragPlan) : null;

  return (
    <group>
      {/* Interactive piece: pointer-down here starts the drag. */}
      <group
        position={[object.transform.x * MM, object.transform.elevation * MM, -object.transform.y * MM]}
        rotation={[0, object.transform.rotationY, 0]}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        visible={dragPlan === null}
      >
        {children}
      </group>

      {/* Ghost (footprint marker + a translucent copy of the piece) that tracks
          the snapped drag target. The whole group carries the object's yaw about
          world-Y, exactly like the committed piece, so the footprint plane only
          needs to lie flat — no per-axis sign guessing. */}
      {previewWorld && (
        <group
          position={[previewWorld.x, object.transform.elevation * MM, previewWorld.y]}
          rotation={[0, object.transform.rotationY, 0]}
        >
          <FootprintGhost size={size} valid={isClear(dragPlan!, size, others)} />
          {children}
        </group>
      )}
    </group>
  );
}

/** True if the dragged centre is clear of every sibling (drives ghost colour). */
function isClear(centre: Vec2, size: Size2, others: PlacedRect[]): boolean {
  const foot = rectFootprint(size.w, size.d).map((p) => ({ x: p.x + centre.x, y: p.y + centre.y }));
  const obstacles = others.map((o) =>
    worldFootprint({ footprint: rectFootprint(o.w, o.d), transform: { x: o.x, y: o.y, rotationY: o.rot } }),
  );
  return !collidesWithAny(foot, obstacles, 0);
}

/**
 * Flat translucent rectangle on the floor showing where the piece will land.
 * Drawn in the parent's yaw-rotated, snapped-position frame, so it just lies
 * flat (-90° about local X) at the local origin. Width maps to plan w, the
 * depth axis to plan d (the plane's local +Y -> world depth after the tilt).
 */
function FootprintGhost({ size, valid }: { size: Size2; valid: boolean }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} renderOrder={20}>
      <planeGeometry args={[size.w * MM, size.d * MM]} />
      <meshBasicMaterial
        color={valid ? DRAG_COLOR : '#c0573a'}
        transparent
        opacity={0.35}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
