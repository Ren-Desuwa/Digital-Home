'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Check, ChevronLeft, ChevronRight, Grid2X2, Plus, RotateCcw, Save, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { furnitureCatalog, furnitureFootprint, starterHomePlan, validateHomePlan } from '../lib/home-plan.mjs';

type Room = { id: string; name: string; x: number; z: number; width: number; depth: number; height: number; color: string };
type Furniture = { id: string; roomId: string; kind: keyof typeof furnitureCatalog; x: number; z: number; rotation: number };
type Plan = { rooms: Room[]; furniture: Furniture[] };
type Item = Record<string, any>;
type Point = [number, number, number];
type Face = { points: Point[]; color: string; id: string; roomId: string; label: string; selected: boolean; floor?: boolean };
type Action = (path: string, body?: Item, message?: string, close?: boolean) => Promise<boolean>;
const clone = <T,>(value: T): T => structuredClone(value);
const meters = (cm: number) => Number((cm / 100).toFixed(2));

function Scene({ plan, selectedRoom, selectedItem, yaw, elevation, zoom, walls, counts, onSelect, onOrbit }: { plan: Plan; selectedRoom: string; selectedItem: string; yaw: number; elevation: number; zoom: number; walls: boolean; counts: Record<string, number>; onSelect: (roomId: string, itemId?: string) => void; onOrbit: (delta: number) => void }) {
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const ignoreClick = useRef(false);
  const angle = yaw * Math.PI / 180, tilt = elevation * Math.PI / 180;
  const project = ([x, y, z]: Point) => [x * Math.cos(angle) - z * Math.sin(angle), (x * Math.sin(angle) + z * Math.cos(angle)) * Math.sin(tilt) - y * Math.cos(tilt)];
  const depth = ([x, y, z]: Point) => (x * Math.sin(angle) + z * Math.cos(angle)) * Math.cos(tilt) + y * Math.sin(tilt);
  const faces: Face[] = [];
  function box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, id: string, roomId: string, label: string) {
    const p: Point[] = [[x,y,z],[x+w,y,z],[x+w,y,z+d],[x,y,z+d],[x,y+h,z],[x+w,y+h,z],[x+w,y+h,z+d],[x,y+h,z+d]];
    for (const indices of [[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]]) faces.push({ points: indices.map(i => p[i]), color, id, roomId, label, selected: id === selectedItem });
  }
  plan.rooms.forEach(room => {
    const { x, z, width: w, depth: d } = room;
    faces.push({ points: [[x,0,z],[x+w,0,z],[x+w,0,z+d],[x,0,z+d]], color: room.color, id: room.id, roomId: room.id, label: room.name, selected: room.id === selectedRoom && !selectedItem, floor: true });
    if (walls) {
      // Cutaway walls keep the interior visible from every camera angle.
      const h = Math.min(room.height, 90);
      box(x, 0, z + (Math.cos(angle) >= 0 ? 0 : d - 8), w, h, 8, '#f2ece1', room.id, room.id, room.name);
      box(x + (Math.sin(angle) >= 0 ? 0 : w - 8), 0, z, 8, h, d, '#e5dfd2', room.id, room.id, room.name);
    }
  });
  plan.furniture.forEach(item => {
    const room = plan.rooms.find(r => r.id === item.roomId); if (!room) return;
    const spec = furnitureCatalog[item.kind], size = furnitureFootprint(item);
    const x = room.x + item.x, z = room.z + item.z, label = `${spec.label} in ${room.name}`;
    if (item.kind === 'table') {
      box(x, 62, z, size.width, 13, size.depth, spec.color, item.id, room.id, label);
      [[8,8],[size.width-16,8],[8,size.depth-16],[size.width-16,size.depth-16]].forEach(([a,b]) => box(x+a,0,z+b,8,62,8,'#9b7c61',item.id,room.id,label));
    } else {
      box(x, 0, z, size.width, spec.height, size.depth, spec.color, item.id, room.id, label);
      if (item.kind === 'sofa') {
        const sideways = item.rotation % 180 !== 0;
        const backX = item.rotation === 90 ? size.width - 18 : 0;
        const backZ = item.rotation === 180 ? size.depth - 18 : 0;
        box(x + backX, 75, z + backZ, sideways ? 18 : size.width, 25, sideways ? size.depth : 18, '#778e73', item.id, room.id, label);
      }
      if (item.kind === 'bed') {
        const sideways = item.rotation % 180 !== 0;
        const pillowW = sideways ? 42 : size.width - 20, pillowD = sideways ? size.depth - 20 : 42;
        const pillowX = item.rotation === 270 ? size.width - pillowW - 10 : 10;
        const pillowZ = item.rotation === 180 ? size.depth - pillowD - 10 : 10;
        box(x + pillowX, 55, z + pillowZ, pillowW, 8, pillowD, '#f7f3eb', item.id, room.id, label);
      }
      if (item.kind === 'plant') box(x-4, 70, z-4, 48, 45, 48, '#6c916f', item.id, room.id, label);
    }
  });
  const projected = faces.flatMap(f => f.points.map(project));
  const xs = projected.map(p => p[0]), ys = projected.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(680 / Math.max(100, maxX - minX), 370 / Math.max(100, maxY - minY)) * zoom;
  const screen = (p: Point) => { const [x,y] = project(p); return [400 + (x - (minX + maxX) / 2) * scale, 250 + (y - (minY + maxY) / 2) * scale]; };
  const choose = (roomId: string, itemId?: string) => { if (!ignoreClick.current) onSelect(roomId, itemId); };
  return <svg className="home-scene" viewBox="0 0 800 500" role="group" aria-label="Interactive 3D home layout. Drag to rotate; select rooms and furniture using the controls below." onPointerDown={event => { if (event.button !== 0) return; drag.current = { x: event.clientX, moved: false }; ignoreClick.current = false; }} onPointerMove={event => {
    if (!drag.current) return; const delta = event.clientX - drag.current.x;
    if (drag.current.moved || Math.abs(delta) > 4) { event.currentTarget.setPointerCapture(event.pointerId); drag.current.moved = true; ignoreClick.current = true; onOrbit(delta * .45); drag.current.x = event.clientX; }
  }} onPointerUp={event => { const moved = drag.current?.moved; drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (!moved) ignoreClick.current = false; }} onPointerCancel={() => { drag.current = null; ignoreClick.current = false; }}>
    <title>Your household in 3D</title>
    <defs><pattern id="home-dot-grid" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#dce1d4" /></pattern></defs>
    <rect width="800" height="500" fill="#f5f6ef" /><rect width="800" height="500" fill="url(#home-dot-grid)" />
    <ellipse cx="400" cy="350" rx="270" ry="70" fill="#354d3210" />
    {faces.sort((a,b) => a.floor !== b.floor ? (a.floor ? -1 : 1) : a.points.reduce((n,p) => n + depth(p),0) / a.points.length - b.points.reduce((n,p) => n + depth(p),0) / b.points.length).map((face,i) => <polygon key={i} points={face.points.map(p => screen(p).join(',')).join(' ')} fill={face.color} stroke={face.selected ? '#9c683f' : '#63735b55'} strokeWidth={face.selected ? 2 : .7} strokeLinejoin="round" onClick={() => choose(face.roomId, face.id === face.roomId ? '' : face.id)}><title>{face.label}</title></polygon>)}
    {plan.rooms.map(room => { const [x,y] = screen([room.x + room.width/2, 0, room.z + room.depth/2]); return <g key={room.id} className="home-room-label" onClick={() => choose(room.id)} transform={`translate(${x},${y})`}><rect x="-64" y="-14" width="128" height={counts[room.id] ? 44 : 29} rx="9" fill="#fffdf4ed" stroke={selectedRoom === room.id ? '#9c683f' : '#d4d9c9'} /><text fontFamily="Arial, sans-serif" textAnchor="middle" y="4" fill="#42563d" fontSize="12">{room.name.length > 18 ? room.name.slice(0,17) + '…' : room.name}</text>{counts[room.id] > 0 && <text fontFamily="Arial, sans-serif" textAnchor="middle" y="21" fill="#996238" fontSize="10">{counts[room.id]} due / to review</text>}</g>; })}
  </svg>;
}

function MeterField({ label, value, min = 0, max = 30, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (n: number) => void }) {
  return <label className="field"><span>{label} (m)</span><input type="number" min={min} max={max} step="0.1" value={meters(value)} onChange={e => onChange(Math.round(Number(e.target.value) * 100))} /></label>;
}

export function HomeBuilder({ data, parent, act, refresh }: { data: Item; parent: boolean; act: Action; refresh: () => Promise<void> }) {
  const [plan, setPlan] = useState<Plan>(() => clone(data.homePlan || starterHomePlan()));
  const [version, setVersion] = useState<number>(data.homePlanVersion || 0);
  const [dirty, setDirty] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(plan.rooms[0].id);
  const [selectedItem, setSelectedItem] = useState('');
  const [mode, setMode] = useState<'dashboard' | 'edit'>('dashboard');
  const [yaw, setYaw] = useState(35), [elevation, setElevation] = useState(42), [zoom, setZoom] = useState(1);
  const [walls, setWalls] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [confirmReload, setConfirmReload] = useState(false);
  const room = plan.rooms.find(r => r.id === selectedRoom) || plan.rooms[0];
  const item = plan.furniture.find(f => f.id === selectedItem);
  const incomingVersion = data.homePlanVersion || 0;
  useEffect(() => {
    if (!dirty && incomingVersion > version) { setPlan(clone(data.homePlan || starterHomePlan())); setVersion(incomingVersion); setSelectedItem(''); }
  }, [incomingVersion, dirty, version, data.homePlan]);
  useEffect(() => { if (!parent) setMode('dashboard'); }, [parent]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  let validation = '';
  try { validateHomePlan(plan); } catch (e) { validation = (e as Error).message; }
  const editable = parent && mode === 'edit' && !saving;
  const edit = (next: Plan) => { if (!editable) return; setPlan(next); setDirty(true); setError(''); setConfirmReload(false); };
  const updateRoom = (patch: Partial<Room>) => edit({ ...plan, rooms: plan.rooms.map(r => r.id === room.id ? { ...r, ...patch } : r) });
  const updateItem = (patch: Partial<Furniture>) => edit({ ...plan, furniture: plan.furniture.map(f => f.id === item?.id ? { ...f, ...patch } : f) });
  const select = (roomId: string, itemId = '') => { setSelectedRoom(roomId); setSelectedItem(itemId); };
  const due = (data.occurrences || []).filter((t: Item) => t.date <= new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) && t.status !== 'done');
  // Room links follow the routine, including occurrences created before the link.
  const taskRoom = (task: Item) => data.chores.find((c: Item) => c.id === task.choreId)?.roomId;
  const counts: Record<string, number> = Object.fromEntries(plan.rooms.map(r => [r.id, due.filter((t: Item) => taskRoom(t) === r.id).length]));
  const roomTasks = due.filter((t: Item) => taskRoom(t) === room.id);
  const unassigned = due.filter((t: Item) => !data.homePlan?.rooms.some((r: Room) => r.id === taskRoom(t)));
  const reload = () => { setPlan(clone(data.homePlan || starterHomePlan())); setVersion(incomingVersion); setDirty(false); setError(''); setSelectedItem(''); setConfirmReload(false); };
  async function save() {
    if (!parent || saving || validation) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/home-plan/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, version }) });
      const result = await response.json() as Item;
      if (!response.ok) throw new Error(result.error || 'Unable to save the layout.');
      setPlan(validateHomePlan(plan)); setVersion(result.homePlanVersion);
      await refresh(); setDirty(false);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }
  function addFurniture(kind: Furniture['kind']) {
    const candidate: Furniture = { id: crypto.randomUUID(), kind, roomId: room.id, x: 20, z: 20, rotation: 0 };
    const size = furnitureFootprint(candidate);
    if (size.width + 20 > room.width || size.depth + 20 > room.depth) { setError('This item needs a larger room.'); return; }
    edit({ ...plan, furniture: [...plan.furniture, candidate] }); setSelectedItem(candidate.id);
  }
  return <div className="home-builder">
    <p className="home-note"><a className="text-button" href="/builder" target="_blank" rel="noopener noreferrer">Try Home Studio · grid-based 3D building ↗</a><br />Studio is a separate browser-local sketchbook. Household layouts and chore links stay here.</p>
    <div className="home-builder-toolbar"><div className="segmented"><button className={mode === 'dashboard' ? 'selected' : ''} onClick={() => setMode('dashboard')}>Household view</button>{parent && <button className={mode === 'edit' ? 'selected' : ''} onClick={() => setMode('edit')}>Build & furnish</button>}</div><span className="home-save-state" role="status">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : data.homePlan || version > 0 ? 'Layout saved' : 'Sample layout · not saved'}</span>{parent && <button className="button primary" disabled={saving || Boolean(validation) || incomingVersion > version || (!dirty && version > 0)} onClick={save}><Save size={16} />{saving ? 'Saving…' : 'Save layout'}</button>}</div>
    {!data.homePlan && version === 0 && <p className="home-note">{parent ? 'Start with this sample home. Edit the rooms to match your home, then save your layout.' : 'This is a sample home. A parent can build and save your household’s layout.'}</p>}
    {incomingVersion > version && <p className="form-error" role="alert">A newer layout was saved on another device. Reload it before saving your changes.</p>}
    {(error || validation) && <p className="form-error" role="alert">{error || validation}</p>}
    <div className="home-builder-grid"><section className="panel home-viewport"><div className="home-viewport-heading"><span><Box size={17} />{mode === 'edit' ? 'Make room for your everyday' : 'Your home, together'}</span><label><input type="checkbox" checked={walls} onChange={e => setWalls(e.target.checked)} /> Cutaway walls</label></div>
      <Scene plan={plan} selectedRoom={room.id} selectedItem={selectedItem} yaw={yaw} elevation={elevation} zoom={zoom} walls={walls} counts={mode === 'dashboard' ? counts : {}} onSelect={select} onOrbit={delta => setYaw(value => (value + delta + 360) % 360)} />
      <div className="home-camera"><button className="icon-button" aria-label="Rotate view left" onClick={() => setYaw(v => (v - 30 + 360) % 360)}><ChevronLeft size={19} /></button><button className="icon-button" aria-label="Rotate view right" onClick={() => setYaw(v => (v + 30) % 360)}><ChevronRight size={19} /></button><span /><button className="icon-button" aria-label="Zoom out" disabled={zoom <= .7} onClick={() => setZoom(v => Math.max(.7, v - .15))}><ZoomOut size={18} /></button><button className="icon-button" aria-label="Zoom in" disabled={zoom >= 1.6} onClick={() => setZoom(v => Math.min(1.6, v + .15))}><ZoomIn size={18} /></button><button className="text-button" onClick={() => { setElevation(v => v === 90 ? 42 : 90); setZoom(1); }}><Grid2X2 size={15} />{elevation === 90 ? '3D view' : 'Top view'}</button><button className="icon-button" aria-label="Reset camera" onClick={() => { setYaw(35); setElevation(42); setZoom(1); }}><RotateCcw size={16} /></button></div>
      <p className="home-view-hint">Drag to rotate · choose a room below · dimensions in metres</p>
      <div className="home-room-tabs" aria-label="Rooms">{plan.rooms.map(r => <button key={r.id} className={r.id === room.id ? 'selected' : ''} onClick={() => select(r.id)}><span style={{ background: r.color }} />{r.name}{mode === 'dashboard' && counts[r.id] > 0 && <b>{counts[r.id]}</b>}</button>)}</div>
    </section>
    <aside className="panel home-inspector"><div className="panel-heading"><div><span className="eyebrow">{mode === 'edit' ? 'ROOM DETAILS' : 'AROUND THIS ROOM'}</span><h2>{room.name}</h2><p>{meters(room.width)} × {meters(room.depth)} m · {meters(room.width * room.depth / 100)} m²</p></div></div>
      {mode === 'edit' && parent ? <fieldset className="home-editor-fields" disabled={!editable}>
        <label className="field"><span>Room name</span><input value={room.name} maxLength={60} onChange={e => updateRoom({ name: e.target.value })} /></label>
        <div className="form-grid"><MeterField label="Width" value={room.width} min={1} max={15} onChange={width => updateRoom({ width })} /><MeterField label="Depth" value={room.depth} min={1} max={15} onChange={depth => updateRoom({ depth })} /><MeterField label="Position X" value={room.x} onChange={x => updateRoom({ x })} /><MeterField label="Position Z" value={room.z} onChange={z => updateRoom({ z })} /><MeterField label="Wall height" value={room.height} min={2} max={5} onChange={height => updateRoom({ height })} /><label className="field"><span>Floor color</span><input type="color" value={room.color} onChange={e => updateRoom({ color: e.target.value })} /></label></div>
        <p className="home-note">X and Z position rooms on a 30 × 30 m site. Rooms may share an edge; their floors must not overlap.</p>
        <div className="row-actions"><button className="button secondary" disabled={plan.rooms.length >= 20} onClick={() => { const next: Room = { id: crypto.randomUUID(), name: `Room ${plan.rooms.length + 1}`, x: 0, z: Math.max(...plan.rooms.map(r => r.z + r.depth)), width: 300, depth: 300, height: 270, color: '#e7e0d1' }; edit({ ...plan, rooms: [...plan.rooms, next] }); select(next.id); }}><Plus size={15} /> Room</button><button className="text-button danger" disabled={plan.rooms.length <= 1} onClick={() => { const rooms = plan.rooms.filter(r => r.id !== room.id); edit({ rooms, furniture: plan.furniture.filter(f => f.roomId !== room.id) }); select(rooms[0].id); }}><Trash2 size={14} /> Remove room</button></div><small className="home-note">Removing a room removes its furniture and clears its chore links when saved.</small>
        <h3>Furnish this room</h3><div className="home-catalog">{(Object.keys(furnitureCatalog) as Furniture['kind'][]).map(kind => <button className="button secondary" key={kind} disabled={plan.furniture.length >= 100} onClick={() => addFurniture(kind)}><Plus size={13} />{furnitureCatalog[kind].label}</button>)}</div>
        <label className="field"><span>Selected furniture</span><select value={item?.roomId === room.id ? item.id : ''} onChange={e => setSelectedItem(e.target.value)}><option value="">Choose an item</option>{plan.furniture.filter(f => f.roomId === room.id).map((f,i) => <option value={f.id} key={f.id}>{furnitureCatalog[f.kind].label} {i + 1}</option>)}</select></label>
        {item && <><div className="form-grid"><MeterField label="Item X" value={item.x} max={15} onChange={x => updateItem({ x })} /><MeterField label="Item Z" value={item.z} max={15} onChange={z => updateItem({ z })} /></div><div className="row-actions"><button className="button secondary" onClick={() => updateItem({ rotation: (item.rotation + 90) % 360 })}><RotateCcw size={14} />Rotate {item.rotation}°</button><button className="text-button danger" onClick={() => { edit({ ...plan, furniture: plan.furniture.filter(f => f.id !== item.id) }); setSelectedItem(''); }}><Trash2 size={14} />Remove item</button></div></>}
        <div className="home-reload"><button className="text-button" onClick={() => dirty ? setConfirmReload(true) : reload()}>Reload saved layout</button>{confirmReload && <div><p>Discard your unsaved layout changes?</p><button className="text-button danger" onClick={reload}>Discard and reload</button><button className="text-button" onClick={() => setConfirmReload(false)}>Keep editing</button></div>}</div>
      </fieldset> : <div className="home-room-dashboard">
        {roomTasks.length ? roomTasks.map((task: Item) => <div className="home-task" key={task.id}><span>{task.status === 'pending' ? '◷' : '○'}</span><div><strong>{task.title}</strong><p>{data.members.find((m: Item) => m.id === task.assigneeId)?.name} · {task.status === 'pending' ? 'Needs parent review' : `${task.date} · ${task.time}`}</p></div></div>) : <p className="home-note"><Check size={16} /> No chores due in this room.</p>}
        {parent && <form onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const id = new FormData(form).get('choreId'); if (id && await act('chores/set-room', { id, roomId: room.id }, 'Routine linked to room.', false)) form.reset(); }}><label className="field"><span>Link a routine to this room</span><select name="choreId" required disabled={!data.homePlan?.rooms.some((r: Room) => r.id === room.id)} defaultValue=""><option value="" disabled>Choose a routine</option>{data.chores.filter((c: Item) => !c.archived && c.roomId !== room.id).map((c: Item) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><button className="button secondary" disabled={saving || !data.homePlan?.rooms.some((r: Room) => r.id === room.id)}>Link routine</button>{!data.homePlan && <p className="home-note">Save your home layout before linking chores.</p>}</form>}
        {data.chores.filter((c: Item) => !c.archived && c.roomId === room.id).map((c: Item) => <div className="home-linked-routine" key={c.id}><span>{c.title}</span>{parent && <button className="text-button" onClick={() => act('chores/set-room', { id: c.id, roomId: null }, 'Room link removed.', false)}>Unlink</button>}</div>)}
        <h3>Who’s around?</h3>{data.members.map((m: Item) => <div className="home-member" key={m.id}><span className={`home-presence ${m.status}`} /><strong>{m.name}</strong><small>{m.status === 'home' ? 'Home' : 'Away'}</small></div>)}
        {unassigned.length > 0 && <p className="home-note">{unassigned.length} due / pending {unassigned.length === 1 ? 'chore has' : 'chores have'} no room link yet.</p>}
        {dirty && <p className="home-note">Previewing unsaved layout changes. Save to share this layout.</p>}
      </div>}
    </aside></div>
  </div>;
}
