<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const props = defineProps({ modelUrl: { type: String, required: true } });

const container = ref(null);
const loadingModel = ref(true);
const loadError = ref('');
let renderer, scene, camera, controls, mesh, edges, animationId, resizeObserver;

// Orientation cube (top-right corner): a small independent scene rendered
// via a scissored sub-viewport of the same renderer, rotated in sync with
// the main camera every frame so it always shows the current viewing
// direction. Click a face to snap the main camera to look straight at it,
// or drag the cube to free-orbit the model — same as SolidWorks' cube.
// Four rotate-arrow buttons sit around it (also SolidWorks-style) for
// stepping the view by 90° instead of free dragging.
const CUBE_SIZE = 56;
const WIDGET_MARGIN = 10;
const ARROW_SIZE = 22;
const ARROW_GAP = 4;
// Space reserved around the cube for the top/right arrows — the cube itself
// sits inset from the corner by this much on both axes.
const CUBE_INSET = ARROW_SIZE + ARROW_GAP;

// Precomputed pixel offsets for the 4 overlay arrow buttons (plain HTML,
// not WebGL — far simpler to style/position reliably than drawing curved
// arrows in the 3D scene). The whole widget is corner-anchored with fixed
// pixel offsets, so these never change with container size.
const cubeTop = WIDGET_MARGIN + CUBE_INSET; // distance from container top to the cube's top edge
const cubeRight = WIDGET_MARGIN + CUBE_INSET; // distance from container right to the cube's right edge
const cubeCenterOffset = (CUBE_SIZE - ARROW_SIZE) / 2;
const arrowStyles = {
  up: { top: `${WIDGET_MARGIN}px`, right: `${cubeRight + cubeCenterOffset}px` },
  down: { top: `${cubeTop + CUBE_SIZE + ARROW_GAP}px`, right: `${cubeRight + cubeCenterOffset}px` },
  left: { top: `${cubeTop + cubeCenterOffset}px`, right: `${cubeRight + CUBE_SIZE + ARROW_GAP}px` },
  right: { top: `${cubeTop + cubeCenterOffset}px`, right: `${WIDGET_MARGIN}px` },
};

let cubeScene, cubeCamera, cubeMesh;
const FACE_DEFS = [
  { label: 'DROITE', dir: [1, 0, 0] },
  { label: 'GAUCHE', dir: [-1, 0, 0] },
  { label: 'HAUT', dir: [0, 1, 0] },
  { label: 'BAS', dir: [0, -1, 0] },
  { label: 'AVANT', dir: [0, 0, 1] },
  { label: 'ARRIÈRE', dir: [0, 0, -1] },
];

// A 3x3 grid is drawn on each face as a visual hint for the picking
// regions: the center cell snaps straight to that face, the 4 edge cells
// snap to a 2-axis diagonal (an edge of the real cube), and the 4 corner
// cells snap to a 3-axis diagonal (a corner) — see classifyCubeHit().
function makeFaceTexture(label) {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, S, S);
  gradient.addColorStop(0, '#f4f5f8');
  gradient.addColorStop(1, '#d7d9e2');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, S, S);

  const cell = S / 3;
  ctx.strokeStyle = 'rgba(61, 58, 69, 0.22)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(cell * i, 0);
    ctx.lineTo(cell * i, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, cell * i);
    ctx.lineTo(S, cell * i);
    ctx.stroke();
  }

  ctx.strokeStyle = '#c8102e';
  ctx.lineWidth = 5;
  ctx.strokeRect(2.5, 2.5, S - 5, S - 5);

  ctx.fillStyle = '#2b2d38';
  ctx.font = `700 ${S * 0.14}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, S / 2, S / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const CUBE_HALF = 0.8;

function setupCube() {
  cubeScene = new THREE.Scene();
  // Without an explicit background, clearing the scissored sub-viewport each
  // frame falls back to the renderer's default clear color (opaque black),
  // showing as an ugly black square around the rotating cube. Matching the
  // main scene's background makes the cube's little viewport blend in.
  cubeScene.background = new THREE.Color(0xf2f2f5);
  cubeCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 10);
  cubeCamera.position.set(0, 0, 3.2);

  cubeScene.add(new THREE.AmbientLight(0xffffff, 1));

  const materials = FACE_DEFS.map((f) => new THREE.MeshBasicMaterial({ map: makeFaceTexture(f.label) }));
  cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(CUBE_HALF * 2, CUBE_HALF * 2, CUBE_HALF * 2), materials);
  cubeScene.add(cubeMesh);
}

// A "real" 26-target cube (like SolidWorks'): 6 faces + 12 edges + 8
// corners. Works off the hit point in the cube's own local geometry space
// (via worldToLocal, which correctly undoes whatever display rotation is
// currently applied) rather than materialIndex, which alone only ever
// gives 6 possible directions. Any axis where the local coordinate is past
// the threshold counts as "active"; combining every active axis' sign
// gives the face (1 active axis), edge (2), or corner (3) direction.
function classifyCubeHit(hit) {
  const local = cubeMesh.worldToLocal(hit.point.clone());
  // Matches the 3x3 grid lines drawn on the face texture exactly (each face
  // spans -CUBE_HALF..CUBE_HALF, divided into 3 equal thirds).
  const threshold = CUBE_HALF / 3;
  const dir = new THREE.Vector3();
  for (const axis of ['x', 'y', 'z']) {
    if (Math.abs(local[axis]) > threshold) dir[axis] = Math.sign(local[axis]);
  }
  if (dir.lengthSq() === 0) dir.set(...FACE_DEFS[hit.face.materialIndex].dir);
  return dir.normalize();
}

function cubeViewport(clientWidth, clientHeight) {
  return {
    x: clientWidth - CUBE_SIZE - cubeRight,
    y: clientHeight - CUBE_SIZE - cubeTop,
    size: CUBE_SIZE,
  };
}

// Steps the camera by a fixed 90° increment around the target, along a
// spherical path — the arrow buttons around the cube, for stepping the
// view like SolidWorks' rather than free dragging.
function rotateView(deltaPolar, deltaAzimuth) {
  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta += deltaAzimuth;
  spherical.phi = THREE.MathUtils.clamp(spherical.phi + deltaPolar, 0.001, Math.PI - 0.001);
  offset.setFromSpherical(spherical);
  camera.position.copy(controls.target).add(offset);
  camera.up.set(0, 1, 0);
  camera.lookAt(controls.target);
  controls.update();
}

function rotateViewUp() { rotateView(-Math.PI / 2, 0); }
function rotateViewDown() { rotateView(Math.PI / 2, 0); }
function rotateViewLeft() { rotateView(0, -Math.PI / 2); }
function rotateViewRight() { rotateView(0, Math.PI / 2); }

// SolidWorks-style: clicking a face snaps the view to it, but dragging the
// cube free-orbits the model just like dragging anywhere else on the
// canvas. Since OrbitControls only ever reacts to pointer movement deltas
// (it doesn't care where the drag started), the simplest way to get that
// drag-to-orbit behavior on the cube is to just let OrbitControls see the
// same pointerdown too — no `stopPropagation`. The face-snap only fires on
// pointerup, and only if the pointer barely moved since pointerdown (a
// real click, not a drag that OrbitControls already handled).
const CLICK_MOVE_THRESHOLD = 5;
let cubePointerDownAt = null;

function pointerToCubeNdc(event, rect) {
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  const { x: vx, y: vy, size } = cubeViewport(rect.width, rect.height);
  // Viewport y is bottom-up (WebGL convention), pointer y is top-down.
  const screenTop = rect.height - vy - size;
  if (px < vx || px > vx + size || py < screenTop || py > screenTop + size) return null;
  return {
    x: ((px - vx) / size) * 2 - 1,
    y: -(((py - screenTop) / size) * 2 - 1),
  };
}

function onCanvasPointerDown(event) {
  if (!container.value || !mesh) return;
  const rect = renderer.domElement.getBoundingClientRect();
  cubePointerDownAt = pointerToCubeNdc(event, rect) ? { x: event.clientX, y: event.clientY } : null;
}

function onCanvasPointerUp(event) {
  if (!cubePointerDownAt) return;
  const moved = Math.hypot(event.clientX - cubePointerDownAt.x, event.clientY - cubePointerDownAt.y);
  cubePointerDownAt = null;
  if (moved > CLICK_MOVE_THRESHOLD) return; // was a drag — OrbitControls already orbited the view

  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = pointerToCubeNdc(event, rect);
  if (!ndc) return;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), cubeCamera);
  const hit = raycaster.intersectObject(cubeMesh)[0];
  if (!hit) return;

  const dir = classifyCubeHit(hit);
  const distance = camera.position.distanceTo(controls.target);
  camera.position.copy(controls.target).addScaledVector(dir, distance);
  camera.up.set(0, 1, 0);
  camera.lookAt(controls.target);
  controls.update();
}

function clearMesh() {
  if (edges) {
    mesh?.remove(edges);
    edges.geometry.dispose();
    edges.material.dispose();
    edges = null;
  }
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh = null;
  }
}

function frameCameraToObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  object.position.sub(center);
  const distance = maxDim * 2;
  camera.position.set(distance, distance, distance);
  camera.near = maxDim / 100;
  camera.far = maxDim * 100;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
}

function loadModel(url) {
  clearMesh();
  loadingModel.value = true;
  loadError.value = '';
  new STLLoader().load(
    url,
    (rawGeometry) => {
      // STL geometry has duplicated vertices per triangle (no sharing), so
      // computeVertexNormals() on it alone just yields flat per-face
      // normals — every curved surface looks faceted. Welding coincident
      // vertices first lets normals average across shared corners, which
      // reads as properly smooth-shaded curved surfaces instead of a
      // low-poly-looking blob.
      const geometry = mergeVertices(rawGeometry);
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({ color: 0x8f9bb3, metalness: 0.15, roughness: 0.6 });
      mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      // Crisp dark lines along sharp edges (30° threshold) — the single
      // biggest legibility win for a shaded solid: it's what makes a part
      // read as a precise mechanical piece instead of a soft grey blob.
      const edgesGeometry = new THREE.EdgesGeometry(geometry, 30);
      edges = new THREE.LineSegments(edgesGeometry, new THREE.LineBasicMaterial({ color: 0x2b2d38 }));
      mesh.add(edges);

      frameCameraToObject(mesh);
      loadingModel.value = false;
    },
    undefined,
    (err) => {
      loadingModel.value = false;
      loadError.value = `Échec du chargement du modèle 3D : ${err?.message || err}`;
    }
  );
}

function resize() {
  if (!container.value || !renderer) return;
  const { clientWidth, clientHeight } = container.value;
  renderer.setSize(clientWidth, clientHeight);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

function animate() {
  animationId = requestAnimationFrame(animate);
  controls.update();

  const { clientWidth, clientHeight } = container.value;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, clientWidth, clientHeight);
  renderer.render(scene, camera);

  // The cube shows how the MODEL looks from the camera, not the camera's
  // own rotation — those are inverses of each other. Copying camera.quaternion
  // directly made the cube spin opposite to how the model actually turns
  // on screen during a drag (reported as "le sens du drag est inversé").
  cubeMesh.quaternion.copy(camera.quaternion).invert();
  const { x, y, size } = cubeViewport(clientWidth, clientHeight);
  renderer.setScissorTest(true);
  renderer.setScissor(x, y, size, size);
  renderer.setViewport(x, y, size, size);
  renderer.render(cubeScene, cubeCamera);
  renderer.setScissorTest(false);
}

onMounted(() => {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f2f5);

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  container.value.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(1, 1, 1);
  scene.add(dirLight);
  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
  dirLight2.position.set(-1, -0.5, -1);
  scene.add(dirLight2);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  setupCube();
  renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);
  window.addEventListener('pointerup', onCanvasPointerUp);

  resize();
  loadModel(props.modelUrl);
  animate();

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container.value);
});

watch(() => props.modelUrl, (url) => loadModel(url));

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId);
  resizeObserver?.disconnect();
  renderer?.domElement.removeEventListener('pointerdown', onCanvasPointerDown);
  window.removeEventListener('pointerup', onCanvasPointerUp);
  clearMesh();
  controls?.dispose();
  renderer?.dispose();
});
</script>

<template>
  <div class="model-viewer-wrap">
    <div ref="container" class="model-viewer"></div>
    <p v-if="loadingModel" class="model-viewer-status muted">Chargement du modèle 3D…</p>
    <p v-if="loadError" class="model-viewer-status error-text">{{ loadError }}</p>
    <template v-if="!loadingModel && !loadError">
      <button type="button" class="cube-arrow" :style="arrowStyles.up" title="Tourner vers le haut" @click="rotateViewUp">▲</button>
      <button type="button" class="cube-arrow" :style="arrowStyles.down" title="Tourner vers le bas" @click="rotateViewDown">▼</button>
      <button type="button" class="cube-arrow" :style="arrowStyles.left" title="Tourner vers la gauche" @click="rotateViewLeft">◀</button>
      <button type="button" class="cube-arrow" :style="arrowStyles.right" title="Tourner vers la droite" @click="rotateViewRight">▶</button>
    </template>
  </div>
</template>

<style scoped>
.model-viewer-wrap { position: relative; width: 100%; height: 100%; }
.model-viewer {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.model-viewer :deep(canvas) {
  display: block;
}
.model-viewer-status {
  position: absolute;
  top: 12px;
  left: 12px;
  background: var(--bg);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
}
.cube-arrow {
  position: absolute;
  width: 22px;
  height: 22px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  transition: background 0.12s, color 0.12s, transform 0.12s;
}
.cube-arrow:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  transform: scale(1.12);
}
</style>
