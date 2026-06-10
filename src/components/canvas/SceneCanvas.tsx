import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  Lightformer,
  MapControls,
  OrbitControls,
  PointerLockControls,
} from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, SMAA, Vignette } from '@react-three/postprocessing';
import { useQuery } from '@tanstack/react-query';
import { floorElevation } from '@lib/scene/selectors';
import type { HomeScene } from '@lib/scene/schemas';
import { fetchAssetManifest, assetUrl } from '../../api';
import { useEditor } from '../../store/editor-store';
import { FloorContent } from './FloorContent';
import { useMaterialMap } from './materials';

const MM = 0.001;

function SceneEnvironment({ hdriFile }: { hdriFile: string | null }) {
  if (hdriFile) {
    return <Environment files={assetUrl(hdriFile)} environmentIntensity={0.7} />;
  }
  // Zero-download fallback: procedural light box (soft sky + warm window panels).
  return (
    <Environment resolution={128} environmentIntensity={0.8}>
      <color attach="background" args={['#1c1e22']} />
      <Lightformer intensity={2.2} color="#dfe8ff" position={[0, 5, -9]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
      <Lightformer intensity={1.6} color="#ffe8c4" position={[-5, 1.5, 1]} rotation-y={Math.PI / 2} scale={[6, 2, 1]} />
      <Lightformer intensity={1.2} color="#fff4e0" position={[5, 1.5, -1]} rotation-y={-Math.PI / 2} scale={[6, 2, 1]} />
    </Environment>
  );
}

function CameraRig({ scene }: { scene: HomeScene }) {
  const viewMode = useEditor((s) => s.viewMode);
  const camera = useThree((s) => s.camera);

  const center = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    for (const floor of scene.floors) {
      for (const wall of floor.walls) {
        for (const p of wall.path.pts) {
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
      }
    }
    return new THREE.Vector3((maxX / 2) * MM, 0, (-maxY / 2) * MM);
  }, [scene]);

  useEffect(() => {
    if (viewMode === 'top') {
      camera.position.set(center.x, 22, center.z + 0.01);
      camera.lookAt(center);
    } else if (viewMode === 'orbit') {
      camera.position.set(center.x + 9, 8, center.z + 9);
      camera.lookAt(center);
    } else {
      camera.position.set(center.x, 1.6, center.z);
    }
  }, [viewMode, camera, center]);

  if (viewMode === 'top') {
    return <MapControls makeDefault target={center} enableRotate={false} />;
  }
  if (viewMode === 'walk') {
    return <PointerLockControls makeDefault selector="#walk-start" />;
  }
  return <OrbitControls makeDefault target={center} maxPolarAngle={Math.PI / 2 - 0.02} minDistance={1.5} maxDistance={40} />;
}

export function SceneCanvas() {
  const scene = useEditor((s) => (s.showBefore ? s.baseline : s.scene));
  const activeFloorId = useEditor((s) => s.activeFloorId);
  const select = useEditor((s) => s.select);
  const { data: assets } = useQuery({ queryKey: ['asset-manifest'], queryFn: fetchAssetManifest, staleTime: Infinity });

  const assetManifest = assets ?? { schemaVersion: 1 as const, downloadedAt: '', hdris: {}, textures: {} };
  const materials = useMaterialMap(scene, assetManifest);

  if (!scene) return null;
  const floors = scene.floors.filter((f) => f.id === activeFloorId);
  const hdri = assetManifest.hdris['interior_day']?.file ?? Object.values(assetManifest.hdris)[0]?.file ?? null;

  return (
    <Canvas
      // PCF (not PCFSoft/PCSS): drei's SoftShadows PCSS injection is broken
      // against three r184 (unpackRGBAToDepth removed) and PCFSoft is deprecated.
      shadows={{ type: THREE.PCFShadowMap }}
      camera={{ fov: 45, position: [12, 9, 12] }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.AgXToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
      onPointerMissed={() => select(null)}
      style={{ background: '#101013' }}
    >
      <Suspense fallback={null}>
        <SceneEnvironment hdriFile={hdri} />
        <ambientLight intensity={0.25} color="#e8eaff" />
        {floors.map((floor) => (
          <FloorContent
            key={floor.id}
            floor={floor}
            elevation={floorElevation(scene, floor.id)}
            materials={materials}
          />
        ))}
        <ContactShadows position={[5.4, 0.005, -4.2]} scale={18} opacity={0.35} blur={2.2} far={3} />
        <CameraRig scene={scene} />
        <EffectComposer multisampling={0}>
          <N8AO halfRes aoRadius={0.9} intensity={2.4} distanceFalloff={0.6} />
          <SMAA />
          <Bloom intensity={0.18} luminanceThreshold={1.1} mipmapBlur />
          <Vignette eskil={false} offset={0.18} darkness={0.55} />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}
