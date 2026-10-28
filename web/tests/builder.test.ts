import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, edgeAt, edgeOnFloor, emptyPlan, footprint, placementError, starterPlan, validatePlan, wallKey, type Furnishing, type Plan } from '../builder/model';
const fixture = (): Plan => ({ ...emptyPlan(), tiles: Array.from({ length: 16 }, (_, i) => ({ x: i % 4, z: Math.floor(i / 4), surface: 'oak', room: 'living' })) });
const piece = (patch: Partial<Furnishing> = {}): Furnishing => ({ id: 'test-piece', kind: 'sofa', x: 0, z: 0, rotation: 0, color: catalog.sofa.color, ...patch });
test('starter layout is valid and survives a save/export/import round-trip', () => {
  const p = starterPlan(); assert.equal(p.tiles.length, 90); assert.equal(p.rooms.length, 4);
  assert.deepEqual(validatePlan(JSON.parse(JSON.stringify(p))), p); assert.deepEqual(validatePlan(emptyPlan()), emptyPlan());
});
test('quarter turns swap the footprint and require the entire piece to fit', () => {
  assert.deepEqual(footprint(piece()), { w: 3, d: 1 }); assert.deepEqual(footprint(piece({ rotation: 90 })), { w: 1, d: 3 });
  assert.equal(placementError(fixture(), piece({ x: 3 })), 'Place the whole piece on a floor.');
  assert.equal(placementError(fixture(), piece({ x: 3, rotation: 90 })), '');
  const p = fixture(); p.tiles = p.tiles.filter(t => t.x !== 1 || t.z !== 0); assert.match(placementError(p, piece()), /whole piece/);
});
test('furniture collision checks permit rugs and ignore the item being moved', () => {
  const p = fixture(); p.furniture.push(piece()); assert.equal(placementError(p, piece({ x: 1 })), '');
  assert.match(placementError(p, piece({ id: 'other' })), /Another piece/);
  assert.equal(placementError(p, piece({ id: 'rug', kind: 'rug' })), '');
  p.furniture = [piece({ kind: 'rug' })]; assert.equal(placementError(p, piece({ id: 'chair', kind: 'chair' })), '');
});
test('furniture cannot cross walls or openings but may touch an edge', () => {
  const p = fixture(); p.walls.push({ axis: 'v', x: 1, z: 0, kind: 'door' }); assert.match(placementError(p, piece()), /wall crosses/);
  p.walls[0].x = 0; assert.equal(placementError(p, piece()), '');
  p.walls = [{ axis: 'h', x: 0, z: 1, kind: 'window' }]; assert.match(placementError(p, piece({ rotation: 90 })), /wall crosses/);
});
test('shared tile edges have one canonical identity and require adjacent floor', () => {
  assert.equal(wallKey(edgeAt(.99, .5)), wallKey(edgeAt(1.01, .5))); assert.equal(wallKey(edgeAt(.5, .99)), wallKey(edgeAt(.5, 1.01)));
  assert.equal(edgeOnFloor(fixture(), { x: 4, z: 0, axis: 'v', kind: 'wall' }), true);
  assert.equal(edgeOnFloor(fixture(), { x: 5, z: 0, axis: 'v', kind: 'wall' }), false);
});
test('import rejects duplicate, out-of-bounds, unsupported and orphaned geometry', () => {
  const mutations: ((p: Plan) => void)[] = [
    p => { p.tiles.push({ ...p.tiles[0] }); }, p => { p.tiles[0].x = -1; }, p => { p.tiles[0].x = 20; },
    p => { p.tiles[0].surface = 'unknown'; }, p => { p.tiles[0].room = 'missing'; }, p => { p.rooms.push({ ...p.rooms[0] }); },
    p => { p.walls.push({ x: 9, z: 9, axis: 'h', kind: 'wall' }); },
    p => { p.walls.push({ x: 0, z: 0, axis: 'h', kind: 'wall' }, { x: 0, z: 0, axis: 'h', kind: 'door' }); },
    p => { p.furniture.push(piece({ rotation: 45 })); }, p => { p.furniture.push(piece({ color: 'url(example)' })); },
    p => { p.furniture.push(piece({ x: 3 })); }, p => { p.furniture.push(piece(), piece()); },
    p => { p.furniture.push(piece(), piece({ id: 'different' })); }, p => { p.schema = 2 as 1; }, p => { p.name = ''; },
  ];
  for (const mutate of mutations) { const p = fixture(); mutate(p); assert.throws(() => validatePlan(p)); }
  for (const p of [null, {}, [], { schema: 1, name: 'Bad' }]) assert.throws(() => validatePlan(p));
});
test('import strips unknown fields and rejects colliding furniture added across walls', () => {
  const p = { ...fixture(), token: 'discard', furniture: [piece()] }; assert.equal('token' in validatePlan(p), false);
  p.walls = [{ axis: 'v', x: 1, z: 0, kind: 'wall' }]; assert.throws(() => validatePlan(p), /wall crosses/);
});
