<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const props = defineProps({ modelUrl: { type: String, required: true } });

const container = ref(null);
const loadingModel = ref(true);
const loadError = ref('');
let renderer, scene, camera, controls, mesh, animationId, resizeObserver;

function clearMesh() {
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
    (geometry) => {
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({ color: 0x8f9bb3, metalness: 0.15, roughness: 0.6 });
      mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
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
  renderer.render(scene, camera);
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
</style>
