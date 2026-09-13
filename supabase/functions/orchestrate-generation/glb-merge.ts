// Merge GLB binário procedural (paredes/piso) com GLBs externos (móveis Hunyuan3D).
// Usa @gltf-transform/core via esm.sh — funciona em Deno.
//
// Cada móvel é normalizado para caber em (width_m × depth_m), apoiado no chão (y=0),
// transladado para (x, 0, y) do blueprint e rotacionado em torno de Y.

import { Document, WebIO, type Node } from "https://esm.sh/@gltf-transform/core@4.0.7";
import type { Furniture } from "./floorplan-extract.ts";
import type { MeshResult } from "./furniture-mesh.ts";

const io = new WebIO();

export type MergeResult = {
  glb: Uint8Array;
  attached: number;
  total: number;
};

export async function mergeFurnitureIntoGLB(
  baseGlb: Uint8Array,
  meshes: MeshResult[],
): Promise<MergeResult> {
  const baseDoc = await io.readBinary(baseGlb);
  let baseScene = baseDoc.getRoot().getDefaultScene() ?? baseDoc.getRoot().listScenes()[0];
  if (!baseScene) {
    baseScene = baseDoc.createScene("scene");
  }
  baseDoc.getRoot().setDefaultScene(baseScene);

  const totalCandidates = meshes.filter((m) => m.bytes).length;
  let attached = 0;

  for (const m of meshes) {
    if (!m.bytes) continue;
    try {
      const extDoc = await io.readBinary(m.bytes);
      // Snapshot scenes BEFORE merge so we can identify the new ones reliably
      const scenesBefore = new Set(baseDoc.getRoot().listScenes());
      baseDoc.merge(extDoc);

      const newScenes = baseDoc
        .getRoot()
        .listScenes()
        .filter((s) => !scenesBefore.has(s));

      // Collect all root nodes from newly added scenes
      const extRoots: Node[] = [];
      for (const s of newScenes) {
        for (const c of s.listChildren()) extRoots.push(c);
      }
      if (extRoots.length === 0) {
        for (const s of newScenes) s.dispose();
        continue;
      }

      // Compute combined bbox of external roots so we can normalize scale.
      const bbox = computeBBox(extRoots);
      if (!bbox) continue;
      const sizeX = bbox.max[0] - bbox.min[0];
      const sizeY = bbox.max[1] - bbox.min[1];
      const sizeZ = bbox.max[2] - bbox.min[2];
      if (sizeX <= 0 || sizeY <= 0 || sizeZ <= 0) continue;

      // Heuristic: assume Y-up. Normalize so that horizontal footprint fits
      // (width_m × depth_m) preserving aspect, and base sits at y=0.
      const f = m.furniture;
      const scaleHoriz = Math.min(f.width_m / sizeX, f.depth_m / sizeZ);
      const scale = scaleHoriz; // uniform — keep proportions
      const rotRad = (f.rotation_deg * Math.PI) / 180;
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);

      // Center of external object on XZ at origin, base on y=0
      const cx = (bbox.min[0] + bbox.max[0]) / 2;
      const cz = (bbox.min[2] + bbox.max[2]) / 2;
      const baseY = bbox.min[1];

      // Wrapper node that applies translation and rotation
      const wrapper = baseDoc.createNode(`furniture_${m.index}_wrap`);
      wrapper.setTranslation([f.x, 0, f.y]);
      // Quaternion for rotation around Y by rotRad
      wrapper.setRotation([0, Math.sin(rotRad / 2), 0, Math.cos(rotRad / 2)]);
      void cosR;
      void sinR;

      // Inner node centers + scales the imported geometry
      const inner = baseDoc.createNode(`furniture_${m.index}_inner`);
      inner.setScale([scale, scale, scale]);
      inner.setTranslation([-cx, -baseY, -cz]);

      for (const root of extRoots) {
        const parent = root.getParentNode();
        if (parent) {
          parent.removeChild(root);
        } else {
          for (const s of newScenes) {
            try {
              s.removeChild(root);
            } catch {
              /* noop */
            }
          }
        }
        inner.addChild(root);
      }
      wrapper.addChild(inner);
      baseScene.addChild(wrapper);
      attached++;

      // Remove the now-empty external scenes
      for (const s of newScenes) s.dispose();
    } catch (e) {
      console.error(`merge furniture ${m.index}:`, (e as Error).message);
    }
  }

  const glb = await io.writeBinary(baseDoc);
  console.log(`merge: ${attached}/${totalCandidates} móveis anexados, glb=${glb.byteLength}B`);
  return { glb, attached, total: totalCandidates };
}

function computeBBox(
  nodes: Node[],
): { min: [number, number, number]; max: [number, number, number] } | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let any = false;
  function walk(n: Node, parentMatrix: number[]) {
    const m = multMat(parentMatrix, nodeMatrix(n));
    const mesh = n.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute("POSITION");
        if (!pos) continue;
        const arr = pos.getArray();
        if (!arr) continue;
        for (let i = 0; i < arr.length; i += 3) {
          const x = arr[i],
            y = arr[i + 1],
            z = arr[i + 2];
          const tx = m[0] * x + m[4] * y + m[8] * z + m[12];
          const ty = m[1] * x + m[5] * y + m[9] * z + m[13];
          const tz = m[2] * x + m[6] * y + m[10] * z + m[14];
          if (tx < min[0]) min[0] = tx;
          if (tx > max[0]) max[0] = tx;
          if (ty < min[1]) min[1] = ty;
          if (ty > max[1]) max[1] = ty;
          if (tz < min[2]) min[2] = tz;
          if (tz > max[2]) max[2] = tz;
          any = true;
        }
      }
    }
    for (const c of n.listChildren()) walk(c, m);
  }
  const I = identity();
  for (const n of nodes) walk(n, I);
  return any ? { min, max } : null;
}

function identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function nodeMatrix(n: Node): number[] {
  // TRS to mat4 (column-major)
  const t = n.getTranslation();
  const r = n.getRotation(); // quaternion x,y,z,w
  const s = n.getScale();
  const [x, y, z, w] = r;
  const xx = x * x,
    yy = y * y,
    zz = z * z;
  const xy = x * y,
    xz = x * z,
    yz = y * z;
  const wx = w * x,
    wy = w * y,
    wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * s[0],
    2 * (xy + wz) * s[0],
    2 * (xz - wy) * s[0],
    0,
    2 * (xy - wz) * s[1],
    (1 - 2 * (xx + zz)) * s[1],
    2 * (yz + wx) * s[1],
    0,
    2 * (xz + wy) * s[2],
    2 * (yz - wx) * s[2],
    (1 - 2 * (xx + yy)) * s[2],
    0,
    t[0],
    t[1],
    t[2],
    1,
  ];
}

function multMat(a: number[], b: number[]): number[] {
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      r[i * 4 + j] = s;
    }
  }
  return r;
}
