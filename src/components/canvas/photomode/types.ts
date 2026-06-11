/**
 * Photo Mode — render-quality boundary (Phase 5).
 *
 * SHIPPED THIS PHASE: the high-res "Save photo" export in SceneCanvas
 * (PhotoCapture) — a supersampled PNG of the interactive render, which already
 * carries AgX tone mapping, HDRI IBL, N8AO and Bloom. That covers the common
 * "give me a shareable beauty shot" need with zero new dependencies.
 *
 * DEFERRED (documented here so the boundary is explicit): a progressive,
 * physically-based path tracer for near-photoreal stills. The interface below is
 * the contract a future PathTracerRenderer implements behind a LAZY dynamic
 * import, so none of these heavy, GPU-only deps enter the main bundle or the
 * headless typecheck/test path:
 *   - three-gpu-pathtracer@0.0.24  (WebGLPathTracer; peers three>=0.180 — OK for 0.184)
 *   - three-mesh-bvh@0.9.10        (must be vite-deduped or BVH instanceof fails)
 *   - oidn-web@0.3.5               (WebGPU-only AI denoise; TZA weights NOT bundled)
 *
 * Why deferred (see design panel): oidn-web is WebGPU-only and its multi-MB
 * weights aren't in the package (conflicts with the local-first/zero-download
 * ethos and breaks Safari); converging a textured interior needs progressive-
 * sample + cancel + env-map-from-HDRI plumbing that deserves its own pass; and
 * it must be verified on real WebGL2/WebGPU hardware (the user's 1060 / Apple
 * Silicon), not this headless box. Implement on a GPU machine in a follow-up.
 */
import type * as THREE from 'three';

export interface PhotoModeOptions {
  /** Target accumulated samples before the image is considered converged. */
  targetSamples: number;
  /** Max ray bounces (global illumination depth). */
  bounces: number;
  /** Render-buffer scale (1 = viewport size). */
  resolutionScale: number;
  /** Run the AI denoiser when a WebGPU device is available. */
  denoise: boolean;
}

export const DEFAULT_PHOTO_OPTIONS: PhotoModeOptions = {
  targetSamples: 256,
  bounces: 6,
  resolutionScale: 1,
  denoise: true,
};

export interface PathTracerRenderer {
  /** Build the BVH + upload the scene/env. Resolves once ready to accumulate. */
  init(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, env: THREE.Texture | null): Promise<void>;
  /** Accumulate toward targetSamples; onProgress reports samples done (0..target). */
  renderProgressive(options: PhotoModeOptions, onProgress?: (samples: number) => void): Promise<void>;
  /** Optional AI denoise pass; passthrough (returns input) when WebGPU is absent. */
  denoise(input: ImageData, albedo?: ImageData, normal?: ImageData): Promise<ImageData>;
  /** Free GPU resources (BVH, targets). */
  dispose(): void;
}

/**
 * Future factory shape — implemented later as:
 *   export async function createPathTracer(): Promise<PathTracerRenderer> {
 *     const { WebGLPathTracer } = await import('three-gpu-pathtracer'); // lazy
 *     ...
 *   }
 * Importing three-gpu-pathtracer only inside the async body keeps it out of the
 * main bundle and the SSR/test eval path.
 */
export type CreatePathTracer = () => Promise<PathTracerRenderer>;
