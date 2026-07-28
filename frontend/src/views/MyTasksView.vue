<script setup>
import { ref, onMounted, reactive } from 'vue';
import { api } from '../api/client';
import ClientSelect from '../components/ClientSelect.vue';

const tasks = ref([]);
const loading = ref(true);
const error = ref('');
const editingId = ref(null);
const editDraft = reactive({});

const newTask = reactive({ client_id: '', title: '', current_step: '', next_step: '' });
const creating = ref(false);
const createError = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/api/tasks/mine');
    tasks.value = data.tasks;
  } catch (e) {
    error.value = e.response?.data?.error || 'Failed to load your tasks';
  } finally {
    loading.value = false;
  }
}

async function createTask() {
  createError.value = '';
  if (!newTask.client_id || !newTask.title) {
    createError.value = 'Client and title are required';
    return;
  }
  creating.value = true;
  try {
    await api.post('/api/tasks', { ...newTask });
    newTask.client_id = '';
    newTask.title = '';
    newTask.current_step = '';
    newTask.next_step = '';
    await load();
  } catch (e) {
    createError.value = e.response?.data?.error || 'Failed to create task';
  } finally {
    creating.value = false;
  }
}

function startEdit(t) {
  editingId.value = t.id;
  Object.assign(editDraft, {
    title: t.title,
    current_step: t.current_step || '',
    next_step: t.next_step || '',
    status: t.status,
  });
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit(id) {
  await api.patch(`/api/tasks/${id}`, { ...editDraft });
  editingId.value = null;
  await load();
}

onMounted(load);
</script>

<template>
  <div>
    <h1>My tasks</h1>

    <div class="card">
      <h2>New task</h2>
      <form @submit.prevent="createTask">
        <div class="form-row">
          <div class="field">
            <label>Client</label>
            <ClientSelect v-model="newTask.client_id" />
          </div>
          <div class="field">
            <label>Title</label>
            <input v-model="newTask.title" placeholder="e.g. Bracket redesign" required />
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label>Current step</label>
            <input v-model="newTask.current_step" placeholder="e.g. 3D modeling" />
          </div>
          <div class="field">
            <label>Next step</label>
            <input v-model="newTask.next_step" placeholder="e.g. Send for client review" />
          </div>
        </div>
        <p v-if="createError" class="error-text">{{ createError }}</p>
        <button type="submit" :disabled="creating">{{ creating ? 'Creating…' : 'Create task' }}</button>
      </form>
    </div>

    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>
    <p v-else-if="!tasks.length" class="muted">You have no tasks yet.</p>

    <table v-else>
      <thead>
        <tr>
          <th>Client</th>
          <th>Task</th>
          <th>Current step</th>
          <th>Next step</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="t in tasks" :key="t.id">
          <tr v-if="editingId !== t.id">
            <td>{{ t.client_name }}</td>
            <td><RouterLink :to="`/tasks/${t.id}`">{{ t.title }}</RouterLink></td>
            <td>{{ t.current_step || '—' }}</td>
            <td>{{ t.next_step || '—' }}</td>
            <td><span class="badge" :class="t.status">{{ t.status }}</span></td>
            <td><button class="secondary" @click="startEdit(t)">Edit</button></td>
          </tr>
          <tr v-else>
            <td>{{ t.client_name }}</td>
            <td><input v-model="editDraft.title" /></td>
            <td><input v-model="editDraft.current_step" /></td>
            <td><input v-model="editDraft.next_step" /></td>
            <td>
              <select v-model="editDraft.status">
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="done">done</option>
              </select>
            </td>
            <td style="white-space:nowrap">
              <button @click="saveEdit(t.id)">Save</button>
              <button class="secondary" @click="cancelEdit">Cancel</button>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
