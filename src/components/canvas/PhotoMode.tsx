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
import { Icon } from '../ui/Icon';
import { FOCUS_RING, Mono, Slider, SectionLabel } from '../ui/primitives';
import { FloorContent } from './FloorContent';
import { useMaterialMap } from './materials';

const MM = 0.001;
const DEFAULT_SAMPLES_TARGET = 400;
const DEFAULT_BOUNCES = 5;
const DEFAULT_EXPOSURE = 1;
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
  bounces,
  samplesTarget,
  redrawEpoch = 0,
  onState,
  registerCapture,
}: {
  hdriUrl: string | null;
  bounces: number;
  samplesTarget: number;
  /** Bump to force ONE extra sample after convergence (e.g. exposure changed —
   *  tone mapping applies at blit, so a converged, no-longer-sampling image
   *  would never show the new value without a nudge). */
  redrawEpoch?: number;
  onState: (s: { samples: number; ready: boolean }) => void;
  registerCapture: (fn: (() => void) | null) => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  // Raising the samples target mid-render must NOT reset accumulation, so the
  // render loop reads it from a ref kept in sync by prop — not from the prop
  // directly (which would re-trigger effects/remounts elsewhere).
  const samplesTargetRef = useRef(samplesTarget);
  useEffect(() => {
    samplesTargetRef.current = samplesTarget;
  }, [samplesTarget]);
  const redrawRef = useRef(redrawEpoch);
  const lastRedraw = useRef(redrawEpoch);
  useEffect(() => {
    redrawRef.current = redrawEpoch;
  }, [redrawEpoch]);
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
        tracer.bounces = bounces;
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
    // A bumped redraw epoch (exposure change) forces one blit even after
    // convergence — otherwise the slider looks dead on a finished render.
    const needsRedraw = redrawRef.current !== lastRedraw.current;
    if (needsRedraw) lastRedraw.current = redrawRef.current;
    if (needsRedraw || pt.samples < samplesTargetRef.current) {
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

/** Applies exposure to the renderer live, every frame the value changes — no rebuild. */
function ExposureRig({ exposure }: { exposure: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  return null;
}

/** Reports the canvas's actual drawing-buffer resolution for the settings-panel footer. */
function ResolutionRig({ onResolution }: { onResolution: (w: number, h: number) => void }) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  useEffect(() => {
    onResolution(gl.domElement.width, gl.domElement.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, size.width, size.height]);
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

  // Render settings — samplesTarget/hdriKey/bounces drive the panel below.
  const [samplesTarget, setSamplesTarget] = useState(DEFAULT_SAMPLES_TARGET);
  const [hdriKey, setHdriKey] = useState<string | null>(null); // null = auto-pick from manifest
  const [bounces, setBounces] = useState(DEFAULT_BOUNCES);
  const [exposure, setExposure] = useState(DEFAULT_EXPOSURE);
  const [panelOpen, setPanelOpen] = useState(false);
  const [resolution, setResolution] = useState({ w: 0, h: 0 });
  const onResolution = (w: number, h: number) =>
    setResolution((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));

  const floorId = activeFloorId ?? scene?.floors[0]?.id ?? '';
  const { center, span } = useMemo(
    () => (scene ? sceneBounds(scene, floorId) : { center: new THREE.Vector3(), span: 8 }),
    [scene, floorId],
  );
  if (!scene) return null;
  const m = manifest ?? { schemaVersion: 1 as const, downloadedAt: '', hdris: {}, textures: {}, models: {} };
  const hdriKeys = Object.keys(m.hdris);
  const defaultHdriKey = m.hdris['interior_day'] ? 'interior_day' : (hdriKeys[0] ?? null);
  const activeHdriKey = hdriKey && m.hdris[hdriKey] ? hdriKey : defaultHdriKey;
  const hdri = activeHdriKey ? m.hdris[activeHdriKey]!.file : null;
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
          {/* Remounted (via key) when HDRI or bounce count change — both only take
              effect on tracer rebuild. Samples target is a live prop instead: it
              flows into a ref inside the driver so raising it never resets the
              in-progress accumulation. */}
          <PathTracerDriver
            key={`${hdriUrl ?? 'none'}-${bounces}`}
            hdriUrl={hdriUrl}
            bounces={bounces}
            samplesTarget={samplesTarget}
            redrawEpoch={exposure}
            onState={setState}
            registerCapture={(fn) => (captureRef.current = fn)}
          />
        </Suspense>
        <OrbitControls makeDefault target={center} maxPolarAngle={Math.PI / 2 - 0.02} />
        <CameraRig preset={preset} center={center} dist={d} />
        <ExposureRig exposure={exposure} />
        <ResolutionRig onResolution={onResolution} />
      </Canvas>

      {/* top bar — passthrough so drag-to-orbit works through the empty regions;
          interactive children re-enable pointer events. Right-padded on lg+ so
          nothing sits under the always-on settings panel. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2.5 p-3.5 lg:pr-[316px]">
        <button
          onClick={() => close(false)}
          className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-[10px] bg-white/10 px-3 py-2 text-[13px] font-semibold text-white backdrop-blur transition hover:bg-white/20 ${FOCUS_RING}`}
        >
          <Icon name="chevronLeft" className="text-[15px]" strokeWidth={2.2} /> Back to editor
        </button>
        <span className="inline-flex items-center gap-2 text-[15px] font-bold text-white">
          <Icon name="camera" className="text-[17px]" /> Photo Mode
        </span>
        <span className="flex-1" />
        {/* Camera angle presets — the raster orbit/top/walk/tour buttons don't drive
            this path-traced canvas. Free-drag still orbits. */}
        <div className="pointer-events-auto flex gap-0.5 rounded-[10px] bg-white/10 p-1 backdrop-blur">
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
              className={`rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold transition ${FOCUS_RING} ${
                preset === p ? 'bg-accent text-white' : 'text-white/70 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => captureRef.current?.()}
          disabled={!ready || samples < MIN_SAVE_SAMPLES}
          title={
            samples < MIN_SAVE_SAMPLES ? `Let it refine first (${samples}/${MIN_SAVE_SAMPLES})` : 'Save the converged still as a PNG'
          }
          className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#403bd6] disabled:opacity-45 ${FOCUS_RING}`}
        >
          <Icon name="save" className="text-[15px]" />
          {samples < MIN_SAVE_SAMPLES && ready ? `Save PNG (${samples}/${MIN_SAVE_SAMPLES})` : 'Save PNG'}
        </button>
        {/* Settings toggle — only needed <lg, where the panel becomes an overlay sheet. */}
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-[10px] bg-white/10 px-3 py-2 text-[13px] font-semibold text-white backdrop-blur transition hover:bg-white/20 lg:hidden ${FOCUS_RING}`}
        >
          <Icon name="aperture" className="text-[15px]" /> Render
        </button>
      </div>

      {/* converging badge */}
      <span className="pointer-events-none absolute bottom-14 left-4 inline-flex items-center gap-2 rounded-[9px] bg-[rgba(20,22,32,0.7)] px-3 py-2 font-mono text-[12px] font-semibold text-white backdrop-blur">
        <span className={`h-2 w-2 rounded-full ${samples >= samplesTarget ? 'bg-ok' : 'bg-warn hc-pulse-dot'}`} />
        {!ready ? 'Building path tracer…' : `Photoreal · ${samples} / ${samplesTarget} samples`}
        {!hdriUrl && ' · no HDRI'}
      </span>

      {/* progress — right-edged clear of the settings panel on lg+ */}
      <div className="pointer-events-none absolute bottom-5 left-6 right-6 flex items-center gap-3.5 lg:right-[316px]">
        <span className="block h-[5px] flex-1 overflow-hidden rounded-full bg-white/15">
          <span
            className="block h-full rounded-full bg-accent transition-all"
            style={{ width: `${Math.min(100, (samples / samplesTarget) * 100)}%` }}
          />
        </span>
        <span className="font-mono text-[11.5px] text-white/55">
          {!ready ? 'starting…' : samples >= samplesTarget ? 'converged' : 'refining…'}
        </span>
      </div>

      {/* settings panel — pinned right on lg+, a toggleable overlay sheet below it */}
      {panelOpen && (
        <button
          onClick={() => setPanelOpen(false)}
          aria-label="Close render settings"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}
      <div className={`absolute inset-y-0 right-0 z-40 ${panelOpen ? '' : 'hidden'} lg:block`}>
        <div className="flex h-full w-[300px] max-w-[88vw] flex-col overflow-y-auto border-l border-line bg-panel">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3.5">
            <span className="text-[13px] font-bold text-ink">Render settings</span>
            <button
              onClick={() => setPanelOpen(false)}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-dim transition hover:bg-soft lg:hidden ${FOCUS_RING}`}
            >
              <Icon name="close" className="text-[14px]" />
            </button>
          </div>

          <div className="flex flex-col gap-5 p-4">
            <div className="flex flex-col gap-2.5">
              <SectionLabel>Quality</SectionLabel>
              <Slider
                label="Samples target"
                value={samplesTarget}
                min={100}
                max={1000}
                step={50}
                onChange={setSamplesTarget}
              />
            </div>

            <div className="h-px bg-line" />

            <div className="flex flex-col gap-2.5">
              <SectionLabel>Lighting · HDRI</SectionLabel>
              {hdriKeys.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {hdriKeys.map((key) => {
                    const selected = key === activeHdriKey;
                    return (
                      <button
                        key={key}
                        onClick={() => setHdriKey(key)}
                        className={`flex flex-col items-start gap-1.5 rounded-[10px] border px-2.5 py-2 text-left transition ${FOCUS_RING} ${
                          selected ? 'border-accent bg-wash ring-1 ring-accent' : 'border-line bg-field hover:bg-soft'
                        }`}
                      >
                        <Icon name="sun" className={`text-[14px] ${selected ? 'text-accent' : 'text-faint'}`} />
                        <Mono className="text-[11px] text-ink">{key}</Mono>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[12px] text-faint">No HDRIs cached — run `npm run fetch:assets`.</p>
              )}
            </div>

            <div className="h-px bg-line" />

            <div className="flex flex-col gap-4">
              <SectionLabel>Exposure &amp; bounces</SectionLabel>
              <Slider
                label="Exposure"
                value={exposure}
                min={0.5}
                max={2}
                step={0.05}
                display={exposure.toFixed(2)}
                onChange={setExposure}
              />
              <Slider
                label="Bounces · applies on rebuild"
                value={bounces}
                min={2}
                max={8}
                step={1}
                onChange={(v) => setBounces(Math.round(v))}
              />
            </div>
          </div>

          <div className="mt-auto shrink-0 border-t border-line px-4 py-3">
            <Mono className="text-[11px] text-faint">
              {resolution.w}×{resolution.h} · gpu path tracer
            </Mono>
          </div>
        </div>
      </div>
    </div>
  );
}
