import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { AssetCacheManifest } from '@lib/assets/manifest';
import type { HomeScene, Material } from '@lib/scene/schemas';
import { assetUrl } from '../../api';

/**
 * Scene materials -> THREE.MeshStandardMaterial map.
 * PBR texture sets come from the local CC0 cache when downloaded; otherwise
 * every material renders as its flat baseColor (the zero-download fallback).
 * UVs are in meters; repeatScale is mm-per-repeat.
 */

const textureCache = new Map<string, THREE.Texture>();

function loadTexture(rel: string, srgb: boolean): THREE.Texture {
  const key = `${rel}|${srgb}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const tex = new THREE.TextureLoader().load(assetUrl(rel));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

function buildMaterial(def: Material, assets: AssetCacheManifest): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    name: def.id,
    color: new THREE.Color(def.baseColor),
    roughness: def.pbr.roughness,
    metalness: def.pbr.metallic,
  });

  const setRef = def.pbr.textureSetRef;
  const set = setRef ? assets.textures[setRef] : undefined;
  if (set) {
    const repeat = 1000 / def.pbr.repeatScale; // repeats per meter of UV
    const apply = (tex: THREE.Texture) => {
      const t = tex.clone();
      t.repeat.set(repeat, repeat);
      t.needsUpdate = true;
      return t;
    };
    if (set.maps.diffuse) {
      material.map = apply(loadTexture(set.maps.diffuse, true));
      material.color.set(def.pbr.tint ?? '#ffffff'); // tint multiplies the texture
    }
    if (set.maps.normal) {
      material.normalMap = apply(loadTexture(set.maps.normal, false));
      const strength = def.pbr.normalStrength ?? 1;
      material.normalScale.set(strength, strength);
    }
    if (set.maps.roughness) {
      material.roughnessMap = apply(loadTexture(set.maps.roughness, false));
    }
  }
  return material;
}

export const FALLBACK_MATERIAL = new THREE.MeshStandardMaterial({ color: '#b9b2a6', roughness: 0.9 });
export const TRIM_MATERIAL = new THREE.MeshStandardMaterial({ color: '#efe9dd', roughness: 0.9 });

export function useMaterialMap(
  scene: HomeScene | null,
  assets: AssetCacheManifest,
): Map<string, THREE.MeshStandardMaterial> {
  const map = useMemo(() => {
    const out = new Map<string, THREE.MeshStandardMaterial>();
    if (!scene) return out;
    for (const def of scene.materials) out.set(def.id, buildMaterial(def, assets));
    return out;
    // materials list identity is the precise dependency (immer structural sharing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.materials, assets]);

  useEffect(() => {
    return () => {
      for (const material of map.values()) material.dispose();
    };
  }, [map]);

  return map;
}

export function pick(map: Map<string, THREE.MeshStandardMaterial>, id: string | undefined): THREE.MeshStandardMaterial {
  return (id && map.get(id)) || FALLBACK_MATERIAL;
}
