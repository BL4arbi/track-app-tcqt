<script setup>
import { ref, onMounted, reactive, computed } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import ClientSelect from '../components/ClientSelect.vue';
import { WORKFLOW_STEPS } from '../utils/workflowSteps';

const auth = useAuthStore();
const tasks = ref([]);
const teamMembers = ref([]);
const loading = ref(true);
const error = ref('');
const editingId = ref(null);
const editDraft = reactive({});
const deletingId = ref(null);
const deleteError = ref('');

const newTask = reactive({
  client_id: '', title: '', label: '', current_step: '', due_date: '', final_date: '',
  parent_task_id: '', assigned_user_id: auth.user?.id || '',
});
const creating = ref(false);
const createError = ref('');

const STATUS_LABELS = { active: 'En cours', paused: 'En pause', done: 'Terminé' };

const parentOptions = computed(() => (excludeId) => tasks.value.filter((t) => t.id !== excludeId));

const todayKey = new Date().toISOString().slice(0, 10);
// final_date, due_date, and a manually-set reminder_date are all "watch
// this date" signals — surface whichever is soonest.
const reminderKey = (t) => {
  const dates = [t.final_date, t.due_date, t.reminder_date].filter(Boolean).sort();
  return dates[0] || null;
};
const overdueTasks = computed(() =>
  tasks.value.filter((t) => t.status === 'active' && reminderKey(t) && reminderKey(t) < todayKey)
);
const upcomingTasks = computed(() => {
  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const in7DaysKey = in7Days.toISOString().slice(0, 10);
  return tasks.value.filter(
    (t) => t.status === 'active' && reminderKey(t) && reminderKey(t) >= todayKey && reminderKey(t) <= in7DaysKey
  );
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const requests = [api.get('/api/tasks/mine')];
    if (auth.isManager) requests.push(api.get('/api/users/directory'));
    const [tasksRes, teamRes] = await Promise.all(requests);
    tasks.value = tasksRes.data.tasks;
    if (teamRes) teamMembers.value = teamRes.data.users;
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
    await api.post('/api/tasks', {
      ...newTask,
      due_date: newTask.due_date || null,
      final_date: newTask.final_date || null,
      parent_task_id: newTask.parent_task_id || null,
    });
    newTask.client_id = '';
    newTask.title = '';
    newTask.label = '';
    newTask.current_step = '';
    newTask.due_date = '';
    newTask.final_date = '';
    newTask.parent_task_id = '';
    newTask.assigned_user_id = auth.user?.id || '';
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
    label: t.label || '',
    current_step: t.current_step || '',
    due_date: t.due_date || '',
    final_date: t.final_date || '',
    parent_task_id: t.parent_task_id || '',
    status: t.status,
    assigned_user_id: t.assigned_user_id,
  });
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit(id) {
  await api.patch(`/api/tasks/${id}`, {
    ...editDraft,
    due_date: editDraft.due_date || null,
    final_date: editDraft.final_date || null,
    parent_task_id: editDraft.parent_task_id || null,
  });
  editingId.value = null;
  await load();
}

async function deleteTask(t) {
  if (!confirm(`Supprimer la tâche "${t.title}" ? Cette action est irréversible et supprime aussi ses documents.`)) return;
  deletingId.value = t.id;
  deleteError.value = '';
  try {
    await api.delete(`/api/tasks/${t.id}`);
    await load();
  } catch (e) {
    deleteError.value = e.response?.data?.error || 'Échec de la suppression';
  } finally {
    deletingId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <h1>Mes tâches</h1>

    <div v-if="overdueTasks.length || upcomingTasks.length" class="card reminder-card">
      <h2>Rappels</h2>
      <ul class="reminder-list">
        <li v-for="t in overdueTasks" :key="'overdue-' + t.id" class="reminder-overdue">
          <RouterLink :to="`/tasks/${t.id}`">{{ t.title }}</RouterLink>
          — en retard (échéance {{ reminderKey(t) }})
        </li>
        <li v-for="t in upcomingTasks" :key="'upcoming-' + t.id">
          <RouterLink :to="`/tasks/${t.id}`">{{ t.title }}</RouterLink>
          — échéance proche ({{ reminderKey(t) }})
        </li>
      </ul>
    </div>

    <div class="card">
      <h2>Nouvelle tâche</h2>
      <form @submit.prevent="createTask">
        <div class="form-row">
          <div class="field">
            <label>Client</label>
            <ClientSelect v-model="newTask.client_id" />
          </div>
          <div class="field">
            <label>Numéro d'affaire</label>
            <input v-model="newTask.title" placeholder="ex. 26-0142" required />
          </div>
          <div class="field">
            <label>Titre</label>
            <input v-model="newTask.label" placeholder="ex. Banc essai XL" />
          </div>
          <div class="field">
            <label>Étape actuelle</label>
            <select v-model="newTask.current_step">
              <option value="">—</option>
              <option v-for="s in WORKFLOW_STEPS" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label>Date exécution chantier</label>
            <input v-model="newTask.due_date" type="date" />
          </div>
          <div class="field">
            <label>Date finale</label>
            <input v-model="newTask.final_date" type="date" />
          </div>
          <div class="field">
            <label>Tâche parente</label>
            <select v-model="newTask.parent_task_id">
              <option value="">— aucune —</option>
              <option v-for="t in parentOptions(null)" :key="t.id" :value="t.id">{{ t.title }}</option>
            </select>
          </div>
          <div v-if="auth.isManager" class="field">
            <label>Assigné à</label>
            <select v-model="newTask.assigned_user_id">
              <option v-for="m in teamMembers" :key="m.id" :value="m.id">{{ m.full_name }}</option>
            </select>
          </div>
        </div>
        <p v-if="createError" class="error-text">{{ createError }}</p>
        <button type="submit" :disabled="creating">{{ creating ? 'Création…' : 'Créer la tâche' }}</button>
      </form>
    </div>

    <p v-if="loading" class="muted">Chargement…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>
    <p v-else-if="!tasks.length" class="muted">Vous n'avez pas encore de tâche.</p>
    <p v-if="deleteError" class="error-text">{{ deleteError }}</p>

    <table v-else>
      <thead>
        <tr>
          <th>Client</th>
          <th>N° d'affaire</th>
          <th>Titre</th>
          <th>Étape actuelle</th>
          <th>Étape suivante</th>
          <th>Date exéc. chantier</th>
          <th>Date finale</th>
          <th>Statut</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="t in tasks" :key="t.id">
          <tr v-if="editingId !== t.id">
            <td>{{ t.client_name }}</td>
            <td>
              <RouterLink :to="`/tasks/${t.id}`">{{ t.title }}</RouterLink>
              <div v-if="t.parent_task_id" class="muted">↳ sous-tâche de « {{ t.parent_title }} »</div>
            </td>
            <td>{{ t.label || '—' }}</td>
            <td>{{ t.current_step || '—' }}</td>
            <td>{{ t.next_step || '—' }}</td>
            <td>{{ t.due_date || '—' }}</td>
            <td>{{ t.final_date || '—' }}</td>
            <td><span class="badge" :class="t.status">{{ STATUS_LABELS[t.status] }}</span></td>
            <td style="white-space:nowrap">
              <button class="secondary" @click="startEdit(t)">Modifier</button>
              <button
                type="button"
                class="link-button"
                style="color:var(--danger); margin-left:8px"
                :disabled="deletingId === t.id"
                @click="deleteTask(t)"
              >
                {{ deletingId === t.id ? 'Suppression…' : 'Supprimer' }}
              </button>
            </td>
          </tr>
          <tr v-else>
            <td>{{ t.client_name }}</td>
            <td><input v-model="editDraft.title" /></td>
            <td><input v-model="editDraft.label" placeholder="Titre" /></td>
            <td>
              <select v-model="editDraft.current_step">
                <option value="">—</option>
                <option v-for="s in WORKFLOW_STEPS" :key="s" :value="s">{{ s }}</option>
              </select>
            </td>
            <td class="muted">(auto)</td>
            <td><input v-model="editDraft.due_date" type="date" /></td>
            <td><input v-model="editDraft.final_date" type="date" /></td>
            <td>
              <select v-model="editDraft.status">
                <option value="active">En cours</option>
                <option value="paused">En pause</option>
                <option value="done">Terminé</option>
              </select>
            </td>
            <td style="white-space:nowrap">
              <button @click="saveEdit(t.id)">Enregistrer</button>
              <button class="secondary" @click="cancelEdit">Annuler</button>
            </td>
          </tr>
          <tr v-if="editingId === t.id">
            <td colspan="9" style="border-top:none; padding-top:0">
              <div class="form-row">
                <div class="field">
                  <label style="font-size:13px; font-weight:600">Tâche parente</label>
                  <select v-model="editDraft.parent_task_id">
                    <option value="">— aucune —</option>
                    <option v-for="pt in parentOptions(t.id)" :key="pt.id" :value="pt.id">{{ pt.title }}</option>
                  </select>
                </div>
                <div v-if="auth.isManager" class="field">
                  <label style="font-size:13px; font-weight:600">Assigné à</label>
                  <select v-model="editDraft.assigned_user_id">
                    <option v-for="m in teamMembers" :key="m.id" :value="m.id">{{ m.full_name }}</option>
                  </select>
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
