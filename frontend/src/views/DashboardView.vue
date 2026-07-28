<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api/client';

const tasks = ref([]);
const loading = ref(true);
const error = ref('');

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/api/tasks');
    tasks.value = data.tasks;
  } catch (e) {
    error.value = e.response?.data?.error || 'Failed to load tasks';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="toolbar">
      <h1>Dashboard — active tasks</h1>
      <button class="secondary" @click="load">Refresh</button>
    </div>

    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>
    <p v-else-if="!tasks.length" class="muted">No active tasks right now.</p>

    <table v-else>
      <thead>
        <tr>
          <th>Who</th>
          <th>Client</th>
          <th>Task</th>
          <th>Current step</th>
          <th>Next step</th>
          <th>Last updated</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in tasks" :key="t.id">
          <td>{{ t.assigned_user_name }}</td>
          <td>{{ t.client_name }}</td>
          <td><RouterLink :to="`/tasks/${t.id}`">{{ t.title }}</RouterLink></td>
          <td>{{ t.current_step || '—' }}</td>
          <td>{{ t.next_step || '—' }}</td>
          <td>{{ formatDate(t.updated_at) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
