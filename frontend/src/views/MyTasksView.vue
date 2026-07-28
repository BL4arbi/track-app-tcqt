<script setup>
import { ref, onMounted, reactive } from 'vue';
import { api } from '../api/client';
import ClientSelect from '../components/ClientSelect.vue';

const tasks = ref([]);
const loading = ref(true);
const error = ref('');
const editingId = ref(null);
const editDraft = reactive({});

const newTask = reactive({ client_id: '', title: '', current_step: '', next_step: '', due_date: '' });
const creating = ref(false);
const createError = ref('');

const STATUS_LABELS = { active: 'Actif', paused: 'En pause', done: 'Terminé' };

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/api/tasks/mine');
    tasks.value = data.tasks;
  } catch (e) {
    error.value = e.response?.data?.error || 'Échec du chargement de vos tâches';
  } finally {
    loading.value = false;
  }
}

async function createTask() {
  createError.value = '';
  if (!newTask.client_id || !newTask.title) {
    createError.value = 'Le client et le titre sont obligatoires';
    return;
  }
  creating.value = true;
  try {
    await api.post('/api/tasks', { ...newTask, due_date: newTask.due_date || null });
    newTask.client_id = '';
    newTask.title = '';
    newTask.current_step = '';
    newTask.next_step = '';
    newTask.due_date = '';
    await load();
  } catch (e) {
    createError.value = e.response?.data?.error || 'Échec de la création de la tâche';
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
    due_date: t.due_date || '',
    status: t.status,
  });
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit(id) {
  await api.patch(`/api/tasks/${id}`, { ...editDraft, due_date: editDraft.due_date || null });
  editingId.value = null;
  await load();
}

onMounted(load);
</script>

<template>
  <div>
    <h1>Mes tâches</h1>

    <div class="card">
      <h2>Nouvelle tâche</h2>
      <form @submit.prevent="createTask">
        <div class="form-row">
          <div class="field">
            <label>Client</label>
            <ClientSelect v-model="newTask.client_id" />
          </div>
          <div class="field">
            <label>Titre</label>
            <input v-model="newTask.title" placeholder="ex. Refonte du support" required />
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label>Étape actuelle</label>
            <input v-model="newTask.current_step" placeholder="ex. Modélisation 3D" />
          </div>
          <div class="field">
            <label>Étape suivante</label>
            <input v-model="newTask.next_step" placeholder="ex. Commande de la pièce" />
          </div>
          <div class="field">
            <label>Date prévue</label>
            <input v-model="newTask.due_date" type="date" />
          </div>
        </div>
        <p v-if="createError" class="error-text">{{ createError }}</p>
        <button type="submit" :disabled="creating">{{ creating ? 'Création…' : 'Créer la tâche' }}</button>
      </form>
    </div>

    <p v-if="loading" class="muted">Chargement…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>
    <p v-else-if="!tasks.length" class="muted">Vous n'avez pas encore de tâche.</p>

    <table v-else>
      <thead>
        <tr>
          <th>Client</th>
          <th>Tâche</th>
          <th>Étape actuelle</th>
          <th>Étape suivante</th>
          <th>Date prévue</th>
          <th>Statut</th>
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
            <td>{{ t.due_date || '—' }}</td>
            <td><span class="badge" :class="t.status">{{ STATUS_LABELS[t.status] }}</span></td>
            <td><button class="secondary" @click="startEdit(t)">Modifier</button></td>
          </tr>
          <tr v-else>
            <td>{{ t.client_name }}</td>
            <td><input v-model="editDraft.title" /></td>
            <td><input v-model="editDraft.current_step" /></td>
            <td><input v-model="editDraft.next_step" /></td>
            <td><input v-model="editDraft.due_date" type="date" /></td>
            <td>
              <select v-model="editDraft.status">
                <option value="active">Actif</option>
                <option value="paused">En pause</option>
                <option value="done">Terminé</option>
              </select>
            </td>
            <td style="white-space:nowrap">
              <button @click="saveEdit(t.id)">Enregistrer</button>
              <button class="secondary" @click="cancelEdit">Annuler</button>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
