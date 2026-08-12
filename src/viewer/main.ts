import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { prismsToBuffers, wallSolidToBuffers, type MeshBufferData } from '@lib/geometry/extrusion';
import { buildStair } from '@lib/geometry/stairs';
import { buildWallNetwork } from '@lib/geometry/walls';
import { sanitizeBoundary } from '@lib/geometry/rooms';
import { proceduralPieces } from '@lib/furniture/pieces';
import type { Floor, HomeScene, Room } from '@lib/scene/schemas';

/**
 * Standalone client viewer — the single-file HTML a designer sends to a client.
 * No React, no network, no uploads: this bundle + the embedded scene JSON is the
 * whole app. Geometry comes from the SAME pure lib modules the studio renders
 * with, so the client sees exactly what the designer built (procedural furniture
 * stands in for glTF pieces — honest approximations, tiny file).
 *
 * Input:  window.__HOMECANVAS__ = { scene: HomeScene, brand?: { name?: string } }
 */

declare global {
  interface Window {
    __HOMECANVAS__?: { scene: HomeScene; brand?: { name?: string } };
  }
}

const MM = 0.001;

function bufferDataToGeometry(data: MeshBufferData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  for (const group of data.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  return geometry;
}

function boundaryToFloorGeometry(boundary: Room['boundary']): THREE.BufferGeometry {
  const clean = sanitizeBoundary(boundary);
  const shape = new THREE.Shape(clean.outer.map((p) => new THREE.Vector2(p.x * MM, p.y * MM)));
  for (const hole of clean.holes) {
    shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x * MM, p.y * MM))));
  }
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function main() {
  const payload = window.__HOMECANVAS__;
  if (!payload?.scene) {
    document.body.innerHTML = '<p style="font-family:sans-serif;padding:2rem">No scene embedded in this file.</p>';
    return;
  }
  const scene3 = payload.scene;

  // --- materials ------------------------------------------------------------
  const DARK = new THREE.MeshStandardMaterial({ color: '#26241f', roughness: 0.6 });
  const FOLIAGE = new THREE.MeshStandardMaterial({ color: '#3f6b3f', roughness: 0.9 });
  const TRIM = new THREE.MeshStandardMaterial({ color: '#f2f0ec', roughness: 0.85 });
  const FALLBACK = new THREE.MeshStandardMaterial({ color: '#d9d5cd', roughness: 0.9 });
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  for (const m of scene3.materials) {
    matCache.set(
      m.id,
      new THREE.MeshStandardMaterial({
        color: m.baseColor,
        roughness: m.pbr?.roughness ?? 0.85,
        metalness: m.pbr?.metallic ?? 0,
      }),
    );
  }
  const mat = (id: string | undefined): THREE.MeshStandardMaterial => (id && matCache.get(id)) || FALLBACK;

  // --- three shell ----------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.shadowMap.enabled = false;
  document.getElementById('stage')!.appendChild(renderer.domElement);

  const world = new THREE.Scene();
  world.background = new THREE.Color('#0e0f15');
  world.add(new THREE.HemisphereLight('#ffffff', '#3a3f4a', 1.15));
  const sun = new THREE.DirectionalLight('#fff2dd', 1.6);
  sun.position.set(6, 9, 4);
  world.add(sun);
  const grid = new THREE.GridHelper(60, 60, 0x2a2d37, 0x1c1f28);
  world.add(grid);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  // --- floor groups ---------------------------------------------------------
  const floorBounds = new Map<string, THREE.Box3>();
  const floorGroups = new Map<string, THREE.Group>();

  function buildFloorGroup(floor: Floor): THREE.Group {
    const g = new THREE.Group();
    for (const solid of buildWallNetwork(floor)) {
      const wall = floor.walls.find((w) => w.id === solid.wallId);
      const mesh = new THREE.Mesh(bufferDataToGeometry(wallSolidToBuffers(solid)), [
        mat(wall?.materialIds.sideA),
        mat(wall?.materialIds.sideB),
        TRIM,
      ]);
      g.add(mesh);
    }
    for (const room of floor.rooms) {
      const mesh = new THREE.Mesh(boundaryToFloorGeometry(room.boundary), mat(room.floorSurface.materialId));
      mesh.position.y = 0.005;
      g.add(mesh);
    }
    for (const stair of floor.stairs) {
      g.add(new THREE.Mesh(bufferDataToGeometry(prismsToBuffers(buildStair(stair).prisms)), TRIM));
    }
    for (const obj of floor.objects) {
      const holder = new THREE.Group();
      holder.position.set(obj.transform.x * MM, obj.transform.elevation * MM, -obj.transform.y * MM);
      holder.rotation.y = obj.transform.rotationY;
      for (const piece of proceduralPieces(obj)) {
        const material = piece.mat === -1 ? DARK : piece.mat === -2 ? FOLIAGE : mat(obj.materialIds[piece.mat] ?? obj.materialIds[0]);
        const geom =
          piece.kind === 'box'
            ? new THREE.BoxGeometry(...piece.size)
            : new THREE.CylinderGeometry(piece.size[0], piece.size[0], piece.size[1], 20);
        const mesh = new THREE.Mesh(geom, material);
        mesh.position.set(...piece.pos);
        holder.add(mesh);
      }
      g.add(holder);
    }
    return g;
  }

  for (const floor of scene3.floors) {
    const g = buildFloorGroup(floor);
    g.visible = false;
    world.add(g);
    floorGroups.set(floor.id, g);
    floorBounds.set(floor.id, new THREE.Box3().setFromObject(g));
  }

  // --- floor switching + camera framing ------------------------------------
  let activeFloorId = scene3.floors[0]!.id;

  function frame(mode: 'orbit' | 'inside') {
    const bounds = floorBounds.get(activeFloorId)!;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 4);
    if (mode === 'orbit') {
      camera.position.set(center.x + span * 0.72, span * 0.62, center.z + span * 0.72);
      controls.target.copy(center);
    } else {
      camera.position.set(center.x, 1.6, center.z);
      controls.target.set(center.x + 0.01, 1.5, center.z - span * 0.3);
    }
    controls.update();
  }

  function showFloor(id: string) {
    activeFloorId = id;
    for (const [fid, g] of floorGroups) g.visible = fid === id;
    document.querySelectorAll<HTMLButtonElement>('[data-floor]').forEach((b) => {
      b.classList.toggle('on', b.dataset.floor === id);
    });
    frame('orbit');
  }

  // --- chrome wiring --------------------------------------------------------
  const floorsEl = document.getElementById('floors')!;
  if (scene3.floors.length > 1) {
    for (const floor of scene3.floors) {
      const b = document.createElement('button');
      b.dataset.floor = floor.id;
      b.textContent = floor.name;
      b.addEventListener('click', () => showFloor(floor.id));
      floorsEl.appendChild(b);
    }
  }
  document.getElementById('view-orbit')!.addEventListener('click', () => frame('orbit'));
  document.getElementById('view-inside')!.addEventListener('click', () => frame('inside'));

  const title = payload.brand?.name?.trim() || scene3.name || 'Home design';
  document.getElementById('title')!.textContent = title;
  document.title = title;

  // --- resize + loop --------------------------------------------------------
  function resize() {
    const el = document.getElementById('stage')!;
    camera.aspect = el.clientWidth / el.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(el.clientWidth, el.clientHeight);
  }
  window.addEventListener('resize', resize);
  resize();
  showFloor(activeFloorId);

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(world, camera);
  });
}

main();
