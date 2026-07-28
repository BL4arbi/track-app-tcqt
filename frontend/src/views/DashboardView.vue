<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api/client';
import { buildUserColorMap, initials } from '../utils/userColors';

const tasks = ref([]);
const users = ref([]);
const loading = ref(true);
const error = ref('');

const userColors = computed(() => buildUserColorMap(users.value));

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR');
}
function formatDueDate(dateKey) {
  if (!dateKey) return '—';
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
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

onMounted(load);
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

    <table v-else>
      <thead>
        <tr>
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
        <tr v-for="t in tasks" :key="t.id">
          <td>
            <span class="user-chip">
              <span class="user-avatar" :style="{ background: userColors.get(t.assigned_user_id) }">{{ initials(t.assigned_user_name) }}</span>
              {{ t.assigned_user_name }}
            </span>
          </td>
          <td>{{ t.client_name }}</td>
          <td><RouterLink :to="`/tasks/${t.id}`">{{ t.title }}</RouterLink></td>
          <td>{{ t.current_step || '—' }}</td>
          <td>{{ t.next_step || '—' }}</td>
          <td>{{ formatDueDate(t.due_date) }}</td>
          <td>{{ formatDate(t.updated_at) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
