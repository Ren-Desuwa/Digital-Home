import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SIZE, catalog, edgeAt, footprint, surfaces, type Furnishing, type Hit, type Plan, type Wall } from './model';

export type SceneOptions = { edit: boolean; tool: string; top: boolean; cutaway: boolean; grid: boolean; selected: string };
export class HomeScene {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera: T.OrthographicCamera;
  controls: OrbitControls;
  content = new T.Group();
  preview = new T.Group();
  wallMeshes: { mesh: T.Group; wall: Wall }[] = [];
  grid: T.GridHelper;
  options: SceneOptions;
  plan: Plan;
  ray = new T.Raycaster();
  pointer = new T.Vector2();
  ground = new T.Plane(new T.Vector3(0, 1, 0), 0);
  resize: ResizeObserver;
  dirty = true;
  down: { x: number; y: number; hit: Hit | null; paint: boolean } | null = null;
  lastStamp = '';
  savedPosition = new T.Vector3(27, 24, 29);
  constructor(readonly host: HTMLElement, plan: Plan, options: SceneOptions, readonly onHit: (hit: Hit, paint: boolean) => void, readonly onHover: (hit: Hit | null) => void, readonly onEnd: () => void) {
    this.plan = plan; this.options = options;
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .95;
    this.renderer.setClearColor('#eaece2');
    this.renderer.domElement.setAttribute('aria-label', '3D house editor. Use the floor-plan view or placement controls for keyboard building.');
    this.renderer.domElement.setAttribute('role', 'img');
    host.appendChild(this.renderer.domElement);
    this.camera = new T.OrthographicCamera(-12, 12, 12, -12, 0.1, 160);
    this.camera.position.copy(this.savedPosition);
    this.camera.zoom = 1.4;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(9, 0, 9.5);
    this.controls.enableDamping = true;
    this.controls.minZoom = .55; this.controls.maxZoom = 3;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.mouseButtons = { LEFT: T.MOUSE.ROTATE, MIDDLE: T.MOUSE.PAN, RIGHT: T.MOUSE.ROTATE };
    this.controls.touches = { ONE: T.TOUCH.ROTATE, TWO: T.TOUCH.DOLLY_PAN };
    this.controls.addEventListener('change', this.changed);
    this.scene.add(new T.HemisphereLight('#fff8ed', '#b8c2ae', 2));
    const sun = new T.DirectionalLight('#fff4df', 2.5);
    sun.position.set(-4, 25, 12); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 65 });
    sun.shadow.normalBias = .04; sun.shadow.bias = -.0002;
    sun.target.position.set(10, 0, 10); this.scene.add(sun, sun.target);
    const ground = new T.Mesh(new T.BoxGeometry(23, .35, 23), new T.MeshStandardMaterial({ color: '#d0d7bf', roughness: 1 }));
    ground.position.set(10, -.25, 10); ground.receiveShadow = true; this.scene.add(ground);
    const backdrop = new T.Mesh(new T.PlaneGeometry(250, 250), new T.MeshStandardMaterial({ color: '#eaece2', roughness: 1 }));
    backdrop.rotation.x = -Math.PI / 2; backdrop.position.y = -.46; backdrop.receiveShadow = true; this.scene.add(backdrop);
    this.grid = new T.GridHelper(SIZE, SIZE, '#9ca98c', '#b8c3a4');
    this.grid.position.set(SIZE / 2, -.06, SIZE / 2); this.scene.add(this.grid, this.content, this.preview);
    this.resize = new ResizeObserver(() => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      const ratio = width / height, span = 10.8 * Math.max(1, height / width);
      this.camera.left = -span * ratio; this.camera.right = span * ratio; this.camera.top = span; this.camera.bottom = -span;
      this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height); this.dirty = true;
    });
    this.resize.observe(host);
    host.addEventListener('pointerdown', this.pointerDown);
    host.addEventListener('pointermove', this.pointerMove);
    host.addEventListener('pointerup', this.pointerUp);
    host.addEventListener('pointercancel', this.pointerCancel);
    host.addEventListener('pointerleave', this.pointerLeave);
    this.update(plan, options);
    this.renderer.setAnimationLoop(() => { this.controls.update(); if (this.dirty) { this.renderer.render(this.scene, this.camera); this.dirty = false; } });
  }
  changed = () => { this.dirty = true; this.updateWalls(); };
  box(group: T.Group, x: number, y: number, z: number, w: number, h: number, d: number, color: string, opacity = 1) {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshStandardMaterial({ color, roughness: .85, transparent: opacity < 1, opacity }));
    mesh.position.set(x + w / 2, y + h / 2, z + d / 2); mesh.castShadow = opacity === 1; mesh.receiveShadow = true; group.add(mesh); return mesh;
  }
  furniture(item: Furnishing, parent: T.Group, ghost = false, valid = true) {
    const root = new T.Group(); root.userData.itemId = item.id;
    const { w, d } = catalog[item.kind];
    root.position.set(item.x + footprint(item).w / 2, .08, item.z + footprint(item).d / 2);
    root.rotation.y = -item.rotation * Math.PI / 180;
    const color = ghost ? (valid ? '#71906a' : '#d57b65') : item.color;
    const add = (x: number, y: number, z: number, a: number, b: number, c: number, shade = color) => this.box(root, x - w / 2, y, z - d / 2, a, b, c, ghost ? color : shade, ghost ? .55 : 1);
    if (item.kind === 'sofa' || item.kind === 'chair') {
      add(.08, .12, .06, w - .16, .4, d - .12); add(.08, .52, .05, w - .16, .43, .18);
      add(.03, .25, .06, .2, .48, d - .12); add(w - .23, .25, .06, .2, .48, d - .12);
      for (let i = 0; i < w; i++) add(i + .23, .52, .28, .58, .1, .6, item.kind === 'sofa' ? '#9baa96' : '#d6af86');
      if (w > 1) add(.36, .64, .3, .4, .26, .16, '#ded2b6');
    } else if (item.kind === 'bed') {
      add(.06, .05, .04, w - .12, .3, d - .08, '#b48e69'); add(.05, .35, .1, w - .1, .25, d - .16, '#f4eddf');
      add(.05, .62, 1, w - .1, .1, d - 1.06); add(.05, .05, .01, w - .1, .95, .16, '#b48e69');
      add(.18, .62, .25, .7, .16, .54, '#f8f3e9'); add(1.12, .62, .25, .7, .16, .54, '#f8f3e9');
      add(.05, .73, d - .45, w - .1, .025, .3, '#e0d2c3');
    } else if (item.kind === 'plant') {
      const pot = new T.Mesh(new T.CylinderGeometry(.25, .18, .45, 12), new T.MeshStandardMaterial({ color: ghost ? color : '#d1ab8d', transparent: ghost, opacity: ghost ? .55 : 1 }));
      pot.position.y = .23; pot.castShadow = true; root.add(pot);
      for (let i = 0; i < 5; i++) {
        const leaf = new T.Mesh(new T.SphereGeometry(.22, 8, 6), new T.MeshStandardMaterial({ color, roughness: 1, transparent: ghost, opacity: ghost ? .55 : 1 }));
        leaf.scale.set(.6, 1.8, .8); leaf.position.set(Math.sin(i * 2) * .16, .7 + (i % 2) * .18, Math.cos(i * 2) * .16); leaf.rotation.z = Math.sin(i * 2) * .5; leaf.castShadow = true; root.add(leaf);
      }
    } else if (item.kind === 'rug') {
      add(.04, .015, .04, w - .08, .025, d - .08);
      for (let i = 0; i < 8; i++) add(.12, .042, .12 + i * .23, w - .24, .004, .025, '#ead8be');
    } else if (item.kind === 'cabinet' || item.kind === 'counter') {
      const height = item.kind === 'cabinet' ? 1.3 : .9;
      add(.04, .05, .05, w - .08, height, d - .1); add(.01, height + .05, .02, w - .02, .07, d - .04, item.kind === 'counter' ? '#f2eee2' : color);
      for (let i = 0; i < w; i++) { add(i + .1, .12, d - .045, .8, height - .14, .025); add(i + .68, height * .65, d - .02, .12, .035, .025, '#70654f'); }
      if (item.kind === 'counter') { add(.2, .99, .2, .6, .02, .55, '#66756e'); add(.27, 1.01, .26, .46, .01, .42, '#d2d6cb'); }
    } else {
      const h = item.kind === 'dining' ? .78 : .45;
      add(.04, h, .04, w - .08, .1, d - .08);
      for (const x of [.14, w - .26]) for (const z of [.14, d - .26]) add(x, .05, z, .12, h, .12);
      if (item.kind === 'dining') for (const x of [.2, w - .65]) add(x, .1, .45, .45, .4, .5, '#e1c6a4');
      else { add(.35, h + .11, .25, .45, .05, .4, '#f1e5ce'); add(1, h + .11, .45, .22, .1, .22, '#e0b58d'); }
    }
    if (!ghost && item.id === this.options.selected) {
      const outline = new T.Box3Helper(new T.Box3(new T.Vector3(-w / 2, 0, -d / 2), new T.Vector3(w / 2, item.kind === 'rug' ? .08 : 1.5, d / 2)), '#bd865d'); root.add(outline);
    }
    parent.add(root);
  }
  clear(group: T.Group) {
    group.traverse(o => { const m = o as T.Mesh; m.geometry?.dispose(); if (Array.isArray(m.material)) m.material.forEach(s => s.dispose()); else m.material?.dispose(); }); group.clear();
  }
  update(plan: Plan, options: SceneOptions) {
    const topChanged = this.options.top !== options.top;
    this.options = options; this.plan = plan;
    if (topChanged) {
      if (options.top) { this.savedPosition.copy(this.camera.position); this.camera.position.copy(this.controls.target).add(new T.Vector3(0, 35, .01)); }
      else this.camera.position.copy(this.savedPosition);
    }
    this.controls.mouseButtons.LEFT = options.edit && options.tool !== 'orbit' ? undefined as unknown as T.MOUSE : T.MOUSE.ROTATE;
    this.controls.touches.ONE = options.edit && options.tool !== 'orbit' ? undefined as unknown as T.TOUCH : T.TOUCH.ROTATE;
    this.controls.enableRotate = !options.top;
    this.grid.visible = options.grid && options.edit;
    this.clear(this.content); this.wallMeshes = [];
    for (const tile of plan.tiles) {
      const color = surfaces.find(s => s.id === tile.surface)!.color;
      this.box(this.content, tile.x, -.045, tile.z, .99, .12, .99, color);
      if (tile.surface === 'oak') for (let i = 1; i < 3; i++) this.box(this.content, tile.x + i / 3, .076, tile.z + .01, .008, .002, .98, '#b79a75');
    }
    for (const wall of plan.walls) {
      const g = new T.Group(); g.position.set(wall.x, .08, wall.z); if (wall.axis === 'v') g.rotation.y = -Math.PI / 2;
      const add = (x: number, y: number, w: number, h: number, color = '#f1eadb') => this.box(g, x, y, -.065, w, h, .13, color);
      if (wall.kind === 'wall') { add(0, 0, 1, 2.35); add(0, 2.35, 1, .045, '#fff8e9'); add(0, 0, 1, .12, '#d5c9b4'); }
      else {
        add(0, 0, .1, 2.35); add(.9, 0, .1, 2.35); add(.1, 2, .8, .35);
        if (wall.kind === 'window') {
          add(.1, 0, .8, .85); add(.06, .85, .88, .08, '#bca586');
          this.box(g, .14, .94, -.035, .72, 1.02, .05, '#a5c4c1', .55); add(.48, .9, .045, 1.1, '#bca586');
        } else { add(.08, 0, .08, 2.05, '#bca586'); add(.84, 0, .08, 2.05, '#bca586'); add(.1, 2, .8, .06, '#bca586'); }
      }
      g.userData.wall = wall; this.wallMeshes.push({ mesh: g, wall }); this.content.add(g);
    }
    for (const item of [...plan.furniture].sort((a, b) => Number(b.kind === 'rug') - Number(a.kind === 'rug'))) this.furniture(item, this.content);
    this.updateWalls(); this.dirty = true;
  }
  updateWalls() {
    const dx = this.camera.position.x - this.controls.target.x, dz = this.camera.position.z - this.controls.target.z;
    for (const { mesh, wall } of this.wallMeshes) {
      const hidden = this.options.top || this.options.cutaway && (wall.axis === 'h' ? (wall.z > 9.5 ? dz > 0 : dz < 0) : (wall.x > 9.5 ? dx > 0 : dx < 0));
      mesh.scale.y = hidden ? .16 : 1;
    }
  }
  hover(hit: Hit | null, item: Furnishing | null, valid: boolean) {
    this.clear(this.preview);
    if (!hit || !this.options.edit || ['select', 'orbit'].includes(this.options.tool)) { this.dirty = true; return; }
    const color = valid ? '#72916c' : '#c36952';
    if (item) this.furniture(item, this.preview, true, valid);
    else if (['wall', 'door', 'window', 'erase-wall'].includes(this.options.tool)) {
      const e = hit.edge; this.box(this.preview, e.x - (e.axis === 'v' ? .07 : 0), .09, e.z - (e.axis === 'h' ? .07 : 0), e.axis === 'h' ? 1 : .14, 1, e.axis === 'v' ? 1 : .14, color, .6);
    } else this.box(this.preview, hit.x, .09, hit.z, 1, .07, 1, color, .65);
    this.dirty = true;
  }
  hit(event: PointerEvent): Hit | null {
    const rect = this.host.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const point = this.ray.ray.intersectPlane(this.ground, new T.Vector3());
    if (!point || point.x < 0 || point.x >= SIZE || point.z < 0 || point.z >= SIZE) return null;
    const hit: Hit = { x: Math.floor(point.x), z: Math.floor(point.z), edge: edgeAt(point.x, point.z) };
    if (this.options.tool === 'select' || this.options.tool === 'orbit') {
      for (const intersection of this.ray.intersectObjects(this.content.children, true)) {
        let obj: T.Object3D | null = intersection.object;
        while (obj && !obj.userData.itemId) obj = obj.parent;
        if (obj) { hit.itemId = obj.userData.itemId; break; }
      }
    }
    return hit;
  }
  stamp(hit: Hit) { return ['wall', 'door', 'window', 'erase-wall'].includes(this.options.tool) ? `${hit.edge.axis},${hit.edge.x},${hit.edge.z}` : `${hit.x},${hit.z}`; }
  pointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary) { this.pointerCancel(); return; }
    const hit = this.hit(e); const paint = this.options.edit && ['floor', 'room', 'wall', 'erase-floor', 'erase-wall'].includes(this.options.tool) && e.pointerType !== 'touch';
    this.down = { x: e.clientX, y: e.clientY, hit, paint }; this.lastStamp = hit ? this.stamp(hit) : '';
    if (paint && hit) { this.host.setPointerCapture(e.pointerId); this.onHit(hit, true); }
  };
  pointerMove = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    const hit = this.hit(e); this.onHover(hit);
    if (this.down?.paint && hit && this.stamp(hit) !== this.lastStamp) { this.lastStamp = this.stamp(hit); this.onHit(hit, true); }
  };
  pointerUp = (e: PointerEvent) => {
    if (this.down && !this.down.paint && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 8) { const hit = this.hit(e); if (hit) this.onHit(hit, false); }
    this.down = null; this.lastStamp = ''; this.onEnd(); if (this.host.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
  };
  pointerCancel = () => { this.down = null; this.lastStamp = ''; this.onEnd(); };
  pointerLeave = () => { if (!this.down?.paint) this.onHover(null); };
  orbit(delta: number) {
    const p = this.camera.position.clone().sub(this.controls.target); p.applyAxisAngle(new T.Vector3(0, 1, 0), delta); this.camera.position.copy(this.controls.target).add(p); this.controls.update(); this.dirty = true;
  }
  zoom(delta: number) { this.camera.zoom = T.MathUtils.clamp(this.camera.zoom * delta, .55, 3); this.camera.updateProjectionMatrix(); this.dirty = true; }
  reset() { this.controls.target.set(9, 0, 9.5); this.camera.position.set(27, 24, 29); this.savedPosition.copy(this.camera.position); if (this.options.top) this.camera.position.set(9, 35, 9.51); this.camera.zoom = 1.4; this.camera.updateProjectionMatrix(); this.controls.update(); this.dirty = true; }
  snapshot() { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/png'); }
  dispose() {
    this.resize.disconnect(); this.controls.removeEventListener('change', this.changed); this.controls.dispose(); this.renderer.setAnimationLoop(null);
    this.host.removeEventListener('pointerdown', this.pointerDown); this.host.removeEventListener('pointermove', this.pointerMove); this.host.removeEventListener('pointerup', this.pointerUp); this.host.removeEventListener('pointercancel', this.pointerCancel); this.host.removeEventListener('pointerleave', this.pointerLeave);
    this.clear(this.scene as unknown as T.Group); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
