import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  Grid,
  Lightformer,
  MapControls,
  OrbitControls,
} from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, SMAA, Vignette } from '@react-three/postprocessing';
import { useQuery } from '@tanstack/react-query';
import { floorElevation } from '@lib/scene/selectors';
import type { HomeScene } from '@lib/scene/schemas';
import { computeTourStops } from '@lib/tour';
import { fetchAssetManifest, assetUrl } from '../../api';
import { useEditor } from '../../store/editor-store';
import { FloorContent } from './FloorContent';
import { TourController } from './TourController';
import { WalkControls } from './WalkControls';
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

/**
 * Photo Mode v1 — exports a PNG of the EXISTING interactive render (AgX + IBL +
 * N8AO + Bloom, all baked in because we read the post-composer CANVAS, not the
 * raw scene). Lives inside <Canvas> to reach the renderer via useThree, and
 * bridges an imperative capture fn out through the store so a toolbar button
 * (outside the Canvas) can trigger it.
 *
 * Resolution = the canvas drawing buffer (CSS size × device pixel ratio), so on
 * a retina display it's already ~2×. NB: we intentionally do NOT bump
 * gl.setPixelRatio to "supersample" — the @react-three/postprocessing
 * EffectComposer sizes its internal targets from R3F's logical size and would
 * NOT rebuild them for a one-off ratio change, so that only upscales a low-res
 * render. True supersampling needs a dedicated offscreen composer (documented
 * Photo-Mode enhancement, see photomode/types.ts).
 */
function PhotoCapture() {
  const gl = useThree((s) => s.gl);
  const advance = useThree((s) => s.advance);
  const setCapturePhoto = useEditor((s) => s.setCapturePhoto);

  useEffect(() => {
    const capture = async () => {
      advance(performance.now()); // force a fresh, fully-composited frame
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const blob = await new Promise<Blob | null>((res) => gl.domElement.toBlob((b) => res(b), 'image/png'));
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `homecanvas-${Date.now()}.png`;
      a.click();
      // Defer revoke: revoking synchronously after click() can abort the
      // download in Firefox/WebKit before the blob is read.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    setCapturePhoto(capture);
    return () => setCapturePhoto(null);
  }, [gl, advance, setCapturePhoto]);

  return null;
}

function CameraRig({ scene }: { scene: HomeScene }) {
  const viewMode = useEditor((s) => s.viewMode);
  const camera = useThree((s) => s.camera);

  const { center, span } = useMemo(() => {
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
    return {
      center: new THREE.Vector3((maxX / 2) * MM, 0, (-maxY / 2) * MM),
      span: Math.max(maxX, maxY) * MM,
    };
  }, [scene]);

  useEffect(() => {
    // Frame by scene size so larger homes don't clip the camera into a wall.
    const d = Math.max(8, span);
    if (viewMode === 'top') {
      camera.position.set(center.x, d * 1.4, center.z + 0.01);
      camera.lookAt(center);
    } else if (viewMode === 'orbit') {
      camera.position.set(center.x + d * 0.75, d * 0.7, center.z + d * 0.75);
      camera.lookAt(center);
    } else {
      camera.position.set(center.x, 1.6, center.z);
    }
  }, [viewMode, camera, center, span]);

  if (viewMode === 'tour') return null; // TourController owns the camera
  if (viewMode === 'walk') return null; // WalkControls owns the camera (drag-look + WASD)
  if (viewMode === 'top') {
    return <MapControls makeDefault target={center} enableRotate={false} />;
  }
  return <OrbitControls makeDefault target={center} maxPolarAngle={Math.PI / 2 - 0.02} minDistance={1.5} maxDistance={Math.max(40, span * 3)} />;
}

export function SceneCanvas() {
  const scene = useEditor((s) => (s.showBefore ? s.baseline : s.scene));
  const activeFloorId = useEditor((s) => s.activeFloorId);
  const select = useEditor((s) => s.select);
  const { data: assets } = useQuery({ queryKey: ['asset-manifest'], queryFn: fetchAssetManifest, staleTime: Infinity });

  const assetManifest = assets ?? { schemaVersion: 1 as const, downloadedAt: '', hdris: {}, textures: {}, models: {} };
  const materials = useMaterialMap(scene, assetManifest);

  const viewMode = useEditor((s) => s.viewMode);
  const tourStops = useMemo(
    () => (scene && activeFloorId ? computeTourStops(scene, activeFloorId) : []),
    [scene, activeFloorId],
  );

  // Walk mode starts at the plan-space center of the home (mm), facing +plan.y.
  // WalkControls drives the camera from here with drag-look + WASD.
  const walkStart = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    for (const f of scene?.floors ?? [])
      for (const w of f.walls)
        for (const p of w.path.pts) {
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
    return { x: maxX / 2, y: maxY / 2, yaw: 0 };
  }, [scene]);

  if (!scene) return null;
  const floors = scene.floors.filter((f) => f.id === activeFloorId);
  const hdri = assetManifest.hdris['interior_day']?.file ?? Object.values(assetManifest.hdris)[0]?.file ?? null;

  return (
    <Canvas
      // PCF (not PCFSoft/PCSS): drei's SoftShadows PCSS injection is broken
      // against three r184 (unpackRGBAToDepth removed) and PCFSoft is deprecated.
      shadows={{ type: THREE.PCFShadowMap }}
      camera={{ fov: 45, position: [12, 9, 12] }}
      // preserveDrawingBuffer lets Photo Mode read the post-composer buffer back
      // for a PNG; it must be set at context creation (can't be toggled live).
      gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.AgXToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
      onPointerMissed={() => select(null)}
      style={{ background: '#13141b' }}
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
        {viewMode !== 'walk' && (
          <Grid
            position={[0, -0.012, 0]}
            args={[60, 60]}
            cellSize={0.5}
            cellThickness={0.6}
            cellColor="#262a38"
            sectionSize={2.5}
            sectionThickness={1}
            sectionColor="#3b4150"
            infiniteGrid
            fadeDistance={44}
            fadeStrength={1.2}
          />
        )}
        <CameraRig scene={scene} />
        <PhotoCapture />
        {viewMode === 'walk' && <WalkControls start={walkStart} />}
        {viewMode === 'tour' && tourStops.length > 0 && <TourController stops={tourStops} />}
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
