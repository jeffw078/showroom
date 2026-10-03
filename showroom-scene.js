import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TRANSITION = { out: 140, in: 180 };
const PARTS = ['base', 'colchao', 'cabeceira'];
export const FABRIC_COLORS = {
  bege: '#a99d90', cinza: '#77736f', marrom: '#69584c', claro: '#d8d1c8', taupe: '#82766c'
};
const DIRECTION = new THREE.Quaternion()
  .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));

const eachMesh = (object, callback) => object.traverse(child => { if (child.isMesh) callback(child); });
const materialsOf = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
const assignMaterials = (mesh, materials) => { mesh.material = Array.isArray(mesh.material) ? materials : materials[0]; };

export class ShowroomScene {
  constructor(container, { angleLimit = 54, elevation = 75 } = {}) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e8e5df');
    this.stage = new THREE.Group();
    this.stage.name = 'Eixo Z do pacote convertido para Y do Three.js';
    this.stage.quaternion.copy(DIRECTION);
    this.bed = new THREE.Group();
    this.bed.name = 'Conjunto modular';
    this.stage.add(this.bed);
    this.scene.add(this.stage);
    this.createLighting();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.className = 'showroom-canvas';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', 'Conjunto 3D em ambiente. Arraste para girar; use os controles para aproximar.');
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, .05, 60);
    this.camera.position.set(0, 2.2, 5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .12;
    this.controls.enablePan = false;
    this.controls.minAzimuthAngle = -THREE.MathUtils.degToRad(angleLimit);
    this.controls.maxAzimuthAngle = THREE.MathUtils.degToRad(angleLimit);
    this.controls.minPolarAngle = this.controls.maxPolarAngle = THREE.MathUtils.degToRad(elevation);
    this.controls.target.set(0, .55, 0);
    this.controls.update();

    this.loader = new GLTFLoader();
    this.cache = new Map();
    this.parts = {};
    this.paths = {};
    this.ambiente = null;
    this.ambientePath = null;
    this.environmentRevision = 0;
    this.revision = 0;
    this.transition = null;
    this.active = true;
    this.loaded = false;
    this.frame = null;
    this.frameCount = 0;
    this.initializedCamera = false;
    this.tints = { base: null, cabeceira: null };
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.onReducedMotion = () => { if (this.reducedMotion.matches) this.finishTransition(); };
    this.reducedMotion.addEventListener('change', this.onReducedMotion);
    this.controls.addEventListener('change', () => this.requestRender());
    this.resize = this.resize.bind(this);
    this.onVisibility = () => { if (document.hidden) this.finishTransition(); else this.requestRender(); };
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
  }

  createLighting() {
    this.lighting = new THREE.Group();
    this.lighting.name = 'Iluminação do showroom';
    this.lighting.add(new THREE.AmbientLight('#ffffff', .85));
    const key = new THREE.DirectionalLight('#fff8ef', 1.8);
    key.position.set(3.5, 5.5, 4);
    key.target.position.set(0, .5, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: .5, far: 20 });
    key.shadow.bias = -.0002;
    key.shadow.normalBias = .015;
    this.lighting.add(key, key.target, new THREE.HemisphereLight('#f7f7f4', '#968d81', .35));
    this.scene.add(this.lighting);
  }

  async loadGLB(path) {
    const response = await fetch(path, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Não foi possível carregar ${path}: HTTP ${response.status}`);
    const gltf = await this.loader.parseAsync(await response.arrayBuffer(), new URL('.', path).href);
    const object = gltf.scene;
    object.updateMatrixWorld(true);
    eachMesh(object, mesh => {
      // Os materiais PBR do GLB permanecem intocados por padrão.
      mesh.userData.originalMaterials = materialsOf(mesh);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return object;
  }

  loadPart(path) {
    if (!this.cache.has(path)) {
      this.cache.set(path, this.loadGLB(path).then(object => {
        object.userData.originalPosition = object.position.clone();
        object.userData.originalBounds = new THREE.Box3().setFromObject(object);
        return object;
      }).catch(error => { this.cache.delete(path); throw error; }));
    }
    return this.cache.get(path);
  }

  async setAmbiente(path, isCurrent = () => true) {
    const revision = ++this.environmentRevision;
    if (path === this.ambientePath && this.ambiente) return true;
    const next = await this.loadGLB(path);
    if (revision !== this.environmentRevision || !isCurrent()) {
      this.disposeObject(next);
      return false;
    }
    const previous = this.ambiente;
    previous?.removeFromParent();
    this.ambiente = next;
    this.ambientePath = path;
    next.name = 'Ambiente atual';
    this.stage.add(next);
    if (previous) this.disposeObject(previous);
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
    return true;
  }

  // Troca a cor somente após escolha explícita. clone() mantém map, normalMap,
  // roughnessMap e todas as demais propriedades PBR do material original.
  setColor(type, color = null) {
    if (!['base', 'cabeceira'].includes(type)) throw new Error('Tipo de peça inválido');
    if (color !== null && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Cor inválida');
    this.finishTransition();
    this.tints[type] = color;
    if (this.parts[type]) this.applyColor(this.parts[type], type);
    this.requestRender();
  }
  setBaseColor(color = null) { this.setColor('base', color); }
  setHeadboardColor(color = null) { this.setColor('cabeceira', color); }

  applyColor(object, type) {
    eachMesh(object, mesh => {
      const display = materialsOf(mesh);
      display.forEach((material, index) => {
        if (material !== mesh.userData.originalMaterials[index]) material.dispose();
      });
      const color = this.tints[type];
      assignMaterials(mesh, color ? mesh.userData.originalMaterials.map(original => {
        const copy = original.clone();
        if (copy.color) copy.color.set(color);
        return copy;
      }) : mesh.userData.originalMaterials);
    });
  }

  async setConfiguration(paths, isCurrent = () => true) {
    const revision = ++this.revision;
    this.cancelTransition();
    const loaded = await Promise.all(PARTS.map(key => this.loadPart(paths[key])));
    if (revision !== this.revision || !isCurrent()) return false;
    const next = Object.fromEntries(PARTS.map((key, index) => [key, loaded[index]]));
    const fadeKeys = PARTS.filter(key => this.parts[key] && this.parts[key] !== next[key]);
    const offset = next.base.userData.originalBounds.max.z - next.colchao.userData.originalBounds.min.z;
    if (this.parts.colchao && Math.abs(this.parts.colchao.position.z - (next.colchao.userData.originalPosition.z + offset)) > .00001 && !fadeKeys.includes('colchao')) fadeKeys.push('colchao');
    const animate = this.loaded && this.active && !document.hidden && !this.reducedMotion.matches && fadeKeys.length > 0;
    if (animate && !(await this.fade(fadeKeys, 1, 0, TRANSITION.out))) return false;
    if (revision !== this.revision || !isCurrent()) { this.restoreFade(); return false; }

    for (const key of PARTS) {
      if (this.parts[key] !== next[key]) {
        this.parts[key]?.removeFromParent();
        this.bed.add(next[key]);
        this.parts[key] = next[key];
        if (this.tints[key]) this.applyColor(next[key], key);
      }
      this.paths[key] = paths[key];
    }
    // O pacote compartilha pivots. Somente Z (altura no arquivo) é ajustado
    // para apoiar colchões de conjuntos diferentes sobre a base selecionada.
    next.colchao.position.z = next.colchao.userData.originalPosition.z + offset;
    this.bed.updateMatrixWorld(true);
    this.updateCameraLimits();
    this.loaded = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
    if (animate && !(await this.fade(fadeKeys, 0, 1, TRANSITION.in))) return false;
    if (revision !== this.revision || !isCurrent()) { this.restoreFade(); return false; }
    this.restoreFade();
    return true;
  }

  fade(keys, from, to, duration) {
    if (!this.active || document.hidden || this.reducedMotion.matches) return Promise.resolve(true);
    const originals = new Map();
    for (const key of keys) eachMesh(this.parts[key], mesh => {
      const current = materialsOf(mesh);
      originals.set(mesh, current);
      assignMaterials(mesh, current.map(material => {
        const copy = material.clone();
        copy.transparent = true;
        copy.depthWrite = false;
        copy.opacity = from;
        return copy;
      }));
    });
    return new Promise(resolve => {
      this.transition = { keys, originals, from, to, duration, start: null, resolve };
      this.requestRender();
    });
  }

  updateTransition(time) {
    const current = this.transition;
    if (!current) return false;
    current.start ??= time;
    const progress = Math.min(1, (time - current.start) / current.duration);
    const eased = progress * progress * (3 - 2 * progress);
    for (const mesh of current.originals.keys()) for (const material of materialsOf(mesh)) material.opacity = THREE.MathUtils.lerp(current.from, current.to, eased);
    return progress >= 1;
  }

  finishTransition(completed = true) {
    const current = this.transition;
    if (!current) return;
    this.transition = null;
    for (const [mesh, originals] of current.originals) {
      materialsOf(mesh).forEach(material => material.dispose());
      assignMaterials(mesh, originals);
    }
    current.resolve(completed);
  }

  cancelTransition() {
    this.finishTransition(false);
  }

  restoreFade() { this.finishTransition(); this.requestRender(); }

  updateCameraLimits() {
    const bounds = new THREE.Box3().setFromObject(this.bed);
    const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
    const center = bounds.getCenter(new THREE.Vector3());
    this.controls.target.copy(center);
    this.controls.minDistance = radius * 1.35;
    this.controls.maxDistance = Math.min(radius * 5, 10);
    if (!this.initializedCamera) {
      this.initializedCamera = true;
      this.resetCamera();
    } else this.controls.update();
  }

  resetCamera() {
    const polar = this.controls.minPolarAngle;
    const aspect = Math.min(this.camera.aspect, 1);
    const distance = THREE.MathUtils.clamp(5 / Math.max(aspect, .65), this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3(0, Math.cos(polar) * distance, Math.sin(polar) * distance));
    this.controls.update();
    this.requestRender();
  }

  zoom(direction) {
    const vector = this.camera.position.clone().sub(this.controls.target);
    vector.setLength(THREE.MathUtils.clamp(vector.length() * (direction > 0 ? .85 : 1.15), this.controls.minDistance, this.controls.maxDistance));
    this.camera.position.copy(this.controls.target).add(vector);
    this.controls.update();
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
      ++this.environmentRevision;
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
      const transitionFinished = this.updateTransition(time);
      this.renderer.render(this.scene, this.camera);
      this.frameCount++;
      if (transitionFinished) this.finishTransition();
      if (this.transition) this.requestRender();
    });
  }

  disposeObject(object) {
    eachMesh(object, mesh => {
      mesh.geometry.dispose();
      new Set([...materialsOf(mesh), ...(mesh.userData.originalMaterials || [])]).forEach(material => {
        for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
        material.dispose();
      });
    });
  }

  async dispose() {
    this.setActive(false);
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.reducedMotion.removeEventListener('change', this.onReducedMotion);
    this.controls.dispose();
    const parts = await Promise.allSettled(this.cache.values());
    for (const result of parts) if (result.status === 'fulfilled') this.disposeObject(result.value);
    if (this.ambiente) this.disposeObject(this.ambiente);
    this.lighting.traverse(light => { if (light.isLight) light.dispose?.(); });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
