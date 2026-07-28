<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api/client';

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

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

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
    error.value = e.response?.data?.error || 'Failed to load task';
  } finally {
    loading.value = false;
  }
}

async function upload() {
  uploadError.value = '';
  if (!nativeFile.value) {
    uploadError.value = 'Select the native SolidWorks file (or PDF) to upload';
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
    uploadError.value = e.response?.data?.error || 'Upload failed';
  } finally {
    uploading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>

    <template v-else-if="task">
      <div class="toolbar">
        <h1>{{ task.title }}</h1>
        <span class="badge" :class="task.status">{{ task.status }}</span>
      </div>

      <div class="card">
        <p><strong>Client:</strong> {{ task.client_name }}</p>
        <p><strong>Assigned to:</strong> {{ task.assigned_user_name }}</p>
        <p><strong>Current step:</strong> {{ task.current_step || '—' }}</p>
        <p><strong>Next step:</strong> {{ task.next_step || '—' }}</p>
        <p class="muted">Last updated {{ formatDate(task.updated_at) }}</p>
      </div>

      <div class="card">
        <h2>Documents</h2>
        <div v-if="!documents.length" class="muted">No documents uploaded yet.</div>
        <div v-for="doc in documents" :key="doc.id" class="doc-row">
          <img v-if="previewUrl(doc)" :src="previewUrl(doc)" class="preview-thumb" :alt="doc.original_filename" />
          <div v-else class="preview-thumb" style="display:flex;align-items:center;justify-content:center;font-size:11px" >no preview</div>
          <div style="flex:1">
            <div>{{ doc.original_filename }}</div>
            <div class="muted">{{ doc.file_type.toUpperCase() }} · uploaded by {{ doc.uploaded_by }} · {{ formatDate(doc.uploaded_at) }}</div>
          </div>
          <a :href="downloadUrl(doc)">Download</a>
        </div>

        <form @submit.prevent="upload" style="margin-top:16px">
          <div class="form-row">
            <div class="field">
              <label>Native file (.sldprt / .sldasm / .slddrw / .pdf)</label>
              <input type="file" accept=".sldprt,.sldasm,.slddrw,.pdf" @change="nativeFile = $event.target.files[0]" />
            </div>
            <div class="field">
              <label>Preview image (.png / .jpg)</label>
              <input type="file" accept=".png,.jpg,.jpeg" @change="previewFile = $event.target.files[0]" />
            </div>
          </div>
          <p v-if="uploadError" class="error-text">{{ uploadError }}</p>
          <button type="submit" :disabled="uploading">{{ uploading ? 'Uploading…' : 'Upload' }}</button>
        </form>
      </div>

      <div class="card">
        <h2>History</h2>
        <div v-if="!history.length" class="muted">No history yet.</div>
        <table v-else>
          <thead>
            <tr><th>When</th><th>Who</th><th>Step</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr v-for="h in history" :key="h.id">
              <td>{{ formatDate(h.changed_at) }}</td>
              <td>{{ h.changed_by }}</td>
              <td>{{ h.old_step || '—' }} → {{ h.new_step || '—' }}</td>
              <td>{{ h.old_status || '—' }} → {{ h.new_status || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
