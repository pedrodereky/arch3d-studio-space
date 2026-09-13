// Builder procedural: Blueprint JSON → GLB binário (glTF 2.0).
// Sem dependências de three.js. Constrói buffers diretamente.
// Suporta UVs planares e embute texturas PNG geradas por IA no GLB.
//
// Sistema de coordenadas: input usa (x, y) em metros com +y descendo (top-left).
// glTF usa Y-up. Mapeamento: gltf.x = bp.x, gltf.z = bp.y, gltf.y = altura.

import type { Blueprint, Furniture, Opening, Room, Wall } from "./floorplan-extract.ts";
import type { TextureKey } from "./pbr-textures.ts";

type Vec3 = [number, number, number];

type MeshAccum = {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  groupRanges: Array<{ material: number; indexStart: number; indexCount: number }>;
};

type Mat = {
  name: string;
  color: number[];
  roughness: number;
  metallic: number;
  textureKey?: TextureKey;
  /** metros por tile da textura (planar projection) */
  uvScale?: number;
};

const MATERIALS: Record<string, Mat> = {
  WALL: {
    name: "wall",
    color: [0.96, 0.96, 0.94, 1.0],
    roughness: 0.9,
    metallic: 0.0,
    textureKey: "wall_painted_white",
    uvScale: 2.0,
  },
  WALL_PAINTED_WARM: {
    name: "wall_painted_warm",
    color: [0.92, 0.86, 0.76, 1.0],
    roughness: 0.9,
    metallic: 0.0,
    textureKey: "wall_painted_warm",
    uvScale: 2.0,
  },
  WALL_WOOD_PANEL: {
    name: "wall_wood_panel",
    color: [0.55, 0.4, 0.27, 1.0],
    roughness: 0.7,
    metallic: 0.0,
    textureKey: "wall_wood_panel",
    uvScale: 1.2,
  },
  WALL_EXPOSED_BRICK: {
    name: "wall_exposed_brick",
    color: [0.55, 0.3, 0.25, 1.0],
    roughness: 0.95,
    metallic: 0.0,
    textureKey: "wall_exposed_brick",
    uvScale: 1.5,
  },
  FLOOR_WOOD: {
    name: "floor_wood",
    color: [0.55, 0.4, 0.27, 1.0],
    roughness: 0.55,
    metallic: 0.0,
    textureKey: "floor_wood",
    uvScale: 1.5,
  },
  FLOOR_TILE: {
    name: "floor_tile",
    color: [0.9, 0.9, 0.88, 1.0],
    roughness: 0.3,
    metallic: 0.0,
    textureKey: "floor_tile",
    uvScale: 0.6,
  },
  FLOOR_CARPET: {
    name: "floor_carpet",
    color: [0.45, 0.42, 0.4, 1.0],
    roughness: 1.0,
    metallic: 0.0,
    textureKey: "floor_carpet",
    uvScale: 1.0,
  },
  FLOOR_CONCRETE: {
    name: "floor_concrete",
    color: [0.7, 0.7, 0.7, 1.0],
    roughness: 0.6,
    metallic: 0.0,
    textureKey: "floor_concrete",
    uvScale: 2.0,
  },
  GLASS: { name: "glass", color: [0.55, 0.75, 0.85, 0.4], roughness: 0.05, metallic: 0.0 },
  WOOD_DARK: { name: "wood_dark", color: [0.32, 0.22, 0.14, 1.0], roughness: 0.6, metallic: 0.0 },
  FABRIC_GREY: {
    name: "fabric_grey",
    color: [0.55, 0.55, 0.58, 1.0],
    roughness: 0.95,
    metallic: 0.0,
  },
  FABRIC_BEIGE: {
    name: "fabric_beige",
    color: [0.78, 0.7, 0.58, 1.0],
    roughness: 0.95,
    metallic: 0.0,
  },
  WHITE_PORCELAIN: {
    name: "porcelain",
    color: [0.97, 0.97, 0.97, 1.0],
    roughness: 0.2,
    metallic: 0.0,
  },
  METAL: { name: "metal", color: [0.78, 0.78, 0.8, 1.0], roughness: 0.3, metallic: 1.0 },
  PLANT_GREEN: { name: "plant", color: [0.3, 0.55, 0.28, 1.0], roughness: 0.8, metallic: 0.0 },
  BLACK: { name: "black", color: [0.08, 0.08, 0.08, 1.0], roughness: 0.5, metallic: 0.0 },
};

const MAT_LIST = [
  MATERIALS.WALL,
  MATERIALS.WALL_PAINTED_WARM,
  MATERIALS.WALL_WOOD_PANEL,
  MATERIALS.WALL_EXPOSED_BRICK,
  MATERIALS.FLOOR_WOOD,
  MATERIALS.FLOOR_TILE,
  MATERIALS.FLOOR_CARPET,
  MATERIALS.FLOOR_CONCRETE,
  MATERIALS.GLASS,
  MATERIALS.WOOD_DARK,
  MATERIALS.FABRIC_GREY,
  MATERIALS.FABRIC_BEIGE,
  MATERIALS.WHITE_PORCELAIN,
  MATERIALS.METAL,
  MATERIALS.PLANT_GREEN,
  MATERIALS.BLACK,
];
const MAT_IDX = {
  WALL: 0,
  WALL_PAINTED_WARM: 1,
  WALL_WOOD_PANEL: 2,
  WALL_EXPOSED_BRICK: 3,
  FLOOR_WOOD: 4,
  FLOOR_TILE: 5,
  FLOOR_CARPET: 6,
  FLOOR_CONCRETE: 7,
  GLASS: 8,
  WOOD_DARK: 9,
  FABRIC_GREY: 10,
  FABRIC_BEIGE: 11,
  WHITE_PORCELAIN: 12,
  METAL: 13,
  PLANT_GREEN: 14,
  BLACK: 15,
};

function wallMaterial(finish: Room["wall_finish"] | undefined): number {
  switch (finish) {
    case "painted_warm":
      return MAT_IDX.WALL_PAINTED_WARM;
    case "wood_panel":
      return MAT_IDX.WALL_WOOD_PANEL;
    case "exposed_brick":
      return MAT_IDX.WALL_EXPOSED_BRICK;
    default:
      return MAT_IDX.WALL;
  }
}
void wallMaterial;

function newMesh(): MeshAccum {
  return { positions: [], normals: [], uvs: [], indices: [], groupRanges: [] };
}

// Calcula tangente/bitangente para projeção UV planar a partir da normal.
// Para faces ~horizontais (top/bottom), usa eixos (X, Z) do mundo.
// Para faces verticais, usa direção horizontal perpendicular à normal (cross(n,Y)) e Y vertical.
function uvAxes(
  nx: number,
  ny: number,
  nz: number,
): { tx: number; ty: number; tz: number; bx: number; by: number; bz: number } {
  if (Math.abs(ny) > 0.5) {
    return { tx: 1, ty: 0, tz: 0, bx: 0, by: 0, bz: 1 };
  }
  // tangent = normalize(cross(n, (0,1,0))) = (n.z, 0, -n.x); n é unit horizontal
  const tx = nz,
    ty = 0,
    tz = -nx;
  return { tx, ty, tz, bx: 0, by: 1, bz: 0 };
}

function pushBox(
  mesh: MeshAccum,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  material: number,
  rotY = 0,
) {
  const indexStart = mesh.indices.length;
  const hx = sx / 2,
    hy = sy / 2,
    hz = sz / 2;
  const cos = Math.cos(rotY),
    sin = Math.sin(rotY);
  const corners: Vec3[] = [
    [-hx, -hy, -hz],
    [hx, -hy, -hz],
    [hx, -hy, hz],
    [-hx, -hy, hz],
    [-hx, hy, -hz],
    [hx, hy, -hz],
    [hx, hy, hz],
    [-hx, hy, hz],
  ];

  const faces: Array<{ idx: number[]; normal: Vec3 }> = [
    { idx: [4, 5, 6, 7], normal: [0, 1, 0] },
    { idx: [3, 2, 1, 0], normal: [0, -1, 0] },
    { idx: [0, 1, 5, 4], normal: [0, 0, -1] },
    { idx: [2, 3, 7, 6], normal: [0, 0, 1] },
    { idx: [3, 0, 4, 7], normal: [-1, 0, 0] },
    { idx: [1, 2, 6, 5], normal: [1, 0, 0] },
  ];

  const scale = MAT_LIST[material]?.uvScale ?? 1.0;

  for (const f of faces) {
    // Normal rotacionada (mundo)
    const [nx0, ny0, nz0] = f.normal;
    const wnx = nx0 * cos + nz0 * sin;
    const wny = ny0;
    const wnz = -nx0 * sin + nz0 * cos;
    const ax = uvAxes(wnx, wny, wnz);

    const v0 = mesh.positions.length / 3;
    for (const ci of f.idx) {
      const [lx, ly, lz] = corners[ci];
      const rx = lx * cos + lz * sin;
      const rz = -lx * sin + lz * cos;
      const wx = cx + rx,
        wy = cy + ly,
        wz = cz + rz;
      mesh.positions.push(wx, wy, wz);
      mesh.normals.push(wnx, wny, wnz);
      // UV planar a partir da posição mundial projetada nos eixos da face
      const u = (wx * ax.tx + wy * ax.ty + wz * ax.tz) / scale;
      const v = (wx * ax.bx + wy * ax.by + wz * ax.bz) / scale;
      mesh.uvs.push(u, v);
    }
    mesh.indices.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
  }

  const indexCount = mesh.indices.length - indexStart;
  const prev = mesh.groupRanges[mesh.groupRanges.length - 1];
  if (prev && prev.material === material && prev.indexStart + prev.indexCount === indexStart) {
    prev.indexCount += indexCount;
  } else {
    mesh.groupRanges.push({ material, indexStart, indexCount });
  }
}

function pushFloorPolygon(
  mesh: MeshAccum,
  polygon: Array<[number, number]>,
  y: number,
  material: number,
) {
  if (polygon.length < 3) return;
  const indexStart = mesh.indices.length;
  const v0 = mesh.positions.length / 3;
  const scale = MAT_LIST[material]?.uvScale ?? 1.0;
  for (const [px, py] of polygon) {
    mesh.positions.push(px, y, py);
    mesh.normals.push(0, 1, 0);
    mesh.uvs.push(px / scale, py / scale);
  }
  for (let i = 1; i < polygon.length - 1; i++) {
    mesh.indices.push(v0, v0 + i, v0 + i + 1);
  }
  const indexCount = mesh.indices.length - indexStart;
  mesh.groupRanges.push({ material, indexStart, indexCount });
}

function buildWallsForSegment(mesh: MeshAccum, wall: Wall, openings: Opening[]) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return;
  const ux = dx / len,
    uy = dy / len;
  const angle = Math.atan2(-uy, ux);

  type Block = { s: number; e: number; yb: number; yt: number };
  let blocks: Block[] = [{ s: 0, e: len, yb: 0, yt: wall.height_m }];

  for (const o of openings.filter((x) => x.wall_idx === wallIndexOf(wall))) {
    const oStart = Math.max(0, o.offset_m);
    const oEnd = Math.min(len, o.offset_m + o.width_m);
    const oTop = o.sill_m + o.height_m;
    const oBottom = o.sill_m;
    const next: Block[] = [];
    for (const b of blocks) {
      if (oEnd <= b.s || oStart >= b.e) {
        next.push(b);
        continue;
      }
      if (oStart > b.s) next.push({ s: b.s, e: oStart, yb: b.yb, yt: b.yt });
      if (oEnd < b.e) next.push({ s: oEnd, e: b.e, yb: b.yb, yt: b.yt });
      if (oTop < b.yt)
        next.push({ s: Math.max(oStart, b.s), e: Math.min(oEnd, b.e), yb: oTop, yt: b.yt });
      if (oBottom > b.yb)
        next.push({ s: Math.max(oStart, b.s), e: Math.min(oEnd, b.e), yb: b.yb, yt: oBottom });
    }
    blocks = next;
  }

  for (const b of blocks) {
    const segLen = b.e - b.s;
    if (segLen <= 0.001) continue;
    const segH = b.yt - b.yb;
    if (segH <= 0.001) continue;
    const segCenterAlong = (b.s + b.e) / 2;
    const cx = wall.x1 + ux * segCenterAlong;
    const cz = wall.y1 + uy * segCenterAlong;
    const cy = (b.yb + b.yt) / 2;
    pushBox(mesh, cx, cy, cz, segLen, segH, wall.thickness_m, MAT_IDX.WALL, angle);
  }

  for (const o of openings.filter((x) => x.wall_idx === wallIndexOf(wall) && x.kind === "window")) {
    const oStart = Math.max(0, o.offset_m);
    const oEnd = Math.min(len, o.offset_m + o.width_m);
    const segLen = oEnd - oStart;
    if (segLen <= 0) continue;
    const segCenterAlong = (oStart + oEnd) / 2;
    const cx = wall.x1 + ux * segCenterAlong;
    const cz = wall.y1 + uy * segCenterAlong;
    const cy = o.sill_m + o.height_m / 2;
    pushBox(mesh, cx, cy, cz, segLen, o.height_m, wall.thickness_m * 0.3, MAT_IDX.GLASS, angle);
  }
}

let _wallsRef: Wall[] = [];
function wallIndexOf(w: Wall): number {
  return _wallsRef.indexOf(w);
}

function floorMaterial(name: Room["floor_material"]): number {
  switch (name) {
    case "wood":
      return MAT_IDX.FLOOR_WOOD;
    case "tile":
      return MAT_IDX.FLOOR_TILE;
    case "carpet":
      return MAT_IDX.FLOOR_CARPET;
    case "concrete":
      return MAT_IDX.FLOOR_CONCRETE;
  }
}

function placeFurniture(mesh: MeshAccum, f: Furniture) {
  const rot = (f.rotation_deg * Math.PI) / 180;
  const cx = f.x,
    cz = f.y;
  const w = f.width_m,
    d = f.depth_m;

  switch (f.type) {
    case "sofa": {
      pushBox(mesh, cx, 0.2, cz, w, 0.4, d, MAT_IDX.FABRIC_BEIGE, rot);
      const back = rotateOffset(0, d / 2 - 0.1, rot);
      pushBox(mesh, cx + back[0], 0.55, cz + back[1], w, 0.3, 0.2, MAT_IDX.FABRIC_BEIGE, rot);
      const armL = rotateOffset(-w / 2 + 0.1, 0, rot);
      const armR = rotateOffset(w / 2 - 0.1, 0, rot);
      pushBox(mesh, cx + armL[0], 0.45, cz + armL[1], 0.2, 0.5, d, MAT_IDX.FABRIC_BEIGE, rot);
      pushBox(mesh, cx + armR[0], 0.45, cz + armR[1], 0.2, 0.5, d, MAT_IDX.FABRIC_BEIGE, rot);
      break;
    }
    case "armchair": {
      pushBox(mesh, cx, 0.2, cz, w, 0.4, d, MAT_IDX.FABRIC_GREY, rot);
      const back = rotateOffset(0, d / 2 - 0.1, rot);
      pushBox(mesh, cx + back[0], 0.55, cz + back[1], w, 0.3, 0.15, MAT_IDX.FABRIC_GREY, rot);
      break;
    }
    case "chair": {
      pushBox(mesh, cx, 0.45, cz, w, 0.05, d, MAT_IDX.WOOD_DARK, rot);
      const back = rotateOffset(0, d / 2 - 0.05, rot);
      pushBox(mesh, cx + back[0], 0.75, cz + back[1], w, 0.5, 0.05, MAT_IDX.WOOD_DARK, rot);
      legs(mesh, cx, cz, w, d, 0.45, MAT_IDX.WOOD_DARK, rot);
      break;
    }
    case "bed_double":
    case "bed_single": {
      pushBox(mesh, cx, 0.3, cz, w, 0.3, d, MAT_IDX.FABRIC_BEIGE, rot);
      const head = rotateOffset(0, -d / 2 + 0.05, rot);
      pushBox(mesh, cx + head[0], 0.7, cz + head[1], w, 0.8, 0.1, MAT_IDX.WOOD_DARK, rot);
      break;
    }
    case "table_dining": {
      pushBox(mesh, cx, 0.73, cz, w, 0.04, d, MAT_IDX.WOOD_DARK, rot);
      legs(mesh, cx, cz, w - 0.1, d - 0.1, 0.73, MAT_IDX.WOOD_DARK, rot);
      break;
    }
    case "table_coffee": {
      pushBox(mesh, cx, 0.4, cz, w, 0.05, d, MAT_IDX.WOOD_DARK, rot);
      legs(mesh, cx, cz, w - 0.1, d - 0.1, 0.4, MAT_IDX.WOOD_DARK, rot);
      break;
    }
    case "desk": {
      pushBox(mesh, cx, 0.74, cz, w, 0.04, d, MAT_IDX.WOOD_DARK, rot);
      legs(mesh, cx, cz, w - 0.05, d - 0.05, 0.74, MAT_IDX.WOOD_DARK, rot);
      break;
    }
    case "wardrobe": {
      pushBox(mesh, cx, 1.1, cz, w, 2.2, d, MAT_IDX.WOOD_DARK, rot);
      break;
    }
    case "tv": {
      pushBox(mesh, cx, 0.8, cz, w, 0.5, 0.05, MAT_IDX.BLACK, rot);
      break;
    }
    case "toilet": {
      pushBox(mesh, cx, 0.2, cz, w, 0.4, d, MAT_IDX.WHITE_PORCELAIN, rot);
      const tank = rotateOffset(0, d / 2 - 0.1, rot);
      pushBox(
        mesh,
        cx + tank[0],
        0.55,
        cz + tank[1],
        w * 0.8,
        0.4,
        0.15,
        MAT_IDX.WHITE_PORCELAIN,
        rot,
      );
      break;
    }
    case "sink": {
      pushBox(mesh, cx, 0.85, cz, w, 0.1, d, MAT_IDX.WHITE_PORCELAIN, rot);
      pushBox(mesh, cx, 0.4, cz, w * 0.6, 0.8, d * 0.6, MAT_IDX.WOOD_DARK, rot);
      break;
    }
    case "bathtub": {
      pushBox(mesh, cx, 0.3, cz, w, 0.55, d, MAT_IDX.WHITE_PORCELAIN, rot);
      break;
    }
    case "shower": {
      pushBox(mesh, cx, 1.0, cz, w, 2.0, d, MAT_IDX.GLASS, rot);
      pushBox(mesh, cx, 0.02, cz, w, 0.04, d, MAT_IDX.FLOOR_TILE, rot);
      break;
    }
    case "stove":
    case "fridge": {
      pushBox(mesh, cx, 0.45, cz, w, 0.9, d, MAT_IDX.METAL, rot);
      break;
    }
    case "kitchen_counter": {
      pushBox(mesh, cx, 0.45, cz, w, 0.9, d, MAT_IDX.WOOD_DARK, rot);
      pushBox(mesh, cx, 0.92, cz, w, 0.04, d, MAT_IDX.FLOOR_TILE, rot);
      break;
    }
    case "lamp": {
      pushBox(mesh, cx, 1.4, cz, 0.1, 2.8, 0.1, MAT_IDX.METAL);
      pushBox(mesh, cx, 1.55, cz, 0.4, 0.3, 0.4, MAT_IDX.WHITE_PORCELAIN);
      break;
    }
    case "plant": {
      pushBox(mesh, cx, 0.2, cz, 0.4, 0.4, 0.4, MAT_IDX.WOOD_DARK);
      pushBox(mesh, cx, 0.8, cz, 0.6, 1.0, 0.6, MAT_IDX.PLANT_GREEN);
      break;
    }
  }
}

function legs(
  mesh: MeshAccum,
  cx: number,
  cz: number,
  w: number,
  d: number,
  height: number,
  material: number,
  rot: number,
) {
  const positions: Array<[number, number]> = [
    [-w / 2 + 0.04, -d / 2 + 0.04],
    [w / 2 - 0.04, -d / 2 + 0.04],
    [-w / 2 + 0.04, d / 2 - 0.04],
    [w / 2 - 0.04, d / 2 - 0.04],
  ];
  for (const [lx, lz] of positions) {
    const off = rotateOffset(lx, lz, rot);
    pushBox(mesh, cx + off[0], height / 2, cz + off[1], 0.06, height, 0.06, material, rot);
  }
}

function rotateOffset(x: number, z: number, rot: number): [number, number] {
  const cos = Math.cos(rot),
    sin = Math.sin(rot);
  return [x * cos + z * sin, -x * sin + z * cos];
}

// ====================== glTF binary export ======================

function alignTo4(n: number): number {
  return (n + 3) & ~3;
}

function buildGLB(mesh: MeshAccum, textures: Map<TextureKey, Uint8Array>): Uint8Array {
  const positions = new Float32Array(mesh.positions);
  const normals = new Float32Array(mesh.normals);
  const uvs = new Float32Array(mesh.uvs);
  const indices32 = new Uint32Array(mesh.indices);

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i],
      y = positions[i + 1],
      z = positions[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const posBytes = positions.byteLength;
  const normBytes = normals.byteLength;
  const uvBytes = uvs.byteLength;
  const idxBytes = indices32.byteLength;

  const posOffset = 0;
  const normOffset = alignTo4(posOffset + posBytes);
  const uvOffset = alignTo4(normOffset + normBytes);
  const idxOffset = alignTo4(uvOffset + uvBytes);

  // Layout das imagens (PNG) após os índices
  type ImgInfo = { key: TextureKey; offset: number; length: number };
  const imageInfos: ImgInfo[] = [];
  let cursor = alignTo4(idxOffset + idxBytes);
  for (const [key, png] of textures) {
    imageInfos.push({ key, offset: cursor, length: png.byteLength });
    cursor = alignTo4(cursor + png.byteLength);
  }
  const binLength = cursor;

  const bin = new Uint8Array(binLength);
  bin.set(new Uint8Array(positions.buffer), posOffset);
  bin.set(new Uint8Array(normals.buffer), normOffset);
  bin.set(new Uint8Array(uvs.buffer), uvOffset);
  bin.set(new Uint8Array(indices32.buffer), idxOffset);
  for (const info of imageInfos) {
    const png = textures.get(info.key)!;
    bin.set(png, info.offset);
  }

  const bufferViews: any[] = [
    { buffer: 0, byteOffset: posOffset, byteLength: posBytes, target: 34962 },
    { buffer: 0, byteOffset: normOffset, byteLength: normBytes, target: 34962 },
    { buffer: 0, byteOffset: uvOffset, byteLength: uvBytes, target: 34962 },
    { buffer: 0, byteOffset: idxOffset, byteLength: idxBytes, target: 34963 },
  ];
  const POS_BV = 0,
    NORM_BV = 1,
    UV_BV = 2,
    IDX_BV = 3;

  // Image bufferViews
  const keyToTexIndex = new Map<TextureKey, number>();
  const images: any[] = [];
  for (let i = 0; i < imageInfos.length; i++) {
    const info = imageInfos[i];
    const bvIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: info.offset, byteLength: info.length });
    images.push({ bufferView: bvIndex, mimeType: "image/png" });
    keyToTexIndex.set(info.key, i);
  }

  const samplers =
    images.length > 0 ? [{ wrapS: 10497, wrapT: 10497, magFilter: 9729, minFilter: 9987 }] : [];
  const gltfTextures = images.map((_, i) => ({ source: i, sampler: 0 }));

  const accessors: any[] = [
    {
      bufferView: POS_BV,
      componentType: 5126,
      count: positions.length / 3,
      type: "VEC3",
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    },
    {
      bufferView: NORM_BV,
      componentType: 5126,
      count: normals.length / 3,
      type: "VEC3",
    },
    {
      bufferView: UV_BV,
      componentType: 5126,
      count: uvs.length / 2,
      type: "VEC2",
    },
  ];

  const primitives: any[] = [];
  for (const g of mesh.groupRanges) {
    const accessorIdx = accessors.length;
    accessors.push({
      bufferView: IDX_BV,
      byteOffset: g.indexStart * 4,
      componentType: 5125,
      count: g.indexCount,
      type: "SCALAR",
    });
    primitives.push({
      attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
      indices: accessorIdx,
      material: g.material,
      mode: 4,
    });
  }

  const materials = MAT_LIST.map((m) => {
    const texIdx = m.textureKey ? keyToTexIndex.get(m.textureKey) : undefined;
    const pbr: any = {
      metallicFactor: m.metallic,
      roughnessFactor: m.roughness,
    };
    if (texIdx !== undefined) {
      pbr.baseColorTexture = { index: texIdx, texCoord: 0 };
      pbr.baseColorFactor = [1, 1, 1, 1];
    } else {
      pbr.baseColorFactor = m.color;
    }
    return {
      name: m.name,
      pbrMetallicRoughness: pbr,
      alphaMode: m.color[3] < 1 ? "BLEND" : "OPAQUE",
      doubleSided: true,
    };
  });

  const gltf: any = {
    asset: { version: "2.0", generator: "Arq3D Studio floorplan-build" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binLength }],
    materials,
  };
  if (images.length > 0) {
    gltf.images = images;
    gltf.samplers = samplers;
    gltf.textures = gltfTextures;
  }

  const jsonStr = JSON.stringify(gltf);
  const enc = new TextEncoder();
  let jsonBytes = enc.encode(jsonStr);
  const jsonPad = alignTo4(jsonBytes.length) - jsonBytes.length;
  if (jsonPad > 0) {
    const padded = new Uint8Array(jsonBytes.length + jsonPad);
    padded.set(jsonBytes);
    for (let i = 0; i < jsonPad; i++) padded[jsonBytes.length + i] = 0x20;
    jsonBytes = padded;
  }

  const totalLength = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new Uint8Array(totalLength);
  const dv = new DataView(out.buffer);

  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, totalLength, true);

  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);

  const binChunkOffset = 20 + jsonBytes.length;
  dv.setUint32(binChunkOffset, bin.length, true);
  dv.setUint32(binChunkOffset + 4, 0x004e4942, true);
  out.set(bin, binChunkOffset + 8);

  return out;
}

export function buildFloorplanGLB(
  bp: Blueprint,
  textures: Map<TextureKey, Uint8Array> = new Map(),
  opts: { includePrimitiveFurniture?: boolean } = {},
): Uint8Array {
  const mesh = newMesh();
  _wallsRef = bp.walls;

  for (const room of bp.rooms) {
    pushFloorPolygon(mesh, room.polygon, 0, floorMaterial(room.floor_material));
  }

  for (const wall of bp.walls) {
    buildWallsForSegment(mesh, wall, bp.openings);
  }

  if (opts.includePrimitiveFurniture !== false) {
    for (const f of bp.furniture) {
      placeFurniture(mesh, f);
    }
  }

  return buildGLB(mesh, textures);
}

// Helper para o orquestrador: deriva quais TextureKeys o blueprint precisa
export function requiredTextureKeys(bp: Blueprint): TextureKey[] {
  const keys = new Set<TextureKey>();
  for (const room of bp.rooms) {
    switch (room.floor_material) {
      case "wood":
        keys.add("floor_wood");
        break;
      case "tile":
        keys.add("floor_tile");
        break;
      case "carpet":
        keys.add("floor_carpet");
        break;
      case "concrete":
        keys.add("floor_concrete");
        break;
    }
    switch (room.wall_finish) {
      case "painted_warm":
        keys.add("wall_painted_warm");
        break;
      case "wood_panel":
        keys.add("wall_wood_panel");
        break;
      case "exposed_brick":
        keys.add("wall_exposed_brick");
        break;
      default:
        keys.add("wall_painted_white");
        break;
    }
  }
  // Sempre garantir parede branca como fallback (paredes usam MAT_IDX.WALL hoje)
  keys.add("wall_painted_white");
  return Array.from(keys);
}
