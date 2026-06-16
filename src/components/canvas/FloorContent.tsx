import { Suspense, createContext, useContext, useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { useQuery } from '@tanstack/react-query';
import { prismsToBuffers, wallSolidToBuffers } from '@lib/geometry/extrusion';
import { buildStair } from '@lib/geometry/stairs';
import { buildWallNetwork } from '@lib/geometry/walls';
import type { Floor, FurnitureObject } from '@lib/scene/schemas';
import { assetUrl, fetchAssetManifest } from '../../api';
import { useEditor, type Selection } from '../../store/editor-store';
import { DraggableFurniture } from './DraggableFurniture';
import { bufferDataToGeometry, boundaryToFloorGeometry } from './geometry-helpers';
import { GltfErrorBoundary, GltfFurniture } from './GltfFurniture';
import { pick, TRIM_MATERIAL } from './materials';
import { ProceduralFurniture } from './ProceduralFurniture';
import { InstancedFurniture } from './InstancedFurniture';
import { partitionForInstancing } from '@lib/render/instancing';

const MM = 0.001;
const SELECT_COLOR = '#d8a25a';
const INSTANCE_MIN = 4; // batch identical procedural pieces only when it saves enough draw calls

interface FloorContentProps {
  floor: Floor;
  elevation: number;
  materials: Map<string, THREE.MeshStandardMaterial>;
}

/**
 * Optional override so the tracing 3D preview can route clicks to the wizard's
 * LOCAL selection (highlighting the matching 2D wall/room) instead of the main
 * editor store. When no provider is present, useSelect uses the store as usual.
 */
export const PickProvider = createContext<{ onPick: (id: string) => void; selectedId: string | null } | null>(null);

function useSelect() {
  const override = useContext(PickProvider);
  const select = useEditor((s) => s.select);
  const selection = useEditor((s) => s.selection);
  const onSelect = (sel: Selection) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (override) override.onPick(sel.id);
    else select(sel);
  };
  const isSelected = (id: string) => (override ? override.selectedId === id : selection?.id === id);
  return { onSelect, isSelected };
}

function WallMeshes({ floor, materials }: { floor: Floor; materials: FloorContentProps['materials'] }) {
  const { onSelect, isSelected } = useSelect();
  // walls/openings are the only inputs the network depends on (structural sharing keeps these stable)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const solids = useMemo(() => buildWallNetwork(floor), [floor.walls, floor.openings]);
  const geometries = useMemo(() => {
    const map = new Map<string, THREE.BufferGeometry>();
    for (const solid of solids) map.set(solid.wallId, bufferDataToGeometry(wallSolidToBuffers(solid)));
    return map;
  }, [solids]);

  return (
    <>
      {solids.map((solid) => {
        const wall = floor.walls.find((w) => w.id === solid.wallId)!;
        const geometry = geometries.get(solid.wallId)!;
        return (
          <mesh
            key={wall.id}
            geometry={geometry}
            material={[pick(materials, wall.materialIds.sideA), pick(materials, wall.materialIds.sideB), TRIM_MATERIAL]}
            castShadow
            receiveShadow
            onClick={onSelect({ type: 'wall', id: wall.id })}
          >
            {isSelected(wall.id) && <Edges scale={1.002} color={SELECT_COLOR} lineWidth={2} />}
          </mesh>
        );
      })}
    </>
  );
}

function RoomSurfaces({ floor, materials }: { floor: Floor; materials: FloorContentProps['materials'] }) {
  const { onSelect, isSelected } = useSelect();
  // Dollhouse view: ceilings would hide the interior from orbit/top cameras.
  const showCeilings = useEditor((s) => s.viewMode === 'walk');
  const geometries = useMemo(() => {
    const map = new Map<string, THREE.BufferGeometry>();
    for (const room of floor.rooms) map.set(room.id, boundaryToFloorGeometry(room.boundary));
    return map;
  }, [floor.rooms]);

  return (
    <>
      {floor.rooms.map((room) => {
        const geometry = geometries.get(room.id)!;
        return (
          <group key={room.id}>
            <mesh
              geometry={geometry}
              material={pick(materials, room.floorSurface.materialId)}
              receiveShadow
              onClick={onSelect({ type: 'room', id: room.id })}
            >
              {isSelected(room.id) && <Edges scale={1.001} color={SELECT_COLOR} lineWidth={3} />}
            </mesh>
            {isSelected(room.id) && (
              // Prominent glow over the selected room's floor — visible from
              // orbit/top/inside, so clicking a room in the left list clearly
              // points to it on the canvas.
              <mesh geometry={geometry} position={[0, 0.03, 0]} renderOrder={10}>
                <meshBasicMaterial color={SELECT_COLOR} transparent opacity={0.32} depthWrite={false} />
              </mesh>
            )}
            {showCeilings && room.ceilingSurface && !room.openToSky && (
              <mesh
                geometry={geometry}
                material={pick(materials, room.ceilingSurface.materialId)}
                position={[0, floor.floorHeight * MM, 0]}
                // flat ShapeGeometry: render the underside of the slab
                onClick={onSelect({ type: 'room', id: room.id })}
                material-side={THREE.DoubleSide}
              />
            )}
          </group>
        );
      })}
    </>
  );
}

function StairMeshes({ floor, materials }: { floor: Floor; materials: FloorContentProps['materials'] }) {
  const { onSelect, isSelected } = useSelect();
  const stairs = useMemo(
    () =>
      floor.stairs.map((stair) => ({
        stair,
        geometry: bufferDataToGeometry(prismsToBuffers(buildStair(stair).prisms)),
      })),
    [floor.stairs],
  );
  return (
    <>
      {stairs.map(({ stair, geometry }) => (
        <mesh
          key={stair.id}
          geometry={geometry}
          material={pick(materials, stair.materialId)}
          castShadow
          receiveShadow
          onClick={onSelect({ type: 'stair', id: stair.id })}
        >
          {isSelected(stair.id) && <Edges scale={1.002} color={SELECT_COLOR} lineWidth={2} />}
        </mesh>
      ))}
    </>
  );
}

function FurnitureMeshes({
  floor,
  materials,
  elevation,
}: {
  floor: Floor;
  materials: FloorContentProps['materials'];
  elevation: number;
}) {
  const { onSelect, isSelected } = useSelect();
  // Drag-to-move only in the real editor — when a PickProvider override is
  // present (tracing/verify 3D preview) selection is local, so we keep furniture
  // static there rather than committing transform patches to the main store.
  const override = useContext(PickProvider);
  const selection = useEditor((s) => s.selection);
  const selectedId = override ? override.selectedId : (selection?.id ?? null);
  const { data: assets } = useQuery({ queryKey: ['asset-manifest'], queryFn: fetchAssetManifest, staleTime: Infinity });
  const models = useMemo(() => assets?.models ?? {}, [assets]);

  // Batch identical PROCEDURAL pieces into InstancedMeshes; render everything else
  // individually. The selected/dragged piece, glTF-backed pieces, and the tracing
  // preview (override) ALWAYS render individually, so selection / drag / glTF /
  // local-pick are never touched by instancing.
  const { batches, individual } = useMemo(
    () =>
      partitionForInstancing(floor.objects, {
        isGltf: (o) => !!(o.assetRef && models[o.assetRef]),
        selectedId,
        preview: !!override,
        min: INSTANCE_MIN,
      }),
    [floor.objects, models, override, selectedId],
  );

  const renderOne = (obj: FurnitureObject) => {
    const selected = isSelected(obj.id);
    const procedural = <ProceduralFurniture object={obj} materials={materials} selected={selected} />;
    const model = obj.assetRef ? models[obj.assetRef] : undefined;
    const visual = model ? (
      // CC0 glTF if it's in the cache; both Suspense (loading) and the
      // error boundary (parse/network failure) fall back to procedural.
      <GltfErrorBoundary fallback={procedural}>
        <Suspense fallback={procedural}>
          <GltfFurniture url={assetUrl(model.file)} object={obj} />
        </Suspense>
      </GltfErrorBoundary>
    ) : (
      procedural
    );
    // The selected piece becomes click-drag movable: DraggableFurniture applies
    // its own position/rotation and commits ONE transform_object patch on release.
    if (selected && !override) {
      return (
        <DraggableFurniture key={obj.id} object={obj} floor={floor} floorElevation={elevation}>
          {visual}
        </DraggableFurniture>
      );
    }
    return (
      <group
        key={obj.id}
        position={[obj.transform.x * MM, obj.transform.elevation * MM, -obj.transform.y * MM]}
        rotation={[0, obj.transform.rotationY, 0]}
        onClick={onSelect({ type: 'furniture', id: obj.id })}
      >
        {visual}
      </group>
    );
  };

  return (
    <>
      {batches.map((b) => (
        <InstancedFurniture
          key={b.key}
          rep={b.rep}
          instances={b.instances}
          materials={materials}
          onPick={(id, e) => onSelect({ type: 'furniture', id })(e)}
        />
      ))}
      {individual.map(renderOne)}
    </>
  );
}

function FloorLights({ floor }: { floor: Floor }) {
  return (
    <>
      {floor.lights.map((light) => {
        if (light.kind === 'sun') {
          const p = light.position ?? { x: -4000, y: -6000, elevation: 8000 };
          return (
            <directionalLight
              key={light.id}
              position={[p.x * MM, p.elevation * MM, -p.y * MM]}
              intensity={light.intensity}
              color={light.color}
              castShadow={light.castShadow}
              shadow-mapSize={[2048, 2048]}
              shadow-camera-left={-12}
              shadow-camera-right={12}
              shadow-camera-top={12}
              shadow-camera-bottom={-12}
              shadow-camera-far={40}
              shadow-bias={-0.0004}
            />
          );
        }
        if (light.kind === 'ambient') {
          return <ambientLight key={light.id} intensity={light.intensity} color={light.color} />;
        }
        const p = light.position;
        if (!p) return null;
        return (
          <pointLight
            key={light.id}
            position={[p.x * MM, p.elevation * MM, -p.y * MM]}
            intensity={light.intensity}
            color={light.color}
            castShadow={false}
            distance={8}
            decay={1.8}
          />
        );
      })}
    </>
  );
}

export function FloorContent({ floor, elevation, materials }: FloorContentProps) {
  return (
    <group position={[0, elevation * MM, 0]}>
      <WallMeshes floor={floor} materials={materials} />
      <RoomSurfaces floor={floor} materials={materials} />
      <StairMeshes floor={floor} materials={materials} />
      <FurnitureMeshes floor={floor} materials={materials} elevation={elevation} />
      <FloorLights floor={floor} />
    </group>
  );
}
