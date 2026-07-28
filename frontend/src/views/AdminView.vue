<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

const auth = useAuthStore();

const overview = ref(null);
const users = ref([]);
const loading = ref(true);
const error = ref('');
const savingId = ref(null);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [overviewRes, usersRes] = await Promise.all([
      api.get('/api/admin/overview'),
      api.get('/api/users'),
    ]);
    overview.value = overviewRes.data;
    users.value = usersRes.data.users;
  } catch (e) {
    error.value = e.response?.data?.error || 'Failed to load admin data';
  } finally {
    loading.value = false;
  }
}

async function updateUser(user, changes) {
  savingId.value = user.id;
  try {
    const { data } = await api.patch(`/api/users/${user.id}`, changes);
    Object.assign(user, data.user);
  } catch (e) {
    error.value = e.response?.data?.error || 'Failed to update user';
  } finally {
    savingId.value = null;
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString();
}

onMounted(load);
</script>

<template>
  <div>
    <h1>Admin</h1>
    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>

    <template v-else>
      <div class="card">
        <h2>Overview</h2>
        <div class="form-row" style="margin-bottom:16px">
          <div class="field"><label>Users</label><div>{{ overview.totals.active_users }} active / {{ overview.totals.total_users }} total</div></div>
          <div class="field"><label>Clients</label><div>{{ overview.totals.total_clients }}</div></div>
          <div class="field"><label>Tasks</label><div>{{ overview.totals.total_tasks }}</div></div>
        </div>

        <div class="form-row">
          <div style="flex:1">
            <h2 style="font-size:14px">Tasks by status</h2>
            <table>
              <tbody>
                <tr v-for="s in overview.tasks_by_status" :key="s.status">
                  <td><span class="badge" :class="s.status">{{ s.status }}</span></td>
                  <td>{{ s.count }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="flex:1">
            <h2 style="font-size:14px">Active tasks by client</h2>
            <table>
              <tbody>
                <tr v-for="c in overview.tasks_by_client" :key="c.client_name">
                  <td>{{ c.client_name }}</td>
                  <td>{{ c.active_tasks }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="flex:1">
            <h2 style="font-size:14px">Active tasks per person</h2>
            <table>
              <tbody>
                <tr v-for="u in overview.tasks_by_user" :key="u.full_name">
                  <td>{{ u.full_name }}</td>
                  <td>{{ u.active_tasks }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p class="muted" style="margin-top:12px">
          Deeper stats (time per step, bottlenecks) come later once there's more history — see the phase 2 notes.
        </p>
      </div>

      <div class="card">
        <h2>Team ({{ users.length }})</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Verified</th>
              <th>Active</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>{{ u.full_name }}</td>
              <td>{{ u.company_email }}</td>
              <td>
                <select
                  :value="u.role"
                  :disabled="savingId === u.id || u.id === auth.user.id"
                  @change="updateUser(u, { role: $event.target.value })"
                >
                  <option value="engineer">engineer</option>
                  <option value="manager">manager</option>
                </select>
              </td>
              <td>{{ u.email_verified ? 'Yes' : 'No' }}</td>
              <td>
                <label style="display:flex; align-items:center; gap:6px; font-weight:normal">
                  <input
                    type="checkbox"
                    :checked="u.active"
                    :disabled="savingId === u.id || u.id === auth.user.id"
                    @change="updateUser(u, { active: $event.target.checked })"
                  />
                  {{ u.active ? 'Active' : 'Deactivated' }}
                </label>
              </td>
              <td>{{ formatDate(u.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
