import { Component, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import type { FurnitureObject } from '@lib/scene/schemas';
import { traceDevError } from '../../store/error-store';

const MM = 0.001;

/**
 * Renders a CC0 glTF furniture model (Poly Haven) fetched into the asset cache.
 * The model is uniformly scaled to fit the catalog dimensions (keeping its
 * proportions) and recentred so it sits on the floor at the local origin —
 * matching how ProceduralFurniture is placed inside the per-object group.
 * Rendered under Suspense + GltfErrorBoundary, both falling back to procedural.
 */
export function GltfFurniture({ url, object }: { url: string; object: FurnitureObject }) {
  const { scene } = useGLTF(url);
  const { node, scale, position } = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const s = Math.min(
      (object.dimensions.w * MM) / (size.x || 1),
      (object.dimensions.h * MM) / (size.y || 1),
      (object.dimensions.d * MM) / (size.z || 1),
    );
    // world = position + s*localVertex → center maps to x/z=0, base (min.y) to y=0.
    return {
      node: clone,
      scale: s,
      position: [-s * center.x, -s * box.min.y, -s * center.z] as [number, number, number],
    };
  }, [scene, object.dimensions.w, object.dimensions.h, object.dimensions.d]);

  return (
    <group scale={scale} position={position}>
      <primitive object={node} />
    </group>
  );
}

/** Falls back to the procedural mesh if a model fails to load/parse at runtime. */
export class GltfErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error): void {
    // Graceful fallback to the procedural mesh — no user toast, but dev-trace it
    // so a model that fails to load/parse is visible while testing.
    traceDevError('GltfFurniture (fell back to procedural)', error, 'render');
  }
  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
