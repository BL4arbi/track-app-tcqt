<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/client';
import { buildUserColorMap, initials } from '../utils/userColors';
import ModelViewer from '../components/ModelViewer.vue';

const router = useRouter();
const tasks = ref([]);
const users = ref([]);
const loading = ref(true);
const error = ref('');
const viewingModelFor = ref(null);

const userColors = computed(() => buildUserColorMap(users.value));
const viewingTask = computed(() => tasks.value.find((t) => t.id === viewingModelFor.value) || null);

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR');
}
function formatDueDate(dateKey) {
  if (!dateKey) return '—';
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
}
function isOverdue(dateKey) {
  if (!dateKey) return false;
  const todayKey = new Date().toISOString().slice(0, 10);
  return dateKey < todayKey;
}
function previewUrl(t) {
  if (!t.preview_image_path) return null;
  return `${api.defaults.baseURL}/uploads/${t.preview_image_path}`;
}
function modelUrl(t) {
  if (!t.model_path) return null;
  return `${api.defaults.baseURL}/uploads/${t.model_path}`;
}
function openTask(id) {
  router.push(`/tasks/${id}`);
}
function openModel(t) {
  viewingModelFor.value = t.id;
}
function closeModel() {
  viewingModelFor.value = null;
}
function onKeydown(e) {
  if (e.key === 'Escape') closeModel();
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [tasksRes, usersRes] = await Promise.all([
      api.get('/api/tasks'),
      api.get('/api/users/directory'),
    ]);
    tasks.value = tasksRes.data.tasks;
    users.value = usersRes.data.users;
  } catch (e) {
    error.value = e.response?.data?.error || 'Échec du chargement des tâches';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
  window.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div>
    <div class="toolbar">
      <h1>Tableau de bord — tâches actives</h1>
      <button class="secondary" @click="load">Actualiser</button>
    </div>

    <p v-if="loading" class="muted">Chargement…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>
    <p v-else-if="!tasks.length" class="muted">Aucune tâche active pour le moment.</p>

    <table v-else class="dashboard-table">
      <thead>
        <tr>
          <th>Aperçu</th>
          <th>Qui</th>
          <th>Client</th>
          <th>Tâche</th>
          <th>Étape actuelle</th>
          <th>Étape suivante</th>
          <th>Date prévue</th>
          <th>Dernière mise à jour</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in tasks" :key="t.id" class="clickable-row" @click="openTask(t.id)">
          <td>
            <div class="thumb-cell">
              <img v-if="previewUrl(t)" :src="previewUrl(t)" class="preview-thumb-sm" :alt="t.title" />
              <span v-else class="preview-thumb-sm preview-thumb-sm--empty"></span>
              <button v-if="t.model_path" type="button" class="thumb-3d-badge" title="Voir en 3D" @click.stop="openModel(t)">3D</button>
            </div>
          </td>
          <td>
            <span class="user-chip">
              <span class="user-avatar" :style="{ background: userColors.get(t.assigned_user_id) }">{{ initials(t.assigned_user_name) }}</span>
              {{ t.assigned_user_name }}
            </span>
          </td>
          <td>{{ t.client_name }}</td>
          <td><strong>{{ t.title }}</strong></td>
          <td>{{ t.current_step || '—' }}</td>
          <td>{{ t.next_step || '—' }}</td>
          <td :class="{ 'due-overdue': isOverdue(t.due_date) }">{{ formatDueDate(t.due_date) }}</td>
          <td class="muted">{{ formatDate(t.updated_at) }}</td>
        </tr>
      </tbody>
    </table>

    <Teleport to="body">
      <div v-if="viewingTask" class="modal-backdrop" @click.self="closeModel">
        <div class="modal-panel">
          <div class="modal-header">
            <strong>{{ viewingTask.title }}</strong>
            <button type="button" class="secondary" @click="closeModel">Fermer ✕</button>
          </div>
          <ModelViewer :model-url="modelUrl(viewingTask)" style="height:100%" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.thumb-cell { position: relative; width: 48px; height: 48px; }
.thumb-3d-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 4px;
  line-height: 1;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-panel {
  width: 90vw;
  height: 85vh;
  background: var(--bg);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal-header { display: flex; justify-content: space-between; align-items: center; }
</style>
