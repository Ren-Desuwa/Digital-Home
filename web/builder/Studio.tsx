'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Armchair, ArrowDownToLine, ArrowLeft, ArrowUpFromLine, BedDouble, Box, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Columns3, CookingPot, DoorOpen, Eraser, Expand, Grid2X2, Hand, House, Layers3, Leaf, Minus, MousePointer2, Plus, Redo2, RotateCcw, RotateCw, Save, Settings2, Sofa, Sparkles, Square, SquareDashed, Table2, Trash2, Undo2, X } from 'lucide-react';
import { SIZE, STORAGE_KEY, catalog, edgeAt, edgeOnFloor, emptyPlan, footprint, placementError, starterPlan, surfaces, tileKey, validatePlan, wallKey, type Furnishing, type Hit, type Kind, type Plan, type Wall } from './model';
import type { HomeScene } from './scene';
import './studio.css';

type Tool = 'select' | 'orbit' | 'floor' | 'room' | 'wall' | 'door' | 'window' | 'furniture' | 'erase-floor' | 'erase-wall';
type History = { past: Plan[]; present: Plan; future: Plan[] };
const icons = { sofa: Sofa, armchair: Armchair, table: Table2, bed: BedDouble, cabinet: Columns3, cooking: CookingPot, plant: Leaf, rug: SquareDashed };
const tools: { id: Tool; label: string; icon: typeof Square }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2 }, { id: 'floor', label: 'Floors', icon: Grid2X2 }, { id: 'wall', label: 'Walls', icon: Columns3 },
  { id: 'door', label: 'Doors', icon: DoorOpen }, { id: 'window', label: 'Windows', icon: Square }, { id: 'erase-floor', label: 'Erase', icon: Eraser },
];
function download(url: string, name: string) { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); }

export default function Studio() {
  const [history, setHistory] = useState<History>(() => ({ past: [], present: starterPlan(), future: [] }));
  const current = useRef(history); current.current = history;
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>('select');
  const [mode, setMode] = useState<'build' | 'explore'>('build');
  const [kind, setKind] = useState<Kind>('sofa');
  const [rotation, setRotation] = useState(0);
  const [surface, setSurface] = useState('oak');
  const [roomId, setRoomId] = useState('living');
  const [selected, setSelected] = useState('');
  const [moving, setMoving] = useState('');
  const [category, setCategory] = useState('All');
  const [top, setTop] = useState(false);
  const [cutaway, setCutaway] = useState(true);
  const [grid, setGrid] = useState(true);
  const [panel, setPanel] = useState(true);
  const [saved, setSaved] = useState('Loading your home…');
  const [notice, setNotice] = useState('');
  const [newDialog, setNewDialog] = useState(false);
  const [help, setHelp] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [cursor, setCursor] = useState<Hit | null>(null);
  const [keyboardX, setKeyboardX] = useState(4), [keyboardZ, setKeyboardZ] = useState(5);
  const [edgeAxis, setEdgeAxis] = useState<'h' | 'v'>('h');
  const [storageBlocked, setStorageBlocked] = useState(false);
  const sceneHost = useRef<HTMLDivElement>(null);
  const scene = useRef<HomeScene | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  const painting = useRef(false);
  const savedPlan = useRef('');
  const plan = history.present;
  const item = plan.furniture.find(f => f.id === selected);
  const room = plan.rooms.find(r => r.id === roomId) || plan.rooms[0];
  const options = { edit: mode === 'build', tool: mode === 'build' ? tool : 'orbit', top, cutaway, grid, selected };
  const callbacks = useRef({ hit: (_hit: Hit, _paint: boolean) => {}, hover: (_hit: Hit | null) => {} });

  function commit(next: Plan, paint = false) {
    const h = current.current;
    if (JSON.stringify(next) === JSON.stringify(h.present)) return;
    const nextHistory = { past: paint && painting.current ? h.past : [...h.past.slice(-59), h.present], present: next, future: [] };
    if (paint) painting.current = true;
    current.current = nextHistory; setHistory(nextHistory); setSaved('Unsaved changes');
  }
  function undo() { setSaved('Unsaved changes'); const h = current.current; if (!h.past.length) return; const next = { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }; current.current = next; setHistory(next); setSelected(''); setMoving(''); painting.current = false; }
  function redo() { setSaved('Unsaved changes'); const h = current.current; if (!h.future.length) return; const next = { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }; current.current = next; setHistory(next); setSelected(''); setMoving(''); }
  function save(p = current.current.present) {
    try { validatePlan(p); const value = JSON.stringify(p); localStorage.setItem(STORAGE_KEY, value); savedPlan.current = value; setSaved('Saved in this browser'); setStorageBlocked(false); return true; }
    catch { setSaved('Couldn’t save on this device'); setNotice('Browser storage is unavailable or full. Export your layout to keep a copy.'); return false; }
  }
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { const p = validatePlan(JSON.parse(raw)); const h = { past: [], present: p, future: [] }; current.current = h; setHistory(h); setRoomId(p.rooms[0].id); savedPlan.current = JSON.stringify(p); }
      setSaved(raw ? 'Saved in this browser' : 'Sample home · make it yours');
    } catch { setStorageBlocked(true); setSaved('Saved layout could not be loaded'); setNotice('Your stored layout was left untouched. Import a backup or start a new home to continue saving.'); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || storageBlocked) return;
    const timeout = setTimeout(() => save(plan), 900);
    return () => clearTimeout(timeout);
  }, [plan, ready, storageBlocked]);
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => { if (ready && JSON.stringify(current.current.present) !== savedPlan.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const listener = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && e.newValue !== savedPlan.current) { setStorageBlocked(true); setSaved('Changed in another tab'); setNotice('This home changed in another tab. Export your work, then reload to use that version. Automatic saving is paused.'); }
    };
    window.addEventListener('storage', listener); return () => window.removeEventListener('storage', listener);
  }, [ready]);
  useEffect(() => {
    if (!sceneHost.current || fallback) return;
    let disposed = false;
    import('./scene').then(({ HomeScene }) => {
      if (disposed || !sceneHost.current) return;
      try {
        scene.current = new HomeScene(sceneHost.current, current.current.present, options, (h, p) => callbacks.current.hit(h, p), h => callbacks.current.hover(h), () => { painting.current = false; });
        setSceneReady(true);
      } catch { setFallback(true); setNotice('3D is unavailable in this browser. You can still build in the interactive floor plan.'); }
    }).catch(() => { if (!disposed) { setFallback(true); setNotice('The 3D view could not load. The floor plan is available.'); } });
    return () => { disposed = true; scene.current?.dispose(); scene.current = null; setSceneReady(false); };
  }, [fallback]);
  useEffect(() => { scene.current?.update(plan, options); }, [plan, tool, top, cutaway, grid, selected, mode, sceneReady]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea,dialog') || newDialog || help) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!storageBlocked) save(); }
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && mode === 'build') rotate();
      if (e.key === 'Escape') { chooseTool('select'); setSelected(''); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && mode === 'build') { e.preventDefault(); removeItem(); }
    };
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  });
  useEffect(() => { if (newDialog || help) modalRef.current?.showModal(); else modalRef.current?.close(); }, [newDialog, help]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(t); }, [notice]);
  useEffect(() => { if (!plan.rooms.some(r => r.id === roomId)) setRoomId(plan.rooms[0].id); if (selected && !plan.furniture.some(f => f.id === selected)) setSelected(''); }, [plan, roomId, selected]);

  function chooseTool(next: Tool) { setTool(next); setMoving(''); painting.current = false; scene.current?.hover(null, null, true); }
  function candidate(hit: Hit): Furnishing { return { id: moving || 'preview', kind, x: hit.x, z: hit.z, rotation, color: moving ? (plan.furniture.find(f => f.id === moving)?.color || catalog[kind].color) : catalog[kind].color }; }
  function errorFor(hit: Hit) {
    if (tool === 'furniture') return placementError(plan, candidate(hit));
    if (['wall', 'door', 'window'].includes(tool)) {
      if (!edgeOnFloor(plan, hit.edge)) return 'Build a floor next to this edge first.';
      const walls = [...plan.walls.filter(w => wallKey(w) !== wallKey(hit.edge)), { ...hit.edge, kind: tool as Wall['kind'] }];
      if (plan.furniture.some(f => placementError({ ...plan, walls }, f))) return 'Move the furniture crossing this edge first.';
    }
    return '';
  }
  callbacks.current.hover = hit => {
    setCursor(hit);
    scene.current?.hover(hit, hit && tool === 'furniture' ? candidate(hit) : null, !hit || !errorFor(hit));
  };
  callbacks.current.hit = (hit, paint) => {
    if (mode === 'explore' || tool === 'select' || tool === 'orbit') {
      setSelected(hit.itemId || ''); const tile = plan.tiles.find(t => t.x === hit.x && t.z === hit.z); if (tile) setRoomId(tile.room); return;
    }
    const error = errorFor(hit); if (error) { setNotice(error); return; }
    if (tool === 'floor') {
      commit({ ...plan, tiles: [...plan.tiles.filter(t => tileKey(t) !== tileKey(hit)), { x: hit.x, z: hit.z, surface, room: room.id }] }, paint);
    } else if (tool === 'room') {
      commit({ ...plan, tiles: plan.tiles.map(t => tileKey(t) === tileKey(hit) ? { ...t, room: room.id } : t) }, paint);
    } else if (['wall', 'door', 'window'].includes(tool)) {
      commit({ ...plan, walls: [...plan.walls.filter(w => wallKey(w) !== wallKey(hit.edge)), { ...hit.edge, kind: tool as Wall['kind'] }] }, paint);
    } else if (tool === 'erase-wall') {
      commit({ ...plan, walls: plan.walls.filter(w => wallKey(w) !== wallKey(hit.edge)) }, paint);
    } else if (tool === 'erase-floor') {
      const tiles = plan.tiles.filter(t => tileKey(t) !== tileKey(hit));
      const next = { ...plan, tiles, walls: plan.walls.filter(w => edgeOnFloor({ ...plan, tiles }, w)) };
      if (plan.furniture.some(f => placementError(next, f))) { setNotice('Move or remove the furniture on this tile first.'); return; }
      commit(next, paint);
    } else if (tool === 'furniture') {
      if (plan.furniture.length >= 150 && !moving) { setNotice('This home can hold up to 150 furniture pieces.'); return; }
      const f = { ...candidate(hit), id: moving || crypto.randomUUID() };
      commit({ ...plan, furniture: [...plan.furniture.filter(i => i.id !== f.id), f] });
      setSelected(f.id); if (moving) chooseTool('select');
    }
  };
  function rotate() {
    if (tool === 'furniture') { setRotation((rotation + 90) % 360); return; }
    if (item) { const next = { ...item, rotation: (item.rotation + 90) % 360 }; const error = placementError(plan, next); if (error) setNotice(error); else commit({ ...plan, furniture: plan.furniture.map(f => f.id === item.id ? next : f) }); }
  }
  function removeItem() { if (!item) return; commit({ ...plan, furniture: plan.furniture.filter(f => f.id !== item.id) }); setSelected(''); chooseTool('select'); }
  function reset(empty: boolean) { commit(empty ? emptyPlan() : starterPlan()); setRoomId('living'); setSelected(''); chooseTool(empty ? 'floor' : 'select'); setNewDialog(false); setStorageBlocked(false); scene.current?.reset(); setNotice(empty ? 'A fresh plot. Start by painting a floor.' : 'Starter home loaded. Make yourself at home.'); }
  function exportPlan() {
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
    download(url, 'digital-home-layout.json'); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Layout exported. Import this file to continue on another device.');
  }
  async function importPlan(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try { if (file.size > 1000000) throw new Error('Choose a layout file smaller than 1 MB.'); const next = validatePlan(JSON.parse(await file.text())); commit(next); setRoomId(next.rooms[0].id); setSelected(''); setStorageBlocked(false); chooseTool('select'); setNotice('Layout imported. You can undo to return to your previous home.'); }
    catch (error) { setNotice(error instanceof SyntaxError ? 'That file is not valid JSON.' : (error as Error).message); }
    e.target.value = '';
  }
  const hint = mode === 'explore' || tool === 'orbit' ? 'Drag to orbit · scroll to zoom · two fingers to pan' : tool === 'furniture' ? `${moving ? 'Move' : 'Place'} ${catalog[kind].name.toLowerCase()} · R to rotate · right-drag to orbit` : tool === 'select' ? 'Select a piece or room · right-drag to orbit · scroll to zoom' : ['wall', 'door', 'window', 'erase-wall'].includes(tool) ? 'Choose a tile edge · drag to draw walls · right-drag to orbit' : 'Click or drag across tiles · right-drag to orbit · scroll to zoom';
  const keyboardHit: Hit = { x: keyboardX, z: keyboardZ, edge: { x: keyboardX, z: keyboardZ, axis: edgeAxis, kind: 'wall' } };

  return <main className="studio">
    <header className="studio-header">
      <a className="studio-brand" href="/" aria-label="Digital Home studio"><span className="brand-mark"><House size={22} strokeWidth={1.7} /></span><span>digital home<small>A LITTLE SPACE TO MAKE YOURS</small></span></a>
      <nav className="studio-mode" aria-label="Studio mode"><button className={mode === 'build' ? 'active' : ''} onClick={() => setMode('build')}><Box size={15} />Build mode</button><button className={mode === 'explore' ? 'active' : ''} onClick={() => { setMode('explore'); setMoving(''); }}><House size={15} />Explore</button></nav>
      <div className="header-actions"><button className="studio-icon help-button" aria-label="How to build" onClick={() => setHelp(true)}><CircleHelp size={19} /></button><button className="studio-button save-button" aria-label="Save home" disabled={!ready || storageBlocked} onClick={() => save() && setNotice('Saved on this browser. Export a copy to use it on another device.')}><Save size={16} /><span>Save home</span></button><span className="studio-avatar" aria-label="Your personal studio">R</span></div>
    </header>
    <div className="studio-titlebar"><div><div className="studio-eyebrow"><span />YOUR HOME STUDIO</div><h1>Your home, your way<span>.</span></h1><p>A little imagination. A place that feels like you.</p></div><button className="new-home studio-button secondary" onClick={() => setNewDialog(true)}><Plus size={16} />New home</button></div>
    <div className="studio-workspace">
      <aside className={`studio-catalog ${mode === 'explore' ? 'exploring' : ''}`} aria-label="Building catalog">
        <div className="catalog-heading"><h2>Make yourself at home</h2><Sparkles size={17} /></div>
        {mode === 'explore' ? <div className="explore-note"><House size={32} /><h3>Room to breathe.</h3><p>Take a look around. Drag the house to rotate, or select a room to see its details.</p><button className="studio-button secondary" onClick={() => setMode('build')}>Back to building</button></div> : <>
          <span className="catalog-label">THE FOUNDATIONS</span>
          <div className="build-tools">{tools.map(({ id, label, icon: Icon }) => <button key={id} aria-pressed={tool === id || id === 'erase-floor' && tool === 'erase-wall'} className={tool === id || id === 'erase-floor' && tool === 'erase-wall' ? 'active' : ''} onClick={() => chooseTool(id)}><Icon size={21} strokeWidth={1.5} /><span>{label}</span></button>)}</div>
          {['floor', 'room'].includes(tool) && <div className="material-section"><label className="catalog-label" htmlFor="paint-room">PAINT INTO ROOM</label><select id="paint-room" value={room.id} onChange={e => setRoomId(e.target.value)}>{plan.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select><span className="catalog-label">FLOOR FINISH</span><div className="surface-swatches">{surfaces.map(s => <button key={s.id} title={s.label} aria-label={s.label} aria-pressed={surface === s.id} style={{ background: s.color }} className={surface === s.id ? 'active' : ''} onClick={() => setSurface(s.id)}>{surface === s.id && <Check size={17} />}</button>)}</div><small>{surfaces.find(s => s.id === surface)?.label} · one tile = 1 m²</small></div>}
          {tool.startsWith('erase') && <div className="erase-options"><button className={tool === 'erase-floor' ? 'active' : ''} onClick={() => chooseTool('erase-floor')}>Floor tiles</button><button className={tool === 'erase-wall' ? 'active' : ''} onClick={() => chooseTool('erase-wall')}>Wall edges</button><small>Select a furniture piece to remove it.</small></div>}
          <div className="catalog-divider" />
          <div className="furniture-heading"><span className="catalog-label">THE LITTLE DETAILS</span><span>{Object.keys(catalog).length} pieces</span></div>
          <div className="catalog-categories" aria-label="Furniture categories">{['All', 'Living', 'Bedroom', 'Kitchen', 'Decor'].map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div>
          <div className="furniture-catalog">{(Object.entries(catalog) as [Kind, typeof catalog[Kind]][]).filter(([, spec]) => category === 'All' || category === spec.category).map(([id, spec]) => { const Icon = icons[spec.icon as keyof typeof icons]; return <button key={id} className={tool === 'furniture' && kind === id ? 'active' : ''} aria-pressed={tool === 'furniture' && kind === id} onClick={() => { chooseTool('furniture'); setKind(id); setRotation(0); setSelected(''); }}><span className={`furniture-art art-${id}`}><Icon size={42} strokeWidth={1.2} style={{ color: spec.color }} /></span><strong>{spec.name}</strong><small>{spec.w} × {spec.d} m</small></button>; })}</div>
          {tool === 'furniture' && <button className="rotate-placement studio-button secondary" onClick={rotate}><RotateCw size={15} />Rotate piece <span>{rotation}°</span></button>}
        </>}
        <div className="catalog-bottom"><Leaf size={16} /><p>Small touches.<br /><strong>Very you.</strong></p></div>
      </aside>
      <section className="studio-viewport" aria-label="Home design workspace">
        <div className="viewport-toolbar"><div className="home-name"><House size={17} /><input aria-label="Home name" maxLength={70} value={plan.name} onChange={e => { if (e.target.value.trim()) commit({ ...plan, name: e.target.value }); }} /><ChevronDown size={13} /></div><span className="floor-badge"><Layers3 size={13} />Ground floor</span><div className="history-controls"><button className="studio-icon" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!history.past.length} onClick={undo}><Undo2 size={17} /></button><button className="studio-icon" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!history.future.length} onClick={redo}><Redo2 size={17} /></button><span /><button className="studio-icon" aria-label={panel ? 'Hide room details' : 'Show room details'} aria-pressed={panel} onClick={() => setPanel(!panel)}><Settings2 size={17} /></button></div></div>
        <div className={`scene-area tool-${tool}`}>
          {!fallback && <div className="three-host" ref={sceneHost} />}
          {!fallback && !sceneReady && <div className="scene-loading"><House size={28} /><span>Opening your little home…</span></div>}
          {fallback && <svg className="floorplan" viewBox="-1 -1 22 22" role="group" aria-label="Interactive floor plan" onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); const scale = Math.min(r.width, r.height) / 22; const px = (e.clientX - r.left - (r.width - scale * 22) / 2) / scale - 1, pz = (e.clientY - r.top - (r.height - scale * 22) / 2) / scale - 1; if (px >= 0 && px < SIZE && pz >= 0 && pz < SIZE) setCursor({ x: Math.floor(px), z: Math.floor(pz), edge: edgeAt(px, pz) }); }}>
            {Array.from({ length: SIZE * SIZE }, (_, i) => { const x = i % SIZE, z = Math.floor(i / SIZE), t = plan.tiles.find(t => t.x === x && t.z === z); return <rect key={i} x={x} y={z} width=".99" height=".99" fill={t ? surfaces.find(s => s.id === t.surface)!.color : '#d4dbc8'} stroke={grid ? '#b5bfa9' : 'none'} strokeWidth=".025" onClick={() => callbacks.current.hit(cursor && cursor.x === x && cursor.z === z ? cursor : { x, z, edge: { x, z, axis: edgeAxis, kind: 'wall' } }, false)}><title>{t ? plan.rooms.find(r => r.id === t.room)?.name : 'Empty tile'} · {x}, {z}</title></rect>; })}
            {plan.furniture.map(f => { const { w, d } = footprint(f); return <g key={f.id} onClick={e => { e.stopPropagation(); callbacks.current.hit({ x: f.x, z: f.z, edge: edgeAt(f.x, f.z), itemId: f.id }, false); }}><rect x={f.x + .08} y={f.z + .08} width={w - .16} height={d - .16} rx=".12" fill={f.color} stroke={f.id === selected ? '#a06c45' : '#736b5a'} strokeWidth={f.id === selected ? .09 : .025} /><text x={f.x + w / 2} y={f.z + d / 2 + .1} fontSize=".26" textAnchor="middle" fill="#3c483c" pointerEvents="none">{catalog[f.kind].name.split(' ').at(-1)}</text></g>; })}
            {plan.walls.map(w => <line key={wallKey(w)} x1={w.x} y1={w.z} x2={w.x + (w.axis === 'h' ? 1 : 0)} y2={w.z + (w.axis === 'v' ? 1 : 0)} stroke={w.kind === 'door' ? '#bb916c' : w.kind === 'window' ? '#7caaa7' : '#655f4f'} strokeWidth={w.kind === 'wall' ? .12 : .07} strokeDasharray={w.kind === 'door' ? '.2 .2' : undefined} pointerEvents="none" />)}
            {cursor && <rect x={cursor.x} y={cursor.z} width="1" height="1" fill="#6d87674a" pointerEvents="none" />}
          </svg>}
          <div className="view-switch"><button className={!top && !fallback ? 'active' : ''} onClick={() => { if (fallback) setFallback(false); setTop(false); }}><Box size={14} />3D view</button><button className={top || fallback ? 'active' : ''} onClick={() => setTop(true)}><Grid2X2 size={14} />Floor plan</button></div>
          <div className="plot-label"><span />20 × 20 m plot</div>
          {panel && <aside className="room-inspector" aria-label="Room details"><div className="inspector-eyebrow">{item ? 'SELECTED PIECE' : 'A PLACE FOR EVERYDAY'}<button className="studio-icon" aria-label="Close details" onClick={() => setPanel(false)}><X size={13} /></button></div>{item ? <>
            <h2>{catalog[item.kind].name}</h2><p>{footprint(item).w} × {footprint(item).d} m · {item.rotation}°</p>
            {mode === 'build' && <><label className="item-color">Finish<input type="color" aria-label="Furniture color" value={item.color} onChange={e => commit({ ...plan, furniture: plan.furniture.map(f => f.id === item.id ? { ...f, color: e.target.value } : f) })} /></label><div className="item-actions"><button onClick={() => { setKind(item.kind); setRotation(item.rotation); setMoving(item.id); setTool('furniture'); }}><Expand size={15} />Move</button><button onClick={rotate}><RotateCw size={15} />Rotate</button><button onClick={removeItem}><Trash2 size={15} />Remove</button></div></>}
          </> : <>
            <select className="room-select" aria-label="Selected room" value={room.id} onChange={e => setRoomId(e.target.value)}>{plan.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select><p>{plan.tiles.filter(t => t.room === room.id).length} m² <span>·</span> Ground floor</p>
            {mode === 'build' && <details><summary>Room settings</summary><label>Room name<input maxLength={60} value={room.name} onChange={e => { if (e.target.value.trim()) commit({ ...plan, rooms: plan.rooms.map(r => r.id === room.id ? { ...r, name: e.target.value } : r) }); }} /></label><button className="inspector-text-button" onClick={() => chooseTool('room')}>Paint tiles into this room</button><button className="inspector-text-button" disabled={plan.rooms.length >= 30} onClick={() => { const id = crypto.randomUUID(); commit({ ...plan, rooms: [...plan.rooms, { id, name: `Room ${plan.rooms.length + 1}` }] }); setRoomId(id); chooseTool('room'); }}>+ Add a room</button></details>}
            <div className="inspector-note"><Leaf size={15} /><span>A little room to make<br />good things happen.</span></div>
          </>}</aside>}
          <div className="scene-bottom"><div className="camera-tools"><button className={`studio-icon ${tool === 'orbit' ? 'active' : ''}`} aria-label="Camera mode" aria-pressed={tool === 'orbit'} onClick={() => chooseTool(tool === 'orbit' ? 'select' : 'orbit')}><Hand size={17} /></button><span /><button className="studio-icon" aria-label="Rotate view left" onClick={() => scene.current?.orbit(Math.PI / 6)}><RotateCcw size={17} /></button><button className="studio-icon" aria-label="Rotate view right" onClick={() => scene.current?.orbit(-Math.PI / 6)}><RotateCw size={17} /></button><span /><button className="studio-icon" aria-label="Zoom out" onClick={() => scene.current?.zoom(.85)}><Minus size={17} /></button><button className="studio-icon" aria-label="Zoom in" onClick={() => scene.current?.zoom(1.18)}><Plus size={17} /></button><button className="studio-icon" aria-label="Reset camera" onClick={() => scene.current?.reset()}><Expand size={16} /></button></div><button className="studio-button secondary wall-toggle" aria-label="Cutaway walls" aria-pressed={cutaway} onClick={() => setCutaway(!cutaway)}><Layers3 size={15} /><span>{cutaway ? 'Cutaway walls' : 'Full walls'}</span><span className={`tiny-switch ${cutaway ? 'on' : ''}`} /></button></div>
        </div>
        <div className="viewport-footer"><span className="interaction-hint"><MousePointer2 size={13} />{hint}</span><button aria-pressed={grid} onClick={() => setGrid(!grid)}><Grid2X2 size={14} />Grid {grid ? 'on' : 'off'}</button></div>
        <details className="keyboard-placement"><summary>Precise placement & keyboard controls</summary><div><label>Column<input type="number" min="0" max={SIZE - 1} value={keyboardX} onChange={e => setKeyboardX(Math.max(0, Math.min(SIZE - 1, Number(e.target.value) || 0)))} /></label><label>Row<input type="number" min="0" max={SIZE - 1} value={keyboardZ} onChange={e => setKeyboardZ(Math.max(0, Math.min(SIZE - 1, Number(e.target.value) || 0)))} /></label><label>Edge<select value={edgeAxis} onChange={e => setEdgeAxis(e.target.value as 'h' | 'v')}><option value="h">Top</option><option value="v">Left</option></select></label><button className="studio-button secondary" disabled={mode !== 'build' || tool === 'orbit'} onClick={() => callbacks.current.hit(keyboardHit, false)}>{tool === 'select' ? 'Select tile' : 'Apply tool'}</button><button className="studio-button secondary" onClick={() => setFallback(!fallback)}>{fallback ? 'Try 3D' : 'Use 2D plan'}</button></div><button className="inspector-text-button" onClick={() => setHelp(true)}>How to build</button><small>Choose a tool or furniture piece, then apply it at these coordinates. R rotates; Ctrl/Cmd+Z undoes.</small></details>
      </section>
    </div>
    <footer className="studio-bottom"><span className="save-state" role="status"><span className={saved.startsWith('Saved') ? 'saved' : ''} />{saved}</span><span className="local-note">Your private sketchbook · layouts stay on this browser</span><div><button onClick={exportPlan}><ArrowDownToLine size={14} />Export</button><button onClick={() => importInput.current?.click()}><ArrowUpFromLine size={14} />Import</button><button onClick={() => { if (scene.current) download(scene.current.snapshot(), 'our-little-home.png'); else setNotice('Switch to the 3D view to save a picture.'); }}><SquareDashed size={14} />Snapshot</button></div></footer>
    <input ref={importInput} type="file" accept=".json,application/json" hidden aria-label="Import layout file" onChange={importPlan} />
    {notice && <div className="studio-toast" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={15} /></button></div>}
    <dialog ref={modalRef} className="studio-dialog" onCancel={() => { setNewDialog(false); setHelp(false); }} onClick={e => { if (e.target === e.currentTarget) { setNewDialog(false); setHelp(false); } }}><button className="dialog-close studio-icon" aria-label="Close dialog" onClick={() => { setNewDialog(false); setHelp(false); }}><X size={18} /></button>{newDialog ? <><span className="dialog-symbol"><House size={28} /></span><h2>A fresh beginning.</h2><p>Start with a cozy little home or a blank canvas. Export your current layout to keep a separate copy. You can undo this change.</p><button className="new-option" onClick={() => reset(false)}><House size={24} /><span><strong>A little starter home</strong><small>Four rooms, a few favorite pieces. Make it yours.</small></span><ChevronRight size={18} /></button><button className="new-option" onClick={() => reset(true)}><Grid2X2 size={24} /><span><strong>An empty plot</strong><small>20 × 20 tiles and all the possibilities.</small></span><ChevronRight size={18} /></button><button className="inspector-text-button" onClick={exportPlan}>Export current home first</button></> : <><span className="dialog-symbol"><Sparkles size={28} /></span><h2>Make a little space.</h2><p>Choose Floors and paint tiles. Each tile is one square meter. Choose Walls, Doors or Windows and place them along tile edges.</p><p>Pick a furniture piece, point to a floor and click to place. Press R to rotate it. Select a placed piece to move, recolor or remove it.</p><p>Right-drag to orbit. Scroll to zoom. On touchscreens, tap to place, use two fingers to zoom/pan, and choose Camera mode to orbit with one finger.</p><p>Changes save in this browser. Export/import transfers layouts between devices. This studio preview is separate from household accounts and chores.</p><button className="studio-button" onClick={() => setHelp(false)}>Let’s make it home <ArrowLeft size={15} style={{ transform: 'rotate(180deg)' }} /></button></>}</dialog>
  </main>;
}
