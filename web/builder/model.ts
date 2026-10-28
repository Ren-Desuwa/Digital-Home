export const SIZE = 20;
export const STORAGE_KEY = 'digital-home-studio-v1';
export const surfaces = [
  { id: 'oak', label: 'Honey oak', color: '#c7aa81' },
  { id: 'stone', label: 'Warm stone', color: '#e6decd' },
  { id: 'sage', label: 'Soft sage', color: '#aeb9a2' },
  { id: 'clay', label: 'Terracotta', color: '#ce9d85' },
  { id: 'chalk', label: 'Chalk white', color: '#f0eadd' },
];
export const catalog = {
  sofa: { name: 'Sunday sofa', category: 'Living', w: 3, d: 1, color: '#819581', icon: 'sofa' },
  chair: { name: 'Lounge chair', category: 'Living', w: 1, d: 1, color: '#c89970', icon: 'armchair' },
  table: { name: 'Coffee table', category: 'Living', w: 2, d: 1, color: '#ad825c', icon: 'table' },
  dining: { name: 'Dining table', category: 'Kitchen', w: 2, d: 2, color: '#b9916d', icon: 'table' },
  bed: { name: 'Cloud bed', category: 'Bedroom', w: 2, d: 3, color: '#b4a7b8', icon: 'bed' },
  cabinet: { name: 'Oak cabinet', category: 'Bedroom', w: 2, d: 1, color: '#b5906b', icon: 'cabinet' },
  counter: { name: 'Kitchen counter', category: 'Kitchen', w: 2, d: 1, color: '#c3b599', icon: 'cooking' },
  plant: { name: 'Happy plant', category: 'Decor', w: 1, d: 1, color: '#708b61', icon: 'plant' },
  rug: { name: 'Woven rug', category: 'Decor', w: 3, d: 2, color: '#d4b59a', icon: 'rug' },
};
export type Kind = keyof typeof catalog;
export type Tile = { x: number; z: number; surface: string; room: string };
export type Wall = { x: number; z: number; axis: 'h' | 'v'; kind: 'wall' | 'door' | 'window' };
export type Furnishing = { id: string; kind: Kind; x: number; z: number; rotation: number; color: string };
export type Room = { id: string; name: string };
export type Plan = { schema: 1; name: string; tiles: Tile[]; walls: Wall[]; furniture: Furnishing[]; rooms: Room[] };
export type Hit = { x: number; z: number; edge: Wall; itemId?: string };
export const tileKey = (p: { x: number; z: number }) => `${p.x},${p.z}`;
export const wallKey = (p: Wall) => `${p.axis},${p.x},${p.z}`;
export function footprint(f: Pick<Furnishing, 'kind' | 'rotation'>) {
  const { w, d } = catalog[f.kind];
  return f.rotation % 180 === 0 ? { w, d } : { w: d, d: w };
}
export function placementError(plan: Plan, item: Furnishing): string {
  const { w, d } = footprint(item);
  const keys = new Set(plan.tiles.map(tileKey));
  for (let x = item.x; x < item.x + w; x++) for (let z = item.z; z < item.z + d; z++) {
    if (!keys.has(`${x},${z}`)) return 'Place the whole piece on a floor.';
  }
  if (item.kind !== 'rug' && plan.furniture.some(other => {
    if (other.id === item.id || other.kind === 'rug') return false;
    const s = footprint(other);
    return item.x < other.x + s.w && item.x + w > other.x && item.z < other.z + s.d && item.z + d > other.z;
  })) return 'Another piece is in the way.';
  if (plan.walls.some(wall => wall.axis === 'h'
    ? wall.z > item.z && wall.z < item.z + d && wall.x < item.x + w && wall.x + 1 > item.x
    : wall.x > item.x && wall.x < item.x + w && wall.z < item.z + d && wall.z + 1 > item.z)) return 'A wall crosses this piece.';
  return '';
}
export function edgeOnFloor(plan: Plan, edge: Wall) {
  return plan.tiles.some(t => edge.axis === 'h' ? t.x === edge.x && (t.z === edge.z || t.z + 1 === edge.z) : t.z === edge.z && (t.x === edge.x || t.x + 1 === edge.x));
}
export function edgeAt(x: number, z: number): Wall {
  const fx = Math.floor(x), fz = Math.floor(z), dx = x - fx, dz = z - fz;
  return Math.min(dx, 1 - dx) < Math.min(dz, 1 - dz)
    ? { x: Math.round(x), z: fz, axis: 'v', kind: 'wall' }
    : { x: fx, z: Math.round(z), axis: 'h', kind: 'wall' };
}
export function emptyPlan(): Plan {
  return { schema: 1, name: 'Our little home', tiles: [], walls: [], furniture: [], rooms: [{ id: 'living', name: 'Living room' }] };
}
export function starterPlan(): Plan {
  const plan = emptyPlan();
  plan.rooms.push({ id: 'kitchen', name: 'Kitchen' }, { id: 'bedroom', name: 'Bedroom' }, { id: 'bathroom', name: 'Bathroom' });
  for (let x = 4; x < 14; x++) for (let z = 5; z < 14; z++) plan.tiles.push({ x, z, surface: z < 10 ? (x < 10 ? 'oak' : 'stone') : (x < 10 ? 'oak' : 'sage'), room: z < 10 ? (x < 10 ? 'living' : 'kitchen') : (x < 10 ? 'bedroom' : 'bathroom') });
  const wall = (x: number, z: number, axis: Wall['axis'], kind: Wall['kind'] = 'wall') => plan.walls.push({ x, z, axis, kind });
  for (let x = 4; x < 14; x++) { wall(x, 5, 'h', [6, 7, 11, 12].includes(x) ? 'window' : 'wall'); wall(x, 14, 'h', x === 8 ? 'door' : [5, 6, 11].includes(x) ? 'window' : 'wall'); wall(x, 10, 'h', [8, 12].includes(x) ? 'door' : 'wall'); }
  for (let z = 5; z < 14; z++) { wall(4, z, 'v', [7, 8, 11].includes(z) ? 'window' : 'wall'); wall(14, z, 'v', [7, 11, 12].includes(z) ? 'window' : 'wall'); wall(10, z, 'v', [8, 12].includes(z) ? 'door' : 'wall'); }
  const add = (kind: Kind, x: number, z: number, rotation = 0) => plan.furniture.push({ id: `starter-${plan.furniture.length}`, kind, x, z, rotation, color: catalog[kind].color });
  add('rug', 6, 7); add('sofa', 5, 6); add('table', 6, 8); add('chair', 8, 9); add('plant', 4, 9);
  add('counter', 11, 5); add('dining', 11, 7); add('plant', 13, 9);
  add('bed', 5, 11); add('cabinet', 7, 10); add('plant', 9, 13); add('cabinet', 11, 10); add('plant', 13, 13);
  return plan;
}
export function validatePlan(input: unknown): Plan {
  const p = input as Plan;
  const check = (valid: boolean, message: string) => { if (!valid) throw new Error(message); };
  const integer = (n: number, max = SIZE - 1) => Number.isInteger(n) && n >= 0 && n <= max;
  const color = (s: string) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
  check(!!p && p.schema === 1 && typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 70, 'This is not a supported Digital Home layout.');
  check(Array.isArray(p.rooms) && p.rooms.length > 0 && p.rooms.length <= 30 && p.rooms.every(r => r && typeof r.id === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(r.id) && typeof r.name === 'string' && r.name.trim().length > 0 && r.name.length <= 60), 'Invalid room list.');
  check(new Set(p.rooms.map(r => r.id)).size === p.rooms.length, 'Duplicate room identifiers.');
  check(Array.isArray(p.tiles) && p.tiles.length <= SIZE * SIZE && p.tiles.every(t => t && integer(t.x) && integer(t.z) && surfaces.some(s => s.id === t.surface) && p.rooms.some(r => r.id === t.room)), 'Invalid floor tiles.');
  check(new Set(p.tiles.map(tileKey)).size === p.tiles.length, 'Duplicate floor tiles.');
  check(Array.isArray(p.walls) && p.walls.length <= 840 && p.walls.every(w => w && ['h', 'v'].includes(w.axis) && integer(w.x, w.axis === 'v' ? SIZE : SIZE - 1) && integer(w.z, w.axis === 'h' ? SIZE : SIZE - 1) && ['wall', 'door', 'window'].includes(w.kind) && edgeOnFloor(p, w)), 'Invalid wall placement.');
  check(new Set(p.walls.map(wallKey)).size === p.walls.length, 'Duplicate wall edges.');
  check(Array.isArray(p.furniture) && p.furniture.length <= 150 && p.furniture.every(f => f && typeof f.id === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(f.id) && Object.hasOwn(catalog, f.kind) && integer(f.x) && integer(f.z) && [0, 90, 180, 270].includes(f.rotation) && color(f.color)), 'Invalid furniture.');
  check(new Set(p.furniture.map(f => f.id)).size === p.furniture.length, 'Duplicate furniture identifiers.');
  for (const item of p.furniture) check(!placementError(p, item), placementError(p, item));
  // Strip unknown properties before accepting an imported or persisted document.
  return { schema: 1, name: p.name.trim(), rooms: p.rooms.map(({ id, name }) => ({ id, name: name.trim() })), tiles: p.tiles.map(({ x, z, surface, room }) => ({ x, z, surface, room })), walls: p.walls.map(({ x, z, axis, kind }) => ({ x, z, axis, kind })), furniture: p.furniture.map(({ id, kind, x, z, rotation, color }) => ({ id, kind, x, z, rotation, color })) };
}
