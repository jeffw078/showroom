import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const FABRIC_COLORS = {
  bege: '#a99d90', cinza: '#77736f', marrom: '#69584c', claro: '#d8d1c8', taupe: '#82766c'
};
const MATERIAL_SETTINGS = {
  base: { color: FABRIC_COLORS.bege, roughness: .9, metalness: 0 },
  colchao: { color: '#f1eee8', roughness: .95, metalness: 0 },
  cabeceira: { color: FABRIC_COLORS.taupe, roughness: .9, metalness: 0 }
};
const TYPES = { base: 'base', mattress: 'colchao', headboard: 'cabeceira' };
const ROOM = { floorY: -1.705, backZ: -3.22, width: 8, height: 4, depth: 10 };
const COMPONENT_TRANSITION = { fadeOut: 140, fadeIn: 180 };

export function applyMaterialToComponent(component, type, materials) {
  const material = materials[type];
  if (!material) throw new Error(`Tipo de material desconhecido: ${type}`);
  component.traverse(child => {
    if (!child.isMesh) return;
    const previous = Array.isArray(child.material) ? child.material : [child.material];
    previous.forEach(item => { if (item && item !== material) item.dispose(); });
    child.material = material;
    child.castShadow = true;
    child.receiveShadow = true;
    if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
  });
}

export function createFloor() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({
    color: '#d8d2c7', roughness: 1, metalness: 0
  }));
  floor.name = 'Piso';
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, ROOM.floorY, ROOM.backZ + ROOM.depth / 2);
  floor.receiveShadow = true;
  return floor;
}

export function createWalls() {
  const walls = new THREE.Group();
  walls.name = 'Paredes e rodapés';
  const wallMaterial = new THREE.MeshStandardMaterial({ color: '#eeeae3', roughness: 1, metalness: 0 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: '#f5f2ec', roughness: .9, metalness: 0 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.height), wallMaterial);
  back.name = 'Parede traseira';
  back.position.set(0, ROOM.floorY + ROOM.height / 2, ROOM.backZ);
  back.receiveShadow = true;
  const left = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.depth, ROOM.height), wallMaterial);
  left.name = 'Parede esquerda';
  left.rotation.y = Math.PI / 2;
  left.position.set(-ROOM.width / 2, ROOM.floorY + ROOM.height / 2, ROOM.backZ + ROOM.depth / 2);
  left.receiveShadow = true;
  const backTrim = new THREE.Mesh(new THREE.BoxGeometry(ROOM.width, .1, .03), trimMaterial);
  backTrim.position.set(0, ROOM.floorY + .05, ROOM.backZ + .016);
  const leftTrim = new THREE.Mesh(new THREE.BoxGeometry(.03, .1, ROOM.depth), trimMaterial);
  leftTrim.position.set(-ROOM.width / 2 + .016, ROOM.floorY + .05, ROOM.backZ + ROOM.depth / 2);
  backTrim.receiveShadow = leftTrim.receiveShadow = true;
  walls.add(back, left, backTrim, leftTrim);
  return walls;
}

export function createRoom() {
  const room = new THREE.Group();
  room.name = 'Quarto';
  room.add(createFloor(), createWalls());
  return room;
}

export function createLighting() {
  const lights = new THREE.Group();
  lights.name = 'Iluminação';
  const ambient = new THREE.AmbientLight('#ffffff', 1.3);
  const main = new THREE.DirectionalLight('#fff8ee', 2.4);
  main.position.set(4, 6, 5);
  main.target.position.set(0, -1.1, -1.7);
  main.castShadow = true;
  main.shadow.mapSize.set(1024, 1024);
  Object.assign(main.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: .5, far: 22 });
  main.shadow.bias = -.0002;
  main.shadow.normalBias = .015;
  const fill = new THREE.HemisphereLight('#f8f7f3', '#aba396', .5);
  lights.add(ambient, main, main.target, fill);
  return lights;
}

export class ShowroomScene {
  constructor(container, { angleLimit = 54, elevation = 75 } = {}) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e8e5df');
    this.room = createRoom();
    this.lighting = createLighting();
    this.bed = new THREE.Group();
    this.bed.name = 'Conjunto modular';
    this.scene.add(this.room, this.lighting, this.bed);
    this.materials = Object.fromEntries(Object.entries(MATERIAL_SETTINGS).map(([key, settings]) => [
      key, new THREE.MeshStandardMaterial({ ...settings, flatShading: true })
    ]));
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .85;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.className = 'showroom-canvas';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', 'Quarto com cama modular. Arraste para girar e use os controles para aproximar.');
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(45, 1, .05, 50);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .12;
    this.controls.enablePan = false;
    this.controls.minAzimuthAngle = -THREE.MathUtils.degToRad(angleLimit);
    this.controls.maxAzimuthAngle = THREE.MathUtils.degToRad(angleLimit);
    this.controls.minPolarAngle = this.controls.maxPolarAngle = THREE.MathUtils.degToRad(elevation);
    this.controls.target.set(0, -1.1, -1.72);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3(0, 2, 6));
    this.controls.update();
    this.loader = new GLTFLoader();
    this.cache = new Map();
    this.parts = {};
    this.paths = {};
    this.revision = 0;
    this.loaded = false;
    this.active = true;
    this.frame = null;
    this.initializedCamera = false;
    this.frameCount = 0;
    this.transition = null;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.onReducedMotion = () => { if (this.reducedMotion.matches) this.finishTransition(); };
    this.reducedMotion.addEventListener('change', this.onReducedMotion);
    this.controls.addEventListener('change', () => this.requestRender());
    this.resize = this.resize.bind(this);
    this.onVisibility = () => {
      if (document.hidden) this.finishTransition();
      else this.requestRender();
    };
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
  }

  async loadPart(path, type) {
    if (!this.cache.has(path)) {
      this.cache.set(path, (async () => {
        const response = await fetch(path, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Falha ao carregar ${path}`);
        const gltf = await this.loader.parseAsync(await response.arrayBuffer(), new URL('.', new URL(path, document.baseURI)).href);
        const component = gltf.scene;
        // Registrar a pose original, sem centralizar, deslocar ou normalizar os GLBs.
        component.userData.originalPosition = component.position.clone();
        component.updateMatrixWorld(true);
        component.userData.originalBounds = new THREE.Box3().setFromObject(component);
        applyMaterialToComponent(component, TYPES[type], this.materials);
        return component;
      })().catch(error => { this.cache.delete(path); throw error; }));
    }
    return this.cache.get(path);
  }

  async setConfiguration(paths, isCurrent = () => true) {
    const revision = ++this.revision;
    this.cancelTransition();
    const entries = Object.entries(paths);
    const loaded = await Promise.all(entries.map(([key, path]) => this.loadPart(path, key)));
    if (revision !== this.revision || !isCurrent()) return false;
    const nextParts = Object.fromEntries(entries.map(([key], index) => [key, loaded[index]]));
    const lift = nextParts.base.userData.originalBounds.max.y - nextParts.mattress.userData.originalBounds.min.y;
    const fadeKeys = entries.filter(([key], index) => this.parts[key] && this.parts[key] !== loaded[index]).map(([key]) => key);
    // A base também pode alterar a altura de apoio do colchão. Dissolver ambos
    // nesse caso evita exibir o salto, mantendo exatamente o encaixe existente.
    if (this.parts.mattress && Math.abs(this.parts.mattress.position.y - (nextParts.mattress.userData.originalPosition.y + lift)) > .00001 && !fadeKeys.includes('mattress')) fadeKeys.push('mattress');
    const animate = this.loaded && this.active && !document.hidden && !this.reducedMotion.matches && fadeKeys.length > 0;
    if (animate) {
      const finished = await this.fadeComponents(fadeKeys, 1, 0, COMPONENT_TRANSITION.fadeOut);
      if (!finished || revision !== this.revision || !isCurrent()) {
        if (revision === this.revision) this.restoreMaterials();
        return false;
      }
    }
    entries.forEach(([key, path], index) => {
      const component = loaded[index];
      if (this.parts[key] !== component) {
        this.parts[key]?.removeFromParent();
        this.bed.add(component);
        this.parts[key] = component;
      }
      this.paths[key] = path;
    });
    // Preservar exatamente o encaixe vertical já existente no configurador anterior.
    // Não alterar X/Z, os vértices ou a origem das peças.
    const mattress = this.parts.mattress;
    mattress.position.y = mattress.userData.originalPosition.y + lift;
    this.bed.updateMatrixWorld(true);
    this.updateCameraLimits();
    this.loaded = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
    if (animate) {
      const finished = await this.fadeComponents(fadeKeys, 0, 1, COMPONENT_TRANSITION.fadeIn);
      if (!finished || revision !== this.revision || !isCurrent()) {
        if (revision === this.revision) this.restoreMaterials();
        return false;
      }
    }
    this.restoreMaterials();
    return true;
  }

  fadeComponents(keys, from, to, duration) {
    if (!this.active || document.hidden || this.reducedMotion.matches) {
      keys.forEach(key => { this.materials[TYPES[key]].opacity = to; });
      return Promise.resolve(true);
    }
    keys.forEach(key => {
      const material = this.materials[TYPES[key]];
      material.transparent = true;
      material.depthWrite = false;
      material.opacity = from;
      material.needsUpdate = true;
    });
    return new Promise(resolve => {
      this.transition = { keys, from, to, duration, start: null, resolve };
      this.requestRender();
    });
  }

  updateTransition(time) {
    const transition = this.transition;
    if (!transition) return;
    transition.start ??= time;
    const progress = Math.min(1, (time - transition.start) / transition.duration);
    const eased = progress * progress * (3 - 2 * progress);
    const opacity = THREE.MathUtils.lerp(transition.from, transition.to, eased);
    transition.keys.forEach(key => { this.materials[TYPES[key]].opacity = opacity; });
    if (progress >= 1) this.finishTransition();
  }

  finishTransition() {
    const transition = this.transition;
    if (!transition) return;
    this.transition = null;
    transition.keys.forEach(key => { this.materials[TYPES[key]].opacity = transition.to; });
    transition.resolve(true);
  }

  cancelTransition() {
    const transition = this.transition;
    this.transition = null;
    this.restoreMaterials();
    transition?.resolve(false);
  }

  restoreMaterials() {
    Object.values(this.materials).forEach(material => {
      if (material.transparent || material.opacity !== 1 || !material.depthWrite) {
        material.opacity = 1;
        material.transparent = false;
        material.depthWrite = true;
        material.needsUpdate = true;
      }
    });
    this.requestRender();
  }

  updateCameraLimits() {
    const bounds = new THREE.Box3().setFromObject(this.bed);
    const size = bounds.getSize(new THREE.Vector3());
    const radius = size.length() / 2;
    // O alvo da câmera acompanha o conjunto; nenhum GLB é recentralizado.
    this.controls.target.set(
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2,
      (bounds.min.z + bounds.max.z) / 2
    );
    this.controls.minDistance = radius * 1.35;
    this.controls.maxDistance = Math.min(radius * 5, 9);
    if (!this.initializedCamera) {
      this.initializedCamera = true;
      this.resetCamera();
    } else this.controls.update();
  }

  resetCamera() {
    const angle = this.controls.minPolarAngle;
    const aspect = Math.min(this.camera.aspect, 1);
    const distance = THREE.MathUtils.clamp(4.8 / Math.max(aspect, .65), this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3(0, Math.cos(angle) * distance, Math.sin(angle) * distance));
    this.controls.update();
    this.requestRender();
  }

  zoom(direction) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = THREE.MathUtils.clamp(offset.length() * (direction > 0 ? .85 : 1.15), this.controls.minDistance, this.controls.maxDistance);
    offset.setLength(distance);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.requestRender();
  }

  setBaseColor(color) { this.setColor('base', color); }
  setHeadboardColor(color) { this.setColor('cabeceira', color); }
  setColor(type, color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Cor inválida');
    this.materials[type].color.set(color);
    this.requestRender();
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 2));
    this.renderer.setSize(width, height, false);
    this.requestRender();
  }

  setActive(active) {
    this.active = active;
    this.controls.enabled = active;
    if (!active) {
      ++this.revision;
      this.cancelTransition();
      cancelAnimationFrame(this.frame);
      this.frame = null;
    } else { this.resize(); this.requestRender(); }
  }

  requestRender() {
    if (!this.active || document.hidden || this.frame !== null) return;
    this.frame = requestAnimationFrame(time => {
      this.frame = null;
      this.controls.update();
      this.updateTransition(time);
      this.renderer.render(this.scene, this.camera);
      this.frameCount++;
      if (this.transition) this.requestRender();
      // OrbitControls dispara change enquanto o damping ainda está em movimento.
      // Quando estabiliza, nenhum loop de renderização fica consumindo a GPU.
    });
  }

  async dispose() {
    this.setActive(false);
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.reducedMotion.removeEventListener('change', this.onReducedMotion);
    this.controls.dispose();
    const geometries = new Set(), materials = new Set(Object.values(this.materials));
    const collect = object => object.traverse(child => {
      if (child.geometry) geometries.add(child.geometry);
      if (child.material) (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => materials.add(m));
    });
    collect(this.scene);
    for (const result of await Promise.allSettled(this.cache.values())) {
      if (result.status === 'fulfilled') collect(result.value);
    }
    geometries.forEach(g => g.dispose());
    materials.forEach(m => m.dispose());
    this.lighting.traverse(light => { if (light.isLight) light.dispose?.(); });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
