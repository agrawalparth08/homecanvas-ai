import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useQuery } from '@tanstack/react-query';
import type { AssetCacheManifest } from '@lib/assets/manifest';
import type { HomeScene } from '@lib/scene/schemas';
import { assetUrl, fetchAssetManifest } from '../../api';
import { useEditor } from '../../store/editor-store';
import { reportError } from '../../store/error-store';
import { FloorContent } from './FloorContent';
import { useMaterialMap } from './materials';

const MM = 0.001;
const MAX_SAMPLES = 400;
const MIN_SAVE_SAMPLES = 24; // don't let the user export a still that's still noisy

/**
 * Photoreal Photo Mode — a progressive GPU path tracer (three-gpu-pathtracer)
 * over a DEDICATED canvas, isolated from the interactive view. Loaded only when
 * opened. Orbit to reframe (accumulation resets), watch samples climb, then save
 * the still. Needs a downloaded HDRI for lighting (npm run fetch:assets).
 */
function sceneBounds(scene: HomeScene, floorId: string) {
  const floor = scene.floors.find((f) => f.id === floorId) ?? scene.floors[0]!;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of floor.walls) for (const p of w.path.pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 4000; maxY = 4000; }
  return {
    floor,
    center: new THREE.Vector3(((minX + maxX) / 2) * MM, 0, (-(minY + maxY) / 2) * MM),
    span: Math.max(maxX - minX, maxY - minY, 4000) * MM,
  };
}

function TraceContent({ scene, floorId, manifest }: { scene: HomeScene; floorId: string; manifest: AssetCacheManifest }) {
  const materials = useMaterialMap(scene, manifest);
  const floor = scene.floors.find((f) => f.id === floorId) ?? scene.floors[0]!;
  return <FloorContent floor={floor} elevation={0} materials={materials} />;
}

function PathTracerDriver({
  hdriUrl,
  onState,
  registerCapture,
}: {
  hdriUrl: string | null;
  onState: (s: { samples: number; ready: boolean }) => void;
  registerCapture: (fn: (() => void) | null) => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const ptRef = useRef<{
    renderSample: () => void;
    updateCamera: () => void;
    setScene: (s: THREE.Scene, c: THREE.Camera) => void;
    samples: number;
    bounces: number;
    renderScale: number;
    dispose?: () => void;
  } | null>(null);
  const lastMat = useRef(new THREE.Matrix4());
  const lastSamples = useRef(-1);

  useEffect(() => {
    let disposed = false;
    let pt: typeof ptRef.current = null;
    let hdriTex: THREE.Texture | null = null;
    const prevEnv = scene.environment;
    const prevBg = scene.background;
    const mgr = THREE.DefaultLoadingManager;
    const prevOnLoad = mgr.onLoad;
    let rafId = 0;

    // Re-bake the BVH + material atlas whenever async assets (textures via
    // non-suspending TextureLoader, glTF furniture via GLTFLoader) finish
    // loading — otherwise the first setScene captures a half-loaded scene and
    // the path-traced image permanently misses textures/furniture.
    const rebake = () => {
      if (pt && !disposed) {
        pt.setScene(scene, camera); // resets accumulation
        lastMat.current.copy(camera.matrixWorld);
        lastSamples.current = -1;
      }
    };
    mgr.onLoad = () => {
      prevOnLoad?.();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(rebake); // next frame: after React commits new meshes
    };

    void (async () => {
      try {
        const [{ WebGLPathTracer }, rgbe] = await Promise.all([
          import('three-gpu-pathtracer'),
          hdriUrl ? import('three/examples/jsm/loaders/RGBELoader.js') : Promise.resolve(null),
        ]);
        if (disposed) return;
        if (rgbe && hdriUrl) {
          hdriTex = await new rgbe.RGBELoader().loadAsync(hdriUrl);
          if (disposed) { hdriTex.dispose(); return; }
          hdriTex.mapping = THREE.EquirectangularReflectionMapping;
          scene.environment = hdriTex;
          scene.background = hdriTex;
        }
        if (disposed) return;
        const tracer = new WebGLPathTracer(gl) as unknown as NonNullable<typeof ptRef.current>;
        tracer.bounces = 5;
        tracer.renderScale = 1;
        tracer.setScene(scene, camera);
        if (disposed) { tracer.dispose?.(); return; }
        pt = tracer;
        ptRef.current = tracer;
        lastMat.current.copy(camera.matrixWorld);
        onState({ samples: 0, ready: true });
        registerCapture(() => {
          gl.domElement.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `homecanvas-photo-${Date.now()}.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }, 'image/png');
        });
      } catch (e) {
        // Surface as a toast (a dead Photo Mode is user-visible) — reportError
        // also dev-traces it to the console + window.__homecanvasErrors.
        reportError('Photo Mode failed to start', {
          kind: 'render',
          detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
        });
        onState({ samples: 0, ready: false });
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      mgr.onLoad = prevOnLoad;
      ptRef.current?.dispose?.();
      pt?.dispose?.();
      ptRef.current = null;
      hdriTex?.dispose();
      scene.environment = prevEnv;
      scene.background = prevBg;
      registerCapture(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Priority > 0 takes over the render loop from R3F.
  useFrame(() => {
    const pt = ptRef.current;
    if (!pt) return;
    // R3F doesn't refresh matrices when a priority>0 frame owns the loop, so
    // OrbitControls' position changes wouldn't reach matrixWorld and the camera
    // move would go undetected (the image stays frozen on rotate). Update it
    // ourselves so any view change resets accumulation and re-renders.
    camera.updateMatrixWorld();
    if (!camera.matrixWorld.equals(lastMat.current)) {
      lastMat.current.copy(camera.matrixWorld);
      pt.updateCamera();
    }
    if (pt.samples < MAX_SAMPLES) {
      pt.renderSample();
      const s = Math.round(pt.samples);
      if (s !== lastSamples.current) {
        lastSamples.current = s;
        onState({ samples: s, ready: true });
      }
    }
  }, 1);

  return null;
}

type CamPreset = 'iso' | 'top' | 'front';

/**
 * Repositions the path-tracer camera to a preset angle (the raster orbit/top/walk
 * buttons don't drive this dedicated canvas). Moving the camera resets the tracer
 * accumulation via PathTracerDriver's matrixWorld check. Free-drag still orbits.
 */
function CameraRig({ preset, center, dist }: { preset: CamPreset; center: THREE.Vector3; dist: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    const pos =
      preset === 'top'
        ? new THREE.Vector3(center.x, center.y + dist * 1.4, center.z + 0.001)
        : preset === 'front'
          ? new THREE.Vector3(center.x, center.y + dist * 0.35, center.z + dist * 1.15)
          : new THREE.Vector3(center.x + dist * 0.7, center.y + dist * 0.6, center.z + dist * 0.7);
    camera.position.copy(pos);
    if (controls) {
      controls.target.copy(center);
      controls.update();
    } else {
      camera.lookAt(center);
    }
  }, [preset, center, dist, camera, controls]);
  return null;
}

export function PhotoMode() {
  const scene = useEditor((s) => s.scene);
  const activeFloorId = useEditor((s) => s.activeFloorId);
  const close = useEditor((s) => s.setPhotoMode);
  const { data: manifest } = useQuery({ queryKey: ['asset-manifest'], queryFn: fetchAssetManifest, staleTime: Infinity });
  const [{ samples, ready }, setState] = useState<{ samples: number; ready: boolean }>({ samples: 0, ready: false });
  const [preset, setPreset] = useState<CamPreset>('iso');
  const captureRef = useRef<(() => void) | null>(null);

  const floorId = activeFloorId ?? scene?.floors[0]?.id ?? '';
  const { center, span } = useMemo(
    () => (scene ? sceneBounds(scene, floorId) : { center: new THREE.Vector3(), span: 8 }),
    [scene, floorId],
  );
  if (!scene) return null;
  const m = manifest ?? { schemaVersion: 1 as const, downloadedAt: '', hdris: {}, textures: {}, models: {} };
  const hdri = m.hdris['interior_day']?.file ?? Object.values(m.hdris)[0]?.file ?? null;
  const hdriUrl = hdri ? assetUrl(hdri) : null;
  const d = Math.max(8, span);

  return (
    <div className="absolute inset-0 z-30 bg-black">
      <Canvas
        gl={{ antialias: false, preserveDrawingBuffer: true }}
        camera={{ fov: 45, position: [center.x + d * 0.7, d * 0.6, center.z + d * 0.7] }}
      >
        <Suspense fallback={null}>
          <TraceContent scene={scene} floorId={floorId} manifest={m} />
          <PathTracerDriver hdriUrl={hdriUrl} onState={setState} registerCapture={(fn) => (captureRef.current = fn)} />
        </Suspense>
        <OrbitControls makeDefault target={center} maxPolarAngle={Math.PI / 2 - 0.02} />
        <CameraRig preset={preset} center={center} dist={d} />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
        <span className="pointer-events-auto rounded-md bg-black/60 px-3 py-1.5 text-xs text-white">
          {!ready ? 'Building path tracer…' : `Photoreal · ${samples}/${MAX_SAMPLES} samples${samples >= MAX_SAMPLES ? ' · converged' : '…'}`}
          {!hdriUrl && ' · no HDRI (run npm run fetch:assets for lighting)'}
        </span>
        {/* Camera angle presets — the raster orbit/top/walk/tour buttons don't drive
            this path-traced canvas. Free-drag still orbits. */}
        <div className="pointer-events-auto flex items-center gap-1 rounded-md bg-black/60 p-1">
          <span className="px-1 text-[11px] text-white/60">View</span>
          {(
            [
              ['iso', 'Angled'],
              ['top', 'Top'],
              ['front', 'Front'],
            ] as const
          ).map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`rounded px-2.5 py-1 text-xs ${preset === p ? 'bg-white text-neutral-100' : 'text-white/85 hover:bg-white/15'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button
            onClick={() => captureRef.current?.()}
            disabled={!ready || samples < MIN_SAVE_SAMPLES}
            title={
              samples < MIN_SAVE_SAMPLES
                ? `Let it refine first (${samples}/${MIN_SAVE_SAMPLES})`
                : 'Save the converged still as a PNG'
            }
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/85 disabled:bg-black/45 disabled:text-white/55"
          >
            {samples < MIN_SAVE_SAMPLES && ready ? `Save photo (${samples}/${MIN_SAVE_SAMPLES})` : 'Save photo'}
          </button>
          <button onClick={() => close(false)} className="rounded-md bg-black/60 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/75">
            Exit Photo Mode
          </button>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-white/50">
        Drag to orbit · the image refines as samples accumulate
      </div>
    </div>
  );
}
