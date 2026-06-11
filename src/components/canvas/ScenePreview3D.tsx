import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei';
import { EffectComposer, N8AO, SMAA } from '@react-three/postprocessing';
import { useQuery } from '@tanstack/react-query';
import type { AssetCacheManifest } from '@lib/assets/manifest';
import type { HomeScene } from '@lib/scene/schemas';
import { assetUrl, fetchAssetManifest } from '../../api';
import { FloorContent, PickProvider } from './FloorContent';
import { useMaterialMap } from './materials';

const MM = 0.001;
const EMPTY_MANIFEST: AssetCacheManifest = { schemaVersion: 1, downloadedAt: '', hdris: {}, textures: {}, models: {} };

/**
 * Self-contained dollhouse 3D of one floor, driven by a passed scene (not the
 * editor store) — so the tracing wizard can show the geometry update live as
 * you drag walls/rooms. One commit per gesture rebuilds the meshes.
 */
export function ScenePreview3D({
  scene,
  floorId,
  lockCamera = false,
  onPick,
  selectedId = null,
}: {
  scene: HomeScene;
  floorId: string;
  /** Disable orbit controls so a before/after pair stays framed identically. */
  lockCamera?: boolean;
  /** Route 3D clicks to a local selection (e.g. the tracing wizard's). */
  onPick?: (id: string) => void;
  selectedId?: string | null;
}) {
  const { data: assets } = useQuery({ queryKey: ['asset-manifest'], queryFn: fetchAssetManifest, staleTime: Infinity });
  const manifest = assets ?? EMPTY_MANIFEST;
  const materials = useMaterialMap(scene, manifest);
  const floor = scene.floors.find((f) => f.id === floorId) ?? scene.floors[0] ?? null;

  const { center, span } = useMemo(() => {
    let maxX = -Infinity, maxY = -Infinity, minX = Infinity, minY = Infinity;
    for (const w of floor?.walls ?? []) {
      for (const p of w.path.pts) {
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      }
    }
    if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 4000; maxY = 4000; }
    return {
      center: new THREE.Vector3(((minX + maxX) / 2) * MM, 0, (-(minY + maxY) / 2) * MM),
      span: Math.max(maxX - minX, maxY - minY, 4000) * MM,
    };
  }, [floor]);

  if (!floor) return null;
  const hdri = manifest.hdris['interior_day']?.file ?? Object.values(manifest.hdris)[0]?.file ?? null;
  const d = Math.max(8, span);

  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      camera={{ fov: 45, position: [center.x + d * 0.8, d * 0.85, center.z + d * 0.8] }}
      gl={{ antialias: true }}
      onCreated={({ gl, camera }) => {
        gl.toneMapping = THREE.AgXToneMapping;
        gl.toneMappingExposure = 1.1;
        // With orbit controls disabled (before/after compare) nothing aims the
        // camera, so point it at the house centre — otherwise it looks at the
        // world origin and the house drifts to a corner / off-frame.
        if (lockCamera) camera.lookAt(center.x, 0, center.z);
      }}
      style={{ background: '#13141b' }}
    >
      <Suspense fallback={null}>
        {hdri ? (
          <Environment files={assetUrl(hdri)} environmentIntensity={0.7} />
        ) : (
          <Environment resolution={128} environmentIntensity={0.8}>
            <Lightformer intensity={2.2} color="#dfe8ff" position={[0, 5, -9]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
            <Lightformer intensity={1.4} color="#ffe8c4" position={[-5, 1.5, 1]} rotation-y={Math.PI / 2} scale={[6, 2, 1]} />
          </Environment>
        )}
        <ambientLight intensity={0.3} color="#e8eaff" />
        {onPick ? (
          <PickProvider.Provider value={{ onPick, selectedId }}>
            <FloorContent floor={floor} elevation={0} materials={materials} />
          </PickProvider.Provider>
        ) : (
          <FloorContent floor={floor} elevation={0} materials={materials} />
        )}
        <ContactShadows position={[center.x, 0.004, center.z]} scale={span * 1.6} opacity={0.32} blur={2.2} far={3} />
        <Grid position={[0, -0.012, 0]} args={[60, 60]} cellSize={0.5} cellThickness={0.6} cellColor="#262a38" sectionSize={2.5} sectionThickness={1} sectionColor="#3b4150" infiniteGrid fadeDistance={42} fadeStrength={1.2} />
        {!lockCamera && (
          <OrbitControls makeDefault target={center} maxPolarAngle={Math.PI / 2 - 0.02} minDistance={1.5} maxDistance={Math.max(40, span * 3)} />
        )}
        <EffectComposer multisampling={0}>
          <N8AO halfRes aoRadius={0.9} intensity={2.2} distanceFalloff={0.6} />
          <SMAA />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}
