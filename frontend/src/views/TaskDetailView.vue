<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api/client';
import { WORKFLOW_STEPS } from '../utils/workflowSteps';

const route = useRoute();
const task = ref(null);
const history = ref([]);
const documents = ref([]);
const loading = ref(true);
const error = ref('');

const nativeFile = ref(null);
const previewFile = ref(null);
const uploadError = ref('');
const uploading = ref(false);

const STATUS_LABELS = { active: 'Actif', paused: 'En pause', done: 'Terminé' };

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR');
}
function formatDueDate(dateKey) {
  if (!dateKey) return '—';
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
}
function statusLabel(s) {
  return s ? STATUS_LABELS[s] : '—';
}

const currentStepIndex = computed(() => task.value ? WORKFLOW_STEPS.indexOf(task.value.current_step) : -1);

function previewUrl(doc) {
  if (!doc.preview_image_path) return null;
  return `${api.defaults.baseURL}/uploads/${doc.preview_image_path}`;
}

function downloadUrl(doc) {
  return `${api.defaults.baseURL}/api/documents/${doc.id}/download`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/api/tasks/${route.params.id}`);
    task.value = data.task;
    history.value = data.history;
    documents.value = data.documents;
  } catch (e) {
    error.value = e.response?.data?.error || 'Échec du chargement de la tâche';
  } finally {
    loading.value = false;
  }
}

async function upload() {
  uploadError.value = '';
  if (!nativeFile.value) {
    uploadError.value = 'Sélectionnez le fichier SolidWorks natif (ou PDF) à envoyer';
    return;
  }
  const form = new FormData();
  form.append('file', nativeFile.value);
  if (previewFile.value) form.append('previewImage', previewFile.value);

  uploading.value = true;
  try {
    await api.post(`/api/tasks/${route.params.id}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    nativeFile.value = null;
    previewFile.value = null;
    await load();
  } catch (e) {
    uploadError.value = e.response?.data?.error || "Échec de l'envoi";
  } finally {
    uploading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <p v-if="loading" class="muted">Chargement…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>

    <template v-else-if="task">
      <div class="toolbar">
        <h1>{{ task.title }}</h1>
        <span class="badge" :class="task.status">{{ statusLabel(task.status) }}</span>
      </div>

      <div class="card">
        <h2>Chronologie</h2>
        <div v-if="currentStepIndex === -1" class="muted">Étape libre (hors chronologie standard) : {{ task.current_step || '—' }}</div>
        <ol v-else class="stepper">
          <li
            v-for="(s, i) in WORKFLOW_STEPS"
            :key="s"
            class="stepper-step"
            :class="{ done: i < currentStepIndex, current: i === currentStepIndex, upcoming: i > currentStepIndex }"
          >
            <span class="stepper-dot">{{ i < currentStepIndex ? '✓' : i + 1 }}</span>
            <span class="stepper-label">{{ s }}</span>
          </li>
        </ol>
      </div>

      <div class="card">
        <p><strong>Client :</strong> {{ task.client_name }}</p>
        <p><strong>Assigné à :</strong> {{ task.assigned_user_name }}</p>
        <p><strong>Étape actuelle :</strong> {{ task.current_step || '—' }}</p>
        <p><strong>Étape suivante :</strong> {{ task.next_step || '—' }}</p>
        <p><strong>Date prévue :</strong> {{ formatDueDate(task.due_date) }}</p>
        <p class="muted">Dernière mise à jour {{ formatDate(task.updated_at) }}</p>
      </div>

      <div class="card">
        <h2>Documents</h2>
        <div v-if="!documents.length" class="muted">Aucun document envoyé pour l'instant.</div>
        <div v-for="doc in documents" :key="doc.id" class="doc-row">
          <img v-if="previewUrl(doc)" :src="previewUrl(doc)" class="preview-thumb" :alt="doc.original_filename" />
          <div v-else class="preview-thumb" style="display:flex;align-items:center;justify-content:center;font-size:11px" >aucun aperçu</div>
          <div style="flex:1">
            <div>{{ doc.original_filename }}</div>
            <div class="muted">{{ doc.file_type.toUpperCase() }} · envoyé par {{ doc.uploaded_by }} · {{ formatDate(doc.uploaded_at) }}</div>
          </div>
          <a :href="downloadUrl(doc)">Télécharger</a>
        </div>

        <form @submit.prevent="upload" style="margin-top:16px">
          <div class="form-row">
            <div class="field">
              <label>Fichier natif (.sldprt / .sldasm / .slddrw / .pdf)</label>
              <input type="file" @change="nativeFile = $event.target.files[0]" />
            </div>
            <div class="field">
              <label>Image d'aperçu (.png / .jpg)</label>
              <input type="file" @change="previewFile = $event.target.files[0]" />
            </div>
          </div>
          <p v-if="uploadError" class="error-text">{{ uploadError }}</p>
          <button type="submit" :disabled="uploading">{{ uploading ? 'Envoi…' : 'Envoyer' }}</button>
        </form>
      </div>

      <div class="card">
        <h2>Historique</h2>
        <div v-if="!history.length" class="muted">Aucun historique pour l'instant.</div>
        <table v-else>
          <thead>
            <tr><th>Quand</th><th>Qui</th><th>Étape</th><th>Statut</th></tr>
          </thead>
          <tbody>
            <tr v-for="h in history" :key="h.id">
              <td>{{ formatDate(h.changed_at) }}</td>
              <td>{{ h.changed_by }}</td>
              <td>{{ h.old_step || '—' }} → {{ h.new_step || '—' }}</td>
              <td>{{ statusLabel(h.old_status) }} → {{ statusLabel(h.new_status) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
