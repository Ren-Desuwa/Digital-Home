export const furnitureCatalog = {
  sofa: { label: 'Sofa', width: 200, depth: 90, height: 75, color: '#91a58b' },
  table: { label: 'Table', width: 140, depth: 80, height: 75, color: '#c5a17c' },
  bed: { label: 'Bed', width: 160, depth: 200, height: 55, color: '#b5afc7' },
  cabinet: { label: 'Cabinet', width: 100, depth: 50, height: 160, color: '#c9ad89' },
  plant: { label: 'Plant', width: 40, depth: 40, height: 100, color: '#648b6b' },
};

export function starterHomePlan() {
  return {
    rooms: [
      { id: 'living', name: 'Living room', x: 0, z: 0, width: 500, depth: 400, height: 270, color: '#e9dfcc' },
      { id: 'kitchen', name: 'Kitchen', x: 500, z: 0, width: 300, depth: 400, height: 270, color: '#dce5d5' },
      { id: 'bedroom', name: 'Bedroom', x: 0, z: 400, width: 500, depth: 300, height: 270, color: '#e6deeb' },
    ],
    furniture: [
      { id: 'sofa-1', roomId: 'living', kind: 'sofa', x: 40, z: 40, rotation: 0 },
      { id: 'table-1', roomId: 'living', kind: 'table', x: 100, z: 210, rotation: 0 },
      { id: 'plant-1', roomId: 'living', kind: 'plant', x: 420, z: 40, rotation: 0 },
      { id: 'cabinet-1', roomId: 'kitchen', kind: 'cabinet', x: 170, z: 20, rotation: 0 },
      { id: 'bed-1', roomId: 'bedroom', kind: 'bed', x: 40, z: 40, rotation: 90 },
    ],
  };
}

export function furnitureFootprint(item) {
  const spec = furnitureCatalog[item.kind];
  return item.rotation % 180 === 0 ? { width: spec.width, depth: spec.depth } : { width: spec.depth, depth: spec.width };
}

// Keep the same bounded geometry contract on the server and in the editor.
export function validateHomePlan(input) {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const integer = (v, min, max, label) => { check(Number.isInteger(v) && v >= min && v <= max, `${label} must be ${min}–${max} cm.`); return v; };
  const identifier = v => { check(typeof v === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(v), 'Invalid layout identifier.'); return v; };
  check(input && Array.isArray(input.rooms) && input.rooms.length >= 1 && input.rooms.length <= 20, 'Use 1–20 rooms.');
  check(Array.isArray(input.furniture) && input.furniture.length <= 100, 'Use up to 100 furniture items.');
  const rooms = input.rooms.map(r => {
    check(r && typeof r === 'object', 'Invalid room.');
    check(typeof r.name === 'string' && r.name.trim().length > 0 && r.name.trim().length <= 60, 'Room names must be 1–60 characters.');
    check(typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color), 'Choose a valid floor color.');
    const room = { id: identifier(r.id), name: r.name.trim(), x: integer(r.x, 0, 3000, 'Room X'), z: integer(r.z, 0, 3000, 'Room Z'), width: integer(r.width, 100, 1500, 'Room width'), depth: integer(r.depth, 100, 1500, 'Room depth'), height: integer(r.height, 200, 500, 'Room height'), color: r.color };
    check(room.x + room.width <= 3000 && room.z + room.depth <= 3000, 'Keep rooms inside the 30 × 30 m site.');
    return room;
  });
  check(new Set(rooms.map(r => r.id)).size === rooms.length, 'Room identifiers must be unique.');
  rooms.forEach((a, i) => rooms.slice(i + 1).forEach(b => {
    check(!(a.x < b.x + b.width && a.x + a.width > b.x && a.z < b.z + b.depth && a.z + a.depth > b.z), `${a.name} overlaps ${b.name}. Move or resize a room.`);
  }));
  const furniture = input.furniture.map(f => {
    check(f && typeof f === 'object', 'Invalid furniture item.');
    check(Object.hasOwn(furnitureCatalog, f.kind), 'Choose a supported furniture type.');
    const room = rooms.find(r => r.id === f.roomId);
    check(room, 'Furniture must belong to a room.');
    check([0, 90, 180, 270].includes(f.rotation), 'Use a quarter-turn furniture rotation.');
    const item = { id: identifier(f.id), roomId: room.id, kind: f.kind, x: integer(f.x, 0, 3000, 'Furniture X'), z: integer(f.z, 0, 3000, 'Furniture Z'), rotation: f.rotation };
    const size = furnitureFootprint(item);
    check(item.x + size.width <= room.width && item.z + size.depth <= room.depth, `${furnitureCatalog[item.kind].label} must fit inside ${room.name}.`);
    return item;
  });
  check(new Set(furniture.map(f => f.id)).size === furniture.length, 'Furniture identifiers must be unique.');
  return { rooms, furniture };
}
